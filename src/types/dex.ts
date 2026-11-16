export type PageRoute =
  | 'home'
  | 'swap'
  | 'explore'
  | 'token-details'
  | 'list-token'
  | 'create-pool'
  | 'add-liquidity'
  | 'remove-liquidity'
  | 'portfolio'
  | 'history'
  | 'analytics'
  | 'admin';

export interface NetworkConfig {
  id: number;
  chainId: number;
  name: string;
  shortName: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeSymbol: string;
  wrappedNativeAddress: string;
  usdtAddress: string;
  isTestnet: boolean;
  isEnabled: boolean;
  isPaused: boolean;
  factoryAddress: string;
  routerAddress: string;
  listingFeeContract: string;
  feeManagerContract: string;
  listingFeeUsdt: string;
  feeReceiverWallet: string;
  acceptedPaymentToken: string;
  swapFeeBps: number;
  protocolFeeBps: number;
}

export interface IndexedToken {
  id: number;
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  logoUrl: string;
  listedByWallet: string;
  listingTxHash: string;
  listingFeePaid: string;
  feePaymentToken: string;
  feeReceiverWallet: string;
  verificationStatus: 'verified' | 'unverified' | 'flagged' | string;
  onChainVerified: boolean;
  pairAddress: string;
  txCount: number;
  createdAt: string;
}

export interface IndexedPool {
  id: number;
  chainId: number;
  pairAddress: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  feeTierBps: number;
  creatorWallet: string;
  creationTxHash: string;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
  txCount: number;
  lastSyncedBlock: number;
  createdAt: string;
}

export interface IndexedTransaction {
  id: number;
  chainId: number;
  txHash: string;
  txType: string;
  walletAddress: string;
  tokenInAddress: string;
  tokenInSymbol: string;
  tokenOutAddress: string;
  tokenOutSymbol: string;
  amountIn: string;
  amountOut: string;
  feeAmount: string;
  feeToken: string;
  pairAddress: string;
  blockNumber: number;
  status: string;
  verifiedOnChain: boolean;
  createdAt: string;
}

export interface ListingFeeRecord {
  id: number;
  chainId: number;
  txHash: string;
  listerWallet: string;
  tokenAddress: string;
  tokenSymbol: string;
  paymentTokenAddress: string;
  paymentSymbol: string;
  amountPaid: string;
  receiverWallet: string;
  blockNumber: number;
  verifiedOnChain: boolean;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalListedTokens: number;
  totalPools: number;
  totalTransactions: number;
  totalSwaps: number;
  totalListingFeesCollected: string;
  totalProtocolFeesRecorded: string;
  officialFeeReceiver: string;
}
