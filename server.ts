import express from 'express';
import rateLimit from 'express-rate-limit';
import * as dotenv from 'dotenv';
import path from 'path';
import { isAddress, isHexString, formatUnits } from 'ethers';
import {
  OFFICIAL_FEE_RECEIVER,
  addAdminAuditLog,
  getNetworkByChainId,
  getNetworks,
  getOrCreateUser,
  getTokenByAddress,
  listAdminAuditLogs,
  listFeeCollections,
  listIndexedPools,
  listIndexedTokens,
  listTransactions,
  recordListingFee,
  recordVerifiedTransaction,
  updateNetworkConfig,
  updateTokenVerification,
  upsertIndexedPool,
  upsertIndexedToken,
} from './src/db/queries.ts';
import {
  extractListingFeeFromLogs,
  inspectTokenOnChain,
  readPoolOnChain,
  verifyTxReceiptOnChain,
} from './src/lib/rpc.ts';
import { requireAuth, verifyWalletSignature, type AuthRequest } from './src/middleware/auth.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Trust proxy headers on Cloud Run
app.set('trust proxy', 1);

// Security headers & JSON body size limit
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

const writeRpcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for RPC verification endpoints.' },
});

app.use('/api', generalLimiter);

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'tataswap-dex-api',
    timestamp: new Date().toISOString(),
  });
});

// Authenticated User Account Sync (Create account / Log in)
app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.user?.uid;
    const email = req.user?.email || '';
    if (!uid) {
      res.status(401).json({ error: 'Invalid user session.' });
      return;
    }
    const walletAddress =
      typeof req.body?.walletAddress === 'string' && isAddress(req.body.walletAddress)
        ? req.body.walletAddress.toLowerCase()
        : undefined;
    const profile = await getOrCreateUser(uid, email, walletAddress);
    res.json({ user: profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to synchronize account';
    res.status(500).json({ error: message });
  }
});

// Public: Supported networks & contract configuration
app.get('/api/networks', async (_req, res) => {
  try {
    const nets = await getNetworks();
    res.json({ networks: nets, officialFeeReceiver: OFFICIAL_FEE_RECEIVER });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load networks';
    res.status(500).json({ error: message });
  }
});

// Public: Token explorer & search
app.get('/api/tokens', async (req, res) => {
  try {
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const items = await listIndexedTokens(chainId, q);
    res.json({ tokens: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch tokens';
    res.status(500).json({ error: message });
  }
});

// Public: Single token details (combines indexed metadata + live RPC check)
app.get('/api/tokens/:chainId/:address', async (req, res) => {
  try {
    const chainId = Number(req.params.chainId);
    const address = req.params.address;
    if (!Number.isInteger(chainId) || !isAddress(address)) {
      res.status(400).json({ error: 'Invalid chainId or token contract address.' });
      return;
    }

    const net = await getNetworkByChainId(chainId);
    if (!net) {
      res.status(404).json({ error: 'Unsupported blockchain network.' });
      return;
    }

    const indexed = await getTokenByAddress(chainId, address);
    let liveOnChain = null;
    let rpcError = null;
    try {
      liveOnChain = await inspectTokenOnChain(net.rpcUrl, address);
    } catch (err: unknown) {
      rpcError = err instanceof Error ? err.message : 'RPC inspection failed';
    }

    const allPools = await listIndexedPools(chainId);
    const tokenPools = allPools.filter(
      (p) =>
        p.token0Address.toLowerCase() === address.toLowerCase() ||
        p.token1Address.toLowerCase() === address.toLowerCase()
    );

    const allTxs = await listTransactions({ chainId });
    const tokenTxs = allTxs.filter(
      (tx) =>
        tx.tokenInAddress.toLowerCase() === address.toLowerCase() ||
        tx.tokenOutAddress.toLowerCase() === address.toLowerCase()
    );

    res.json({
      token: indexed,
      liveOnChain,
      rpcError,
      pools: tokenPools,
      transactions: tokenTxs.slice(0, 25),
      network: net,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch token details';
    res.status(500).json({ error: message });
  }
});

// Public: Real on-chain ERC-20 / BEP-20 contract inspector
app.post('/api/tokens/inspect', writeRpcLimiter, async (req, res) => {
  try {
    const { chainId, address } = req.body ?? {};
    const parsedChainId = Number(chainId);
    if (!Number.isInteger(parsedChainId) || typeof address !== 'string' || !isAddress(address)) {
      res.status(400).json({ error: 'Valid chainId and ERC-20 contract address are required.' });
      return;
    }

    const net = await getNetworkByChainId(parsedChainId);
    if (!net) {
      res.status(404).json({ error: 'Unsupported network.' });
      return;
    }

    const metadata = await inspectTokenOnChain(net.rpcUrl, address);
    const existing = await getTokenByAddress(parsedChainId, address);
    res.json({
      metadata,
      alreadyListed: Boolean(existing),
      existingToken: existing,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'On-chain token inspection failed';
    res.status(400).json({ error: message });
  }
});

// Public: Permissionless token listing index (verifies real on-chain txHash + fee payment first!)
app.post('/api/tokens/list', writeRpcLimiter, async (req, res) => {
  try {
    const { chainId, tokenAddress, txHash, listerWallet, pairAddress } = req.body ?? {};
    const parsedChainId = Number(chainId);

    if (
      !Number.isInteger(parsedChainId) ||
      typeof tokenAddress !== 'string' ||
      !isAddress(tokenAddress) ||
      typeof listerWallet !== 'string' ||
      !isAddress(listerWallet) ||
      typeof txHash !== 'string' ||
      !isHexString(txHash, 32)
    ) {
      res.status(400).json({
        error: 'Valid chainId, tokenAddress, listerWallet, and 32-byte on-chain txHash are required.',
      });
      return;
    }

    const net = await getNetworkByChainId(parsedChainId);
    if (!net) {
      res.status(404).json({ error: 'Unsupported network.' });
      return;
    }

    // 1. Independently verify the transaction succeeded on-chain
    const receipt = await verifyTxReceiptOnChain(net.rpcUrl, txHash);
    if (!receipt.found || !receipt.confirmed) {
      res.status(400).json({
        error: 'Listing transaction has not been confirmed on-chain yet or reverted.',
      });
      return;
    }

    // 2. Independently inspect token bytecode & ERC-20 metadata on-chain
    const metadata = await inspectTokenOnChain(net.rpcUrl, tokenAddress);

    // 3. Verify fee delivery logs to the configured feeReceiverWallet
    const feeCheck = extractListingFeeFromLogs(
      receipt.logs as readonly { topics: readonly string[]; data: string; address: string }[],
      net.feeReceiverWallet,
      net.acceptedPaymentToken || net.usdtAddress
    );

    if (!feeCheck.matched) {
      res.status(400).json({
        error: `Could not verify listing fee payment to ${net.feeReceiverWallet} in transaction logs.`,
      });
      return;
    }

    const feePaidFormatted = feeCheck.feeAmountWei
      ? formatUnits(feeCheck.feeAmountWei, 18)
      : net.listingFeeUsdt;

    const savedToken = await upsertIndexedToken({
      chainId: parsedChainId,
      address: metadata.address,
      name: metadata.name,
      symbol: metadata.symbol,
      decimals: metadata.decimals,
      totalSupply: metadata.totalSupply,
      listedByWallet: listerWallet.toLowerCase(),
      listingTxHash: txHash.toLowerCase(),
      listingFeePaid: feePaidFormatted,
      feePaymentToken: net.acceptedPaymentToken || net.usdtAddress,
      feeReceiverWallet: net.feeReceiverWallet,
      verificationStatus: 'unverified',
      onChainVerified: true,
      pairAddress: typeof pairAddress === 'string' && isAddress(pairAddress) ? pairAddress : '',
    });

    await recordListingFee({
      chainId: parsedChainId,
      txHash,
      listerWallet,
      tokenAddress: metadata.address,
      tokenSymbol: metadata.symbol,
      paymentTokenAddress: net.acceptedPaymentToken || net.usdtAddress,
      paymentSymbol: 'USDT',
      amountPaid: feePaidFormatted,
      receiverWallet: net.feeReceiverWallet,
      blockNumber: receipt.blockNumber,
      verifiedOnChain: true,
    });

    await recordVerifiedTransaction({
      chainId: parsedChainId,
      txHash,
      txType: 'token_listing',
      walletAddress: listerWallet,
      tokenInAddress: net.acceptedPaymentToken || net.usdtAddress,
      tokenInSymbol: 'USDT',
      tokenOutAddress: metadata.address,
      tokenOutSymbol: metadata.symbol,
      amountIn: feePaidFormatted,
      amountOut: '1',
      feeAmount: feePaidFormatted,
      feeToken: 'USDT',
      pairAddress: typeof pairAddress === 'string' && isAddress(pairAddress) ? pairAddress : '',
      blockNumber: receipt.blockNumber,
      status: 'confirmed',
      verifiedOnChain: true,
    });

    res.json({ token: savedToken, verifiedOnChain: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to verify and list token';
    res.status(400).json({ error: message });
  }
});

// Public: List indexed liquidity pools
app.get('/api/pools', async (req, res) => {
  try {
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
    const items = await listIndexedPools(chainId);
    res.json({ pools: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load pools';
    res.status(500).json({ error: message });
  }
});

// Public: Sync a real on-chain pool contract into the index
app.post('/api/pools/sync', writeRpcLimiter, async (req, res) => {
  try {
    const { chainId, pairAddress, creatorWallet, creationTxHash } = req.body ?? {};
    const parsedChainId = Number(chainId);
    if (!Number.isInteger(parsedChainId) || typeof pairAddress !== 'string' || !isAddress(pairAddress)) {
      res.status(400).json({ error: 'Valid chainId and pairAddress are required.' });
      return;
    }

    const net = await getNetworkByChainId(parsedChainId);
    if (!net) {
      res.status(404).json({ error: 'Unsupported network.' });
      return;
    }

    const livePool = await readPoolOnChain(net.rpcUrl, pairAddress);
    const saved = await upsertIndexedPool({
      chainId: parsedChainId,
      pairAddress: livePool.pairAddress,
      token0Address: livePool.token0Address,
      token1Address: livePool.token1Address,
      token0Symbol: livePool.token0Symbol,
      token1Symbol: livePool.token1Symbol,
      token0Decimals: livePool.token0Decimals,
      token1Decimals: livePool.token1Decimals,
      feeTierBps: net.swapFeeBps,
      creatorWallet:
        typeof creatorWallet === 'string' && isAddress(creatorWallet)
          ? creatorWallet.toLowerCase()
          : '0x0000000000000000000000000000000000000000',
      creationTxHash:
        typeof creationTxHash === 'string' && isHexString(creationTxHash, 32)
          ? creationTxHash.toLowerCase()
          : '',
      reserve0: livePool.reserve0,
      reserve1: livePool.reserve1,
      totalSupply: livePool.totalSupply,
      lastSyncedBlock: livePool.blockNumber,
    });

    res.json({ pool: saved, livePool });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to sync pool on-chain';
    res.status(400).json({ error: message });
  }
});

// Public: Indexed verified transaction history
app.get('/api/transactions', async (req, res) => {
  try {
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
    const walletAddress =
      typeof req.query.wallet === 'string' && isAddress(req.query.wallet)
        ? req.query.wallet
        : undefined;
    const txType = typeof req.query.type === 'string' ? req.query.type : undefined;

    const items = await listTransactions({ chainId, walletAddress, txType });
    res.json({ transactions: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load transactions';
    res.status(500).json({ error: message });
  }
});

// Public: Verify an on-chain swap/liquidity/pair transaction hash via RPC and index it
app.post('/api/transactions/verify', writeRpcLimiter, async (req, res) => {
  try {
    const {
      chainId,
      txHash,
      txType,
      walletAddress,
      tokenInAddress,
      tokenInSymbol,
      tokenOutAddress,
      tokenOutSymbol,
      amountIn,
      amountOut,
      feeAmount,
      feeToken,
      pairAddress,
    } = req.body ?? {};

    const parsedChainId = Number(chainId);
    if (
      !Number.isInteger(parsedChainId) ||
      typeof txHash !== 'string' ||
      !isHexString(txHash, 32) ||
      typeof walletAddress !== 'string' ||
      !isAddress(walletAddress)
    ) {
      res.status(400).json({ error: 'Valid chainId, txHash, and walletAddress are required.' });
      return;
    }

    const net = await getNetworkByChainId(parsedChainId);
    if (!net) {
      res.status(404).json({ error: 'Unsupported network.' });
      return;
    }

    const receipt = await verifyTxReceiptOnChain(net.rpcUrl, txHash);
    if (!receipt.found) {
      res.status(202).json({
        verified: false,
        status: 'pending',
        message: 'Transaction not yet mined on-chain.',
      });
      return;
    }

    const recorded = await recordVerifiedTransaction({
      chainId: parsedChainId,
      txHash,
      txType: typeof txType === 'string' ? txType : 'swap',
      walletAddress,
      tokenInAddress: typeof tokenInAddress === 'string' ? tokenInAddress : '',
      tokenInSymbol: typeof tokenInSymbol === 'string' ? tokenInSymbol : '',
      tokenOutAddress: typeof tokenOutAddress === 'string' ? tokenOutAddress : '',
      tokenOutSymbol: typeof tokenOutSymbol === 'string' ? tokenOutSymbol : '',
      amountIn: typeof amountIn === 'string' ? amountIn : '0',
      amountOut: typeof amountOut === 'string' ? amountOut : '0',
      feeAmount: typeof feeAmount === 'string' ? feeAmount : '0',
      feeToken: typeof feeToken === 'string' ? feeToken : '',
      pairAddress: typeof pairAddress === 'string' ? pairAddress : '',
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      verifiedOnChain: receipt.confirmed,
    });

    // Refresh pool reserves on-chain if pairAddress provided
    if (typeof pairAddress === 'string' && isAddress(pairAddress)) {
      try {
        const livePool = await readPoolOnChain(net.rpcUrl, pairAddress);
        await upsertIndexedPool({
          chainId: parsedChainId,
          pairAddress: livePool.pairAddress,
          token0Address: livePool.token0Address,
          token1Address: livePool.token1Address,
          token0Symbol: livePool.token0Symbol,
          token1Symbol: livePool.token1Symbol,
          token0Decimals: livePool.token0Decimals,
          token1Decimals: livePool.token1Decimals,
          feeTierBps: net.swapFeeBps,
          creatorWallet: walletAddress.toLowerCase(),
          creationTxHash: txHash.toLowerCase(),
          reserve0: livePool.reserve0,
          reserve1: livePool.reserve1,
          totalSupply: livePool.totalSupply,
          lastSyncedBlock: livePool.blockNumber,
        });
      } catch {
        // Non-fatal if pool hasn't initialized reserves yet
      }
    }

    res.json({ verified: receipt.confirmed, transaction: recorded });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Transaction verification failed';
    res.status(400).json({ error: message });
  }
});

// Public: Protocol analytics computed strictly from verified PostgreSQL records
app.get('/api/analytics', async (req, res) => {
  try {
    const chainId = req.query.chainId ? Number(req.query.chainId) : undefined;
    const [allTokens, allPools, allTxs, allFees, allNetworks] = await Promise.all([
      listIndexedTokens(chainId),
      listIndexedPools(chainId),
      listTransactions({ chainId }),
      listFeeCollections(chainId),
      getNetworks(),
    ]);

    const swapTxs = allTxs.filter((t) => t.txType === 'swap' && t.status === 'confirmed');
    const totalListingFeesCollected = allFees.reduce(
      (sum, f) => sum + (Number.parseFloat(f.amountPaid) || 0),
      0
    );
    const totalSwapFeesEstimated = swapTxs.reduce(
      (sum, tx) => sum + (Number.parseFloat(tx.feeAmount) || 0),
      0
    );

    res.json({
      summary: {
        totalListedTokens: allTokens.length,
        totalPools: allPools.length,
        totalTransactions: allTxs.length,
        totalSwaps: swapTxs.length,
        totalListingFeesCollected: totalListingFeesCollected.toFixed(4),
        totalProtocolFeesRecorded: totalSwapFeesEstimated.toFixed(6),
        officialFeeReceiver: OFFICIAL_FEE_RECEIVER,
      },
      feeCollections: allFees,
      networks: allNetworks,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to compute analytics';
    res.status(500).json({ error: message });
  }
});

// Authenticated Admin Overview (Firebase Auth required)
app.get('/api/admin/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [allTokens, allPools, allTxs, allFees, allNetworks, auditLogs] = await Promise.all([
      listIndexedTokens(),
      listIndexedPools(),
      listTransactions(),
      listFeeCollections(),
      getNetworks(),
      listAdminAuditLogs(),
    ]);

    res.json({
      operatorEmail: req.user?.email || '',
      officialFeeReceiver: OFFICIAL_FEE_RECEIVER,
      metrics: {
        totalListedTokens: allTokens.length,
        totalPools: allPools.length,
        totalTransactions: allTxs.length,
        totalSwaps: allTxs.filter((t) => t.txType === 'swap').length,
        totalListingFeesCollected: allFees
          .reduce((sum, f) => sum + (Number.parseFloat(f.amountPaid) || 0), 0)
          .toFixed(4),
      },
      networks: allNetworks,
      recentFees: allFees.slice(0, 20),
      auditLogs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load admin overview';
    res.status(500).json({ error: message });
  }
});

// Authenticated Admin Network & Contract Configuration (Firebase Auth + EIP-191 Wallet Signature)
app.post('/api/admin/network', requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      chainId,
      walletAddress,
      signature,
      signedMessage,
      isEnabled,
      isPaused,
      factoryAddress,
      routerAddress,
      listingFeeContract,
      feeManagerContract,
      listingFeeUsdt,
      feeReceiverWallet,
      acceptedPaymentToken,
      swapFeeBps,
      protocolFeeBps,
      txHash,
    } = req.body ?? {};

    const parsedChainId = Number(chainId);
    if (
      !Number.isInteger(parsedChainId) ||
      typeof walletAddress !== 'string' ||
      !isAddress(walletAddress) ||
      typeof signature !== 'string' ||
      typeof signedMessage !== 'string'
    ) {
      res.status(400).json({ error: 'Valid chainId, walletAddress, signedMessage, and signature are required.' });
      return;
    }

    const sigValid = verifyWalletSignature(signedMessage, signature, walletAddress);
    if (!sigValid) {
      res.status(403).json({ error: 'Invalid wallet signature.' });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (typeof isEnabled === 'boolean') updates.isEnabled = isEnabled;
    if (typeof isPaused === 'boolean') updates.isPaused = isPaused;
    if (typeof factoryAddress === 'string' && (factoryAddress === '' || isAddress(factoryAddress))) {
      updates.factoryAddress = factoryAddress;
    }
    if (typeof routerAddress === 'string' && (routerAddress === '' || isAddress(routerAddress))) {
      updates.routerAddress = routerAddress;
    }
    if (typeof listingFeeContract === 'string' && (listingFeeContract === '' || isAddress(listingFeeContract))) {
      updates.listingFeeContract = listingFeeContract;
    }
    if (typeof feeManagerContract === 'string' && (feeManagerContract === '' || isAddress(feeManagerContract))) {
      updates.feeManagerContract = feeManagerContract;
    }
    if (typeof listingFeeUsdt === 'string' && Number(listingFeeUsdt) >= 0) {
      updates.listingFeeUsdt = listingFeeUsdt;
    }
    if (typeof feeReceiverWallet === 'string' && isAddress(feeReceiverWallet)) {
      updates.feeReceiverWallet = feeReceiverWallet;
    }
    if (typeof acceptedPaymentToken === 'string' && isAddress(acceptedPaymentToken)) {
      updates.acceptedPaymentToken = acceptedPaymentToken;
    }
    if (typeof swapFeeBps === 'number' && swapFeeBps >= 0 && swapFeeBps <= 100) {
      updates.swapFeeBps = swapFeeBps;
    }
    if (typeof protocolFeeBps === 'number' && protocolFeeBps >= 0 && protocolFeeBps <= 100) {
      updates.protocolFeeBps = protocolFeeBps;
    }

    const updated = await updateNetworkConfig(parsedChainId, updates);
    if (!updated) {
      res.status(404).json({ error: 'Network not found.' });
      return;
    }

    await addAdminAuditLog({
      actorUid: req.user?.uid || 'unknown',
      actorWallet: walletAddress,
      action: `UPDATE_NETWORK_${parsedChainId}`,
      details: JSON.stringify(updates),
      txHash: typeof txHash === 'string' ? txHash : '',
    });

    res.json({ network: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update network config';
    res.status(500).json({ error: message });
  }
});

// Authenticated Admin Token Verification Label Update (Firebase Auth + EIP-191 Wallet Signature)
app.post('/api/admin/token-verification', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { chainId, tokenAddress, verificationStatus, walletAddress, signature, signedMessage } =
      req.body ?? {};
    const parsedChainId = Number(chainId);

    if (
      !Number.isInteger(parsedChainId) ||
      typeof tokenAddress !== 'string' ||
      !isAddress(tokenAddress) ||
      !['verified', 'unverified', 'flagged'].includes(verificationStatus) ||
      typeof walletAddress !== 'string' ||
      !isAddress(walletAddress) ||
      typeof signature !== 'string' ||
      typeof signedMessage !== 'string'
    ) {
      res.status(400).json({ error: 'Invalid verification update payload.' });
      return;
    }

    const sigValid = verifyWalletSignature(signedMessage, signature, walletAddress);
    if (!sigValid) {
      res.status(403).json({ error: 'Invalid wallet signature.' });
      return;
    }

    const updated = await updateTokenVerification(parsedChainId, tokenAddress, verificationStatus);
    if (!updated) {
      res.status(404).json({ error: 'Token not found.' });
      return;
    }

    await addAdminAuditLog({
      actorUid: req.user?.uid || 'unknown',
      actorWallet: walletAddress,
      action: `TOKEN_LABEL_${verificationStatus.toUpperCase()}`,
      details: `${tokenAddress} on chain ${parsedChainId}`,
    });

    res.json({ token: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update token label';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TataSwap server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
