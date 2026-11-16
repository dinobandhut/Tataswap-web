import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminAuditLogs,
  listingFees,
  networks,
  pools,
  tokens,
  transactions,
  users,
} from './schema.ts';

export const OFFICIAL_FEE_RECEIVER = '0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4';

const DEFAULT_NETWORKS = [
  {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    shortName: 'BSC Testnet',
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    explorerUrl: 'https://testnet.bscscan.com',
    nativeSymbol: 'tBNB',
    wrappedNativeAddress: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    usdtAddress: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    isTestnet: true,
    isEnabled: true,
    isPaused: false,
    factoryAddress: process.env.TATASWAP_BSC_TESTNET_FACTORY || '',
    routerAddress: process.env.TATASWAP_BSC_TESTNET_ROUTER || '',
    listingFeeContract: process.env.TATASWAP_BSC_TESTNET_LISTING_FEE || '',
    feeManagerContract: process.env.TATASWAP_BSC_TESTNET_FEE_MANAGER || '',
    listingFeeUsdt: process.env.TATASWAP_DEFAULT_LISTING_FEE_USDT || '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    shortName: 'BSC',
    rpcUrl: process.env.BSC_MAINNET_RPC_URL || 'https://bsc-dataseed.bnbchain.org',
    explorerUrl: 'https://bscscan.com',
    nativeSymbol: 'BNB',
    wrappedNativeAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    usdtAddress: '0x55d398326f99059fF775485246999027B3197955',
    isTestnet: false,
    isEnabled: true,
    isPaused: false,
    factoryAddress: '',
    routerAddress: '',
    listingFeeContract: '',
    feeManagerContract: '',
    listingFeeUsdt: '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0x55d398326f99059fF775485246999027B3197955',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    rpcUrl: process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com',
    explorerUrl: 'https://etherscan.io',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    usdtAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    isTestnet: false,
    isEnabled: false,
    isPaused: false,
    factoryAddress: '',
    routerAddress: '',
    listingFeeContract: '',
    feeManagerContract: '',
    listingFeeUsdt: '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
  {
    chainId: 137,
    name: 'Polygon PoS',
    shortName: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-bor-rpc.publicnode.com',
    explorerUrl: 'https://polygonscan.com',
    nativeSymbol: 'POL',
    wrappedNativeAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    usdtAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    isTestnet: false,
    isEnabled: false,
    isPaused: false,
    factoryAddress: '',
    routerAddress: '',
    listingFeeContract: '',
    feeManagerContract: '',
    listingFeeUsdt: '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
  {
    chainId: 8453,
    name: 'Base',
    shortName: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0x4200000000000000000000000000000000000006',
    usdtAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    isTestnet: false,
    isEnabled: false,
    isPaused: false,
    factoryAddress: '',
    routerAddress: '',
    listingFeeContract: '',
    feeManagerContract: '',
    listingFeeUsdt: '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
  {
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'Arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
    wrappedNativeAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    usdtAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    isTestnet: false,
    isEnabled: false,
    isPaused: false,
    factoryAddress: '',
    routerAddress: '',
    listingFeeContract: '',
    feeManagerContract: '',
    listingFeeUsdt: '5',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    acceptedPaymentToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    swapFeeBps: 30,
    protocolFeeBps: 5,
  },
];

const DEFAULT_BASE_TOKENS = [
  {
    chainId: 97,
    address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    name: 'Wrapped BNB (Testnet)',
    symbol: 'WBNB',
    decimals: 18,
    totalSupply: '0',
    listedByWallet: OFFICIAL_FEE_RECEIVER,
    listingTxHash: '',
    listingFeePaid: '0',
    feePaymentToken: '',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    verificationStatus: 'verified',
    onChainVerified: true,
    pairAddress: '',
    txCount: 0,
  },
  {
    chainId: 97,
    address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    name: 'Tether USD (BSC Testnet)',
    symbol: 'USDT',
    decimals: 18,
    totalSupply: '0',
    listedByWallet: OFFICIAL_FEE_RECEIVER,
    listingTxHash: '',
    listingFeePaid: '0',
    feePaymentToken: '',
    feeReceiverWallet: OFFICIAL_FEE_RECEIVER,
    verificationStatus: 'verified',
    onChainVerified: true,
    pairAddress: '',
    txCount: 0,
  },
];

export async function getOrCreateUser(uid: string, email: string, walletAddress?: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        walletAddress: walletAddress || null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          updatedAt: new Date(),
          ...(walletAddress ? { walletAddress } : {}),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user account.', { cause: error });
  }
}

export async function ensureSeedNetworksAndBaseTokens() {
  try {
    for (const net of DEFAULT_NETWORKS) {
      await db
        .insert(networks)
        .values(net)
        .onConflictDoNothing({ target: networks.chainId });
    }
    for (const tok of DEFAULT_BASE_TOKENS) {
      await db
        .insert(tokens)
        .values({
          ...tok,
          address: tok.address.toLowerCase(),
        })
        .onConflictDoNothing();
    }
  } catch (error) {
    console.error('Database error in ensureSeedNetworksAndBaseTokens:', error);
    throw new Error('Failed to load network configurations.', { cause: error });
  }
}

export async function getNetworks() {
  try {
    await ensureSeedNetworksAndBaseTokens();
    return await db.select().from(networks).orderBy(networks.chainId);
  } catch (error) {
    console.error('Database error in getNetworks:', error);
    throw new Error('Failed to load supported networks.', { cause: error });
  }
}

export async function getNetworkByChainId(chainId: number) {
  try {
    await ensureSeedNetworksAndBaseTokens();
    const rows = await db.select().from(networks).where(eq(networks.chainId, chainId));
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in getNetworkByChainId:', error);
    throw new Error('Failed to load network configuration.', { cause: error });
  }
}

export async function updateNetworkConfig(
  chainId: number,
  updates: Partial<{
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
  }>
) {
  try {
    const rows = await db
      .update(networks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(networks.chainId, chainId))
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in updateNetworkConfig:', error);
    throw new Error('Failed to update network configuration.', { cause: error });
  }
}

export async function listIndexedTokens(chainId?: number, search?: string) {
  try {
    await ensureSeedNetworksAndBaseTokens();
    const conditions = [];
    if (chainId) {
      conditions.push(eq(tokens.chainId, chainId));
    }
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(tokens.name, q),
          ilike(tokens.symbol, q),
          ilike(tokens.address, q)
        )
      );
    }
    if (conditions.length > 0) {
      return await db
        .select()
        .from(tokens)
        .where(and(...conditions))
        .orderBy(desc(tokens.createdAt));
    }
    return await db.select().from(tokens).orderBy(desc(tokens.createdAt));
  } catch (error) {
    console.error('Database error in listIndexedTokens:', error);
    throw new Error('Failed to fetch indexed tokens.', { cause: error });
  }
}

export async function getTokenByAddress(chainId: number, address: string) {
  try {
    const rows = await db
      .select()
      .from(tokens)
      .where(
        and(eq(tokens.chainId, chainId), eq(tokens.address, address.toLowerCase()))
      );
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in getTokenByAddress:', error);
    throw new Error('Failed to fetch token details.', { cause: error });
  }
}

export async function upsertIndexedToken(input: {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  listedByWallet: string;
  listingTxHash: string;
  listingFeePaid: string;
  feePaymentToken: string;
  feeReceiverWallet: string;
  verificationStatus?: string;
  onChainVerified: boolean;
  pairAddress?: string;
}) {
  try {
    const normalized = input.address.toLowerCase();
    const rows = await db
      .insert(tokens)
      .values({
        ...input,
        address: normalized,
        verificationStatus: input.verificationStatus || 'unverified',
        pairAddress: input.pairAddress || '',
      })
      .onConflictDoUpdate({
        target: [tokens.chainId, tokens.address],
        set: {
          name: input.name,
          symbol: input.symbol,
          decimals: input.decimals,
          totalSupply: input.totalSupply,
          onChainVerified: input.onChainVerified,
          pairAddress: input.pairAddress || '',
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in upsertIndexedToken:', error);
    throw new Error('Failed to index token listing.', { cause: error });
  }
}

export async function updateTokenVerification(
  chainId: number,
  address: string,
  verificationStatus: string
) {
  try {
    const rows = await db
      .update(tokens)
      .set({ verificationStatus, updatedAt: new Date() })
      .where(
        and(eq(tokens.chainId, chainId), eq(tokens.address, address.toLowerCase()))
      )
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in updateTokenVerification:', error);
    throw new Error('Failed to update token verification status.', { cause: error });
  }
}

export async function listIndexedPools(chainId?: number) {
  try {
    if (chainId) {
      return await db
        .select()
        .from(pools)
        .where(eq(pools.chainId, chainId))
        .orderBy(desc(pools.createdAt));
    }
    return await db.select().from(pools).orderBy(desc(pools.createdAt));
  } catch (error) {
    console.error('Database error in listIndexedPools:', error);
    throw new Error('Failed to fetch liquidity pools.', { cause: error });
  }
}

export async function upsertIndexedPool(input: {
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
  lastSyncedBlock: number;
}) {
  try {
    const rows = await db
      .insert(pools)
      .values({
        ...input,
        pairAddress: input.pairAddress.toLowerCase(),
        token0Address: input.token0Address.toLowerCase(),
        token1Address: input.token1Address.toLowerCase(),
      })
      .onConflictDoUpdate({
        target: [pools.chainId, pools.pairAddress],
        set: {
          reserve0: input.reserve0,
          reserve1: input.reserve1,
          totalSupply: input.totalSupply,
          lastSyncedBlock: input.lastSyncedBlock,
          updatedAt: new Date(),
        },
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in upsertIndexedPool:', error);
    throw new Error('Failed to index liquidity pool.', { cause: error });
  }
}

export async function listTransactions(filters?: {
  chainId?: number;
  walletAddress?: string;
  txType?: string;
}) {
  try {
    const conditions = [];
    if (filters?.chainId) {
      conditions.push(eq(transactions.chainId, filters.chainId));
    }
    if (filters?.walletAddress) {
      conditions.push(eq(transactions.walletAddress, filters.walletAddress.toLowerCase()));
    }
    if (filters?.txType && filters.txType !== 'all') {
      conditions.push(eq(transactions.txType, filters.txType));
    }

    if (conditions.length > 0) {
      return await db
        .select()
        .from(transactions)
        .where(and(...conditions))
        .orderBy(desc(transactions.createdAt));
    }
    return await db.select().from(transactions).orderBy(desc(transactions.createdAt));
  } catch (error) {
    console.error('Database error in listTransactions:', error);
    throw new Error('Failed to fetch transaction history.', { cause: error });
  }
}

export async function recordVerifiedTransaction(input: {
  chainId: number;
  txHash: string;
  txType: string;
  walletAddress: string;
  tokenInAddress?: string;
  tokenInSymbol?: string;
  tokenOutAddress?: string;
  tokenOutSymbol?: string;
  amountIn?: string;
  amountOut?: string;
  feeAmount?: string;
  feeToken?: string;
  pairAddress?: string;
  blockNumber: number;
  status: string;
  verifiedOnChain: boolean;
}) {
  try {
    const rows = await db
      .insert(transactions)
      .values({
        chainId: input.chainId,
        txHash: input.txHash.toLowerCase(),
        txType: input.txType,
        walletAddress: input.walletAddress.toLowerCase(),
        tokenInAddress: (input.tokenInAddress || '').toLowerCase(),
        tokenInSymbol: input.tokenInSymbol || '',
        tokenOutAddress: (input.tokenOutAddress || '').toLowerCase(),
        tokenOutSymbol: input.tokenOutSymbol || '',
        amountIn: input.amountIn || '0',
        amountOut: input.amountOut || '0',
        feeAmount: input.feeAmount || '0',
        feeToken: input.feeToken || '',
        pairAddress: (input.pairAddress || '').toLowerCase(),
        blockNumber: input.blockNumber,
        status: input.status,
        verifiedOnChain: input.verifiedOnChain,
      })
      .onConflictDoUpdate({
        target: [transactions.chainId, transactions.txHash],
        set: {
          status: input.status,
          blockNumber: input.blockNumber,
          verifiedOnChain: input.verifiedOnChain,
        },
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in recordVerifiedTransaction:', error);
    throw new Error('Failed to record verified transaction.', { cause: error });
  }
}

export async function recordListingFee(input: {
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
}) {
  try {
    const rows = await db
      .insert(listingFees)
      .values({
        ...input,
        txHash: input.txHash.toLowerCase(),
        listerWallet: input.listerWallet.toLowerCase(),
        tokenAddress: input.tokenAddress.toLowerCase(),
        paymentTokenAddress: input.paymentTokenAddress.toLowerCase(),
        receiverWallet: input.receiverWallet.toLowerCase(),
      })
      .onConflictDoNothing()
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error in recordListingFee:', error);
    throw new Error('Failed to record listing fee collection.', { cause: error });
  }
}

export async function listFeeCollections(chainId?: number) {
  try {
    if (chainId) {
      return await db
        .select()
        .from(listingFees)
        .where(eq(listingFees.chainId, chainId))
        .orderBy(desc(listingFees.createdAt));
    }
    return await db.select().from(listingFees).orderBy(desc(listingFees.createdAt));
  } catch (error) {
    console.error('Database error in listFeeCollections:', error);
    throw new Error('Failed to fetch listing fee history.', { cause: error });
  }
}

export async function addAdminAuditLog(input: {
  actorUid: string;
  actorWallet: string;
  action: string;
  details: string;
  txHash?: string;
}) {
  try {
    const rows = await db
      .insert(adminAuditLogs)
      .values({
        actorUid: input.actorUid,
        actorWallet: input.actorWallet.toLowerCase(),
        action: input.action,
        details: input.details,
        txHash: input.txHash || '',
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error in addAdminAuditLog:', error);
    throw new Error('Failed to record admin audit entry.', { cause: error });
  }
}

export async function listAdminAuditLogs() {
  try {
    return await db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(50);
  } catch (error) {
    console.error('Database error in listAdminAuditLogs:', error);
    throw new Error('Failed to fetch admin audit logs.', { cause: error });
  }
}
