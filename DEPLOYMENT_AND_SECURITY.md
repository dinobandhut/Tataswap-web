# TataSwap DEX — Architecture, Deployment & Security Guide

> **Audit Disclosure**: TataSwap smart contracts use OpenZeppelin v5 (`Ownable2Step`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `ERC20`) and follow established constant-product AMM invariants. **No independent third-party smart contract security audit has been performed yet.** Do not deploy to any mainnet before completing an independent audit and full BNB Smart Chain Testnet verification.

---

## 1. Official Protocol Defaults

- **Official Fee Receiver Wallet**: `0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4`
- **Default Listing Fee**: `5 USDT` (transferred atomically on-chain directly from the listing wallet to the fee receiver wallet; zero centralized fee custody)
- **Primary Testnet**: BNB Smart Chain Testnet (`chainId: 97`)
- **Prepared Multi-Chain Networks**: BNB Smart Chain (`56`), Ethereum (`1`), Polygon (`137`), Base (`8453`), Arbitrum (`42161`)

---

## 2. Smart Contracts Overview (`/contracts`)

1. **`TataSwapFeeManager.sol`**: Manages capped swap fee bps (`MAX_TOTAL_FEE_BPS = 100`, default `30` bps = `0.30%`), protocol fee share (`5` bps = `0.05%`), `protocolFeeReceiver`, and emergency `pause()` / `unpause()`.
2. **`TataSwapFactory.sol`**: Permissionless pair factory (`createPair`) using deterministic `CREATE2` salts.
3. **`TataSwapPool.sol`**: Constant-product AMM LP token (`TATA-LP`) & reserve pool with `ReentrancyGuard`, `SafeERC20`, `MINIMUM_LIQUIDITY`, and direct protocol fee routing.
4. **`TataSwapRouter.sol`**: Supports `addLiquidity`, `addLiquidityETH`, `removeLiquidity`, `swapExactTokensForTokens`, `swapExactETHForTokens`, `swapExactTokensForETH` with slippage (`amountOutMin`) and deadline protection.
5. **`TataSwapListingFee.sol`**: Permissionless ERC-20 / BEP-20 listing registry. Verifies contract bytecode & metadata on-chain (`name`, `symbol`, `decimals`, `totalSupply`), collects the configured fee directly to `feeReceiverWallet`, optionally creates the trading pair in `TataSwapFactory`, and reverts atomically if any step fails.

---

## 3. Local Hardhat Testing & BNB Testnet Deployment

Install Hardhat tooling in a separate directory or dev environment (keeps runtime container lightweight):

```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox chai
```

Compile and run all unit & integration tests locally:

```bash
npx hardhat compile
npx hardhat test
```

Deploy to **BNB Smart Chain Testnet (Chain ID 97)** (ensure `DEPLOYER_PRIVATE_KEY` is set in local `.env` with tBNB gas funds; never commit keys):

```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

Verify deployed contracts on BscScan Testnet:

```bash
npx hardhat verify --network bscTestnet <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS...>
```

After deployment, register the deployed contract addresses (`TataSwapFactory`, `TataSwapRouter`, `TataSwapListingFee`, `TataSwapFeeManager`) in `.env` or via the **Admin Dashboard** (authenticated with Firebase Google Sign-In + owner wallet EIP-191 signature).

---

## 4. Backend API Documentation (`server.ts`)

| Endpoint | Method | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Public | Server & RPC liveness |
| `/api/networks` | `GET` | Public | Supported blockchains & contract addresses |
| `/api/tokens` | `GET` | Public | Search & list indexed tokens (`?chainId=&q=`) |
| `/api/tokens/inspect` | `POST` | Public (Rate-limited) | Real on-chain `eth_getCode`, `name`, `symbol`, `decimals`, `totalSupply` verification |
| `/api/tokens/list` | `POST` | Public (Rate-limited) | Verifies on-chain `txHash` receipt & `ListingFeeCollected` / `Transfer` logs before indexing token |
| `/api/tokens/:chainId/:address` | `GET` | Public | Live RPC + indexed token details |
| `/api/pools` | `GET` | Public | Indexed liquidity pools with live RPC reserve refresh |
| `/api/pools/sync` | `POST` | Public (Rate-limited) | Verifies on-chain `pairAddress` / `txHash` and indexes pool reserves |
| `/api/transactions` | `GET` | Public | Indexed verified on-chain transactions |
| `/api/transactions/verify` | `POST` | Public (Rate-limited) | Queries RPC `getTransactionReceipt` to confirm tx and index |
| `/api/analytics` | `GET` | Public | Aggregated protocol & listing fee metrics from verified records |
| `/api/admin/overview` | `GET` | Firebase Auth | Admin telemetry, fee collection history, and audit logs |
| `/api/admin/network` | `POST` | Firebase Auth + EIP-191 Wallet Sig | Updates network contract config / enablement |
| `/api/admin/token-verification` | `POST` | Firebase Auth + EIP-191 Wallet Sig | Updates token verification label (`verified` / `unverified` / `flagged`) |

---

## 5. Google Cloud Run & Cloud SQL Deployment

1. Provision Cloud SQL PostgreSQL and attach Cloud SQL Auth Proxy to the Cloud Run service.
2. Set runtime environment variables (`SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `BSC_TESTNET_RPC_URL`, deployed contract addresses).
3. Push schema via Drizzle Kit (`npx drizzle-kit push --config=src/db/drizzle.config.ts`).
4. Build frontend (`npm run build`) and deploy to Cloud Run (`npm start` runs `node server.ts` on port `3000`).

---

## 6. Pre-Mainnet Security Checklist

- [ ] Complete independent smart contract audit of all 5 contracts in `/contracts`.
- [ ] Run full BNB Smart Chain Testnet end-to-end test: list token -> pay 5 USDT -> verify `0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4` receipt -> create pair -> add liquidity -> swap -> remove liquidity -> pause/unpause emergency drill.
- [ ] Transfer contract ownership (`Ownable2Step`) from hot deployer EOA to a hardware-backed multi-sig wallet (e.g., Safe).
- [ ] Verify all contract source code on BscScan / Etherscan / Polygonscan / Basescan / Arbiscan.
- [ ] Enable dedicated archive/redundant RPC nodes with failover and rate-limiting before opening mainnet routing.
