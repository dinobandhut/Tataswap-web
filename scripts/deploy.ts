import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const OFFICIAL_FEE_RECEIVER = "0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4";

const CHAIN_CONFIG: Record<
  number,
  { weth: string; usdt: string; usdtDecimals: number; isMainnet: boolean }
> = {
  97: {
    // BNB Smart Chain Testnet
    weth: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    usdt: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    usdtDecimals: 18,
    isMainnet: false,
  },
  56: {
    // BNB Smart Chain Mainnet
    weth: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    usdt: "0x55d398326f99059fF775485246999027B3197955",
    usdtDecimals: 18,
    isMainnet: true,
  },
  1: {
    // Ethereum Mainnet
    weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    usdtDecimals: 6,
    isMainnet: true,
  },
  137: {
    // Polygon PoS
    weth: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    usdtDecimals: 6,
    isMainnet: true,
  },
  8453: {
    // Base
    weth: "0x4200000000000000000000000000000000000006",
    usdt: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    usdtDecimals: 6,
    isMainnet: true,
  },
  42161: {
    // Arbitrum One
    weth: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
    usdtDecimals: 6,
    isMainnet: true,
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const cfg = CHAIN_CONFIG[chainId];

  if (!cfg && chainId !== 31337) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  // Safety guard: never deploy to mainnet accidentally
  if (cfg?.isMainnet && process.env.CONFIRM_MAINNET_DEPLOY !== "YES_I_AUDITED_MAINNET") {
    throw new Error(
      `Mainnet deployment blocked on chain ${chainId}. Test on BNB Smart Chain Testnet (97) first and set CONFIRM_MAINNET_DEPLOY=YES_I_AUDITED_MAINNET after completing the security audit.`
    );
  }

  let wethAddress = cfg?.weth;
  let usdtAddress = cfg?.usdt;
  const usdtDecimals = cfg?.usdtDecimals ?? 18;

  if (chainId === 31337) {
    const MockWETH = await ethers.getContractFactory("MockWETH");
    const mockWeth = await MockWETH.deploy();
    await mockWeth.waitForDeployment();
    wethAddress = await mockWeth.getAddress();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUsdt = await MockERC20.deploy(
      "Tether USD",
      "USDT",
      18,
      ethers.parseUnits("1000000", 18)
    );
    await mockUsdt.waitForDeployment();
    usdtAddress = await mockUsdt.getAddress();
  }

  const feeReceiver = process.env.TATASWAP_ADMIN_WALLET || OFFICIAL_FEE_RECEIVER;
  const listingFeeAmount = ethers.parseUnits(
    process.env.TATASWAP_DEFAULT_LISTING_FEE_USDT || "5",
    usdtDecimals
  );

  console.log(`Deploying TataSwap to ${network.name} (chainId: ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Official Fee Receiver: ${feeReceiver}`);

  // 1. Deploy FeeManager (0.30% swap fee, 0.05% protocol fee)
  const FeeManager = await ethers.getContractFactory("TataSwapFeeManager");
  const feeManager = await FeeManager.deploy(deployer.address, feeReceiver, 30, 5);
  await feeManager.waitForDeployment();
  const feeManagerAddress = await feeManager.getAddress();

  // 2. Deploy Factory
  const Factory = await ethers.getContractFactory("TataSwapFactory");
  const factory = await Factory.deploy(deployer.address, feeManagerAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();

  // 3. Deploy Router
  const Router = await ethers.getContractFactory("TataSwapRouter");
  const router = await Router.deploy(factoryAddress, wethAddress!, feeManagerAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();

  // 4. Deploy ListingFee
  const ListingFee = await ethers.getContractFactory("TataSwapListingFee");
  const listingFee = await ListingFee.deploy(
    deployer.address,
    feeReceiver,
    usdtAddress!,
    listingFeeAmount,
    factoryAddress
  );
  await listingFee.waitForDeployment();
  const listingFeeAddress = await listingFee.getAddress();

  const manifest = {
    network: network.name,
    chainId,
    deployedAt: new Date().toISOString(),
    feeReceiver,
    listingFeeUsdt: process.env.TATASWAP_DEFAULT_LISTING_FEE_USDT || "5",
    contracts: {
      TataSwapFeeManager: feeManagerAddress,
      TataSwapFactory: factoryAddress,
      TataSwapRouter: routerAddress,
      TataSwapListingFee: listingFeeAddress,
      WETH: wethAddress,
      USDT: usdtAddress,
    },
  };

  console.log("Deployment Manifest:", JSON.stringify(manifest, null, 2));

  const outDir = path.join(process.cwd(), "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${chainId}.json`),
    JSON.stringify(manifest, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
