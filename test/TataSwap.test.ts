import { expect } from "chai";
import { ethers } from "hardhat";

const OFFICIAL_FEE_RECEIVER = "0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4";

describe("TataSwap DEX Suite", function () {
  async function deployFixture() {
    const [owner, lister, trader, lpProvider, attacker] = await ethers.getSigners();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    const weth = await MockWETH.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdt = await MockERC20.deploy("Tether USD", "USDT", 18, ethers.parseUnits("1000000", 18));
    const tokenA = await MockERC20.deploy("Alpha Token", "ALPHA", 18, ethers.parseUnits("1000000", 18));
    const tokenB = await MockERC20.deploy("Beta Token", "BETA", 18, ethers.parseUnits("1000000", 18));

    // Fund test users
    await usdt.transfer(lister.address, ethers.parseUnits("500", 18));
    await tokenA.transfer(lpProvider.address, ethers.parseUnits("10000", 18));
    await tokenB.transfer(lpProvider.address, ethers.parseUnits("10000", 18));
    await tokenA.transfer(trader.address, ethers.parseUnits("1000", 18));

    const FeeManager = await ethers.getContractFactory("TataSwapFeeManager");
    const feeManager = await FeeManager.deploy(owner.address, OFFICIAL_FEE_RECEIVER, 30, 5);

    const Factory = await ethers.getContractFactory("TataSwapFactory");
    const factory = await Factory.deploy(owner.address, await feeManager.getAddress());

    const Router = await ethers.getContractFactory("TataSwapRouter");
    const router = await Router.deploy(
      await factory.getAddress(),
      await weth.getAddress(),
      await feeManager.getAddress()
    );

    const ListingFee = await ethers.getContractFactory("TataSwapListingFee");
    const listingFee = await ListingFee.deploy(
      owner.address,
      OFFICIAL_FEE_RECEIVER,
      await usdt.getAddress(),
      ethers.parseUnits("5", 18),
      await factory.getAddress()
    );

    return {
      owner,
      lister,
      trader,
      lpProvider,
      attacker,
      weth,
      usdt,
      tokenA,
      tokenB,
      feeManager,
      factory,
      router,
      listingFee,
    };
  }

  describe("Permissionless Listing & Automatic 5 USDT Fee Collection", function () {
    it("collects 5 USDT directly to official fee receiver wallet and registers token", async function () {
      const { lister, usdt, tokenA, listingFee, factory } = await deployFixture();
      const feeAmount = ethers.parseUnits("5", 18);

      const beforeReceiver = await usdt.balanceOf(OFFICIAL_FEE_RECEIVER);
      await usdt.connect(lister).approve(await listingFee.getAddress(), feeAmount);

      await expect(
        listingFee.connect(lister).listToken(await tokenA.getAddress(), await usdt.getAddress())
      )
        .to.emit(listingFee, "ListingFeeCollected")
        .withArgs(
          lister.address,
          await tokenA.getAddress(),
          await usdt.getAddress(),
          feeAmount,
          OFFICIAL_FEE_RECEIVER,
          (ts: bigint) => ts > 0n
        );

      const afterReceiver = await usdt.balanceOf(OFFICIAL_FEE_RECEIVER);
      expect(afterReceiver - beforeReceiver).to.equal(feeAmount);

      const listing = await listingFee.listings(await tokenA.getAddress());
      expect(listing.exists).to.equal(true);
      expect(listing.symbol).to.equal("ALPHA");

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await usdt.getAddress());
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("reverts atomically if target address is not an ERC-20 contract so user never loses fee", async function () {
      const { lister, attacker, usdt, listingFee } = await deployFixture();
      const feeAmount = ethers.parseUnits("5", 18);

      await usdt.connect(lister).approve(await listingFee.getAddress(), feeAmount);
      const beforeLister = await usdt.balanceOf(lister.address);

      await expect(
        listingFee.connect(lister).listToken(attacker.address, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(listingFee, "NotAContract");

      const afterLister = await usdt.balanceOf(lister.address);
      expect(afterLister).to.equal(beforeLister);
    });

    it("restricts fee configuration and pause controls to owner only", async function () {
      const { attacker, listingFee, feeManager } = await deployFixture();
      await expect(
        listingFee.connect(attacker).setListingFee(ethers.parseUnits("10", 18))
      ).to.be.reverted;
      await expect(
        listingFee.connect(attacker).setFeeReceiverWallet(attacker.address)
      ).to.be.reverted;
      await expect(feeManager.connect(attacker).pause()).to.be.reverted;
    });
  });

  describe("AMM Liquidity Pools & Token Swaps", function () {
    it("allows permissionless liquidity provision, swap with protocol fee, and liquidity removal", async function () {
      const { lpProvider, trader, tokenA, tokenB, factory, router } = await deployFixture();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const amountA = ethers.parseUnits("1000", 18);
      const amountB = ethers.parseUnits("2000", 18);

      await tokenA.connect(lpProvider).approve(await router.getAddress(), amountA);
      await tokenB.connect(lpProvider).approve(await router.getAddress(), amountB);

      await router
        .connect(lpProvider)
        .addLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountA,
          amountB,
          0,
          0,
          lpProvider.address,
          deadline
        );

      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);

      const pair = await ethers.getContractAt("TataSwapPool", pairAddr);
      const lpBalance = await pair.balanceOf(lpProvider.address);
      expect(lpBalance).to.be.gt(0n);

      // Swap 100 ALPHA for BETA
      const swapIn = ethers.parseUnits("100", 18);
      await tokenA.connect(trader).approve(await router.getAddress(), swapIn);
      const path = [await tokenA.getAddress(), await tokenB.getAddress()];
      const amountsOut = await router.getAmountsOut(swapIn, path);

      const receiverFeeBefore = await tokenA.balanceOf(OFFICIAL_FEE_RECEIVER);
      await router
        .connect(trader)
        .swapExactTokensForTokens(swapIn, amountsOut[1], path, trader.address, deadline);

      const receiverFeeAfter = await tokenA.balanceOf(OFFICIAL_FEE_RECEIVER);
      // 0.05% protocol fee of 100 ALPHA = 0.05 ALPHA
      expect(receiverFeeAfter - receiverFeeBefore).to.equal(ethers.parseUnits("0.05", 18));

      // Remove liquidity
      await pair.connect(lpProvider).approve(await router.getAddress(), lpBalance);
      await router
        .connect(lpProvider)
        .removeLiquidity(
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          lpBalance,
          0,
          0,
          lpProvider.address,
          deadline
        );

      expect(await pair.balanceOf(lpProvider.address)).to.equal(0n);
    });
  });
});
