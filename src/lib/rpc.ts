import { Contract, Interface, JsonRpcProvider, formatUnits, isAddress } from 'ethers';
import { ERC20_ABI, LISTING_FEE_ABI, POOL_ABI } from './abis.ts';

const providerCache = new Map<string, JsonRpcProvider>();

export function getRpcProvider(rpcUrl: string): JsonRpcProvider {
  let provider = providerCache.get(rpcUrl);
  if (!provider) {
    provider = new JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: false,
    });
    providerCache.set(rpcUrl, provider);
  }
  return provider;
}

export async function withRpcTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('RPC request timed out')), ms)
    ),
  ]);
}

export async function inspectTokenOnChain(rpcUrl: string, tokenAddress: string) {
  if (!isAddress(tokenAddress)) {
    throw new Error('Invalid contract address format.');
  }

  const provider = getRpcProvider(rpcUrl);
  const bytecode = await withRpcTimeout(provider.getCode(tokenAddress));
  if (!bytecode || bytecode === '0x') {
    throw new Error('No smart contract bytecode found at this address on the selected network.');
  }

  const token = new Contract(tokenAddress, ERC20_ABI, provider);

  const [name, symbol, decimalsRaw, totalSupplyRaw] = await withRpcTimeout(
    Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
    ])
  );

  const decimals = Number(decimalsRaw);
  const totalSupply = formatUnits(totalSupplyRaw, decimals);

  return {
    address: tokenAddress,
    name: String(name),
    symbol: String(symbol),
    decimals,
    totalSupply,
    hasCode: true,
    bytecodeSizeBytes: (bytecode.length - 2) / 2,
  };
}

export async function verifyTxReceiptOnChain(rpcUrl: string, txHash: string) {
  const provider = getRpcProvider(rpcUrl);
  const [receipt, tx] = await withRpcTimeout(
    Promise.all([
      provider.getTransactionReceipt(txHash),
      provider.getTransaction(txHash),
    ])
  );

  if (!receipt || !tx) {
    return {
      found: false,
      confirmed: false,
      status: 'pending' as const,
      blockNumber: 0,
      from: '',
      to: '',
      logs: [] as readonly unknown[],
    };
  }

  const confirmed = receipt.status === 1;
  return {
    found: true,
    confirmed,
    status: confirmed ? ('confirmed' as const) : ('reverted' as const),
    blockNumber: Number(receipt.blockNumber),
    from: tx.from,
    to: tx.to || '',
    logs: receipt.logs,
  };
}

export function extractListingFeeFromLogs(
  logs: readonly { topics: readonly string[]; data: string; address: string }[],
  expectedReceiver: string,
  expectedPaymentToken: string
) {
  const listingIface = new Interface(LISTING_FEE_ABI);
  const erc20Iface = new Interface(ERC20_ABI);

  for (const log of logs) {
    try {
      const parsed = listingIface.parseLog(log);
      if (parsed && parsed.name === 'ListingFeeCollected') {
        const receiver = String(parsed.args.feeReceiverWallet).toLowerCase();
        const payToken = String(parsed.args.paymentToken).toLowerCase();
        if (
          receiver === expectedReceiver.toLowerCase() &&
          (!expectedPaymentToken || payToken === expectedPaymentToken.toLowerCase())
        ) {
          return {
            matched: true,
            lister: String(parsed.args.lister),
            tokenAddress: String(parsed.args.tokenAddress),
            paymentToken: String(parsed.args.paymentToken),
            feeAmountWei: parsed.args.feeAmount.toString(),
            receiver: String(parsed.args.feeReceiverWallet),
          };
        }
      }
    } catch {
      // Not a ListingFeeCollected log
    }

    try {
      const parsedTransfer = erc20Iface.parseLog(log);
      if (
        parsedTransfer &&
        parsedTransfer.name === 'Transfer' &&
        log.address.toLowerCase() === expectedPaymentToken.toLowerCase() &&
        String(parsedTransfer.args.to).toLowerCase() === expectedReceiver.toLowerCase()
      ) {
        return {
          matched: true,
          lister: String(parsedTransfer.args.from),
          tokenAddress: '',
          paymentToken: log.address,
          feeAmountWei: parsedTransfer.args.value.toString(),
          receiver: String(parsedTransfer.args.to),
        };
      }
    } catch {
      // Not an ERC20 Transfer log
    }
  }

  return { matched: false };
}

export async function readPoolOnChain(rpcUrl: string, pairAddress: string) {
  if (!isAddress(pairAddress)) {
    throw new Error('Invalid pair contract address.');
  }
  const provider = getRpcProvider(rpcUrl);
  const bytecode = await withRpcTimeout(provider.getCode(pairAddress));
  if (!bytecode || bytecode === '0x') {
    throw new Error('No pool contract found at this address.');
  }

  const pool = new Contract(pairAddress, POOL_ABI, provider);
  const [token0Addr, token1Addr, reserves, totalSupplyRaw] = await withRpcTimeout(
    Promise.all([
      pool.token0(),
      pool.token1(),
      pool.getReserves(),
      pool.totalSupply(),
    ])
  );

  const t0 = new Contract(token0Addr, ERC20_ABI, provider);
  const t1 = new Contract(token1Addr, ERC20_ABI, provider);

  const [s0, d0, s1, d1, blockNumber] = await withRpcTimeout(
    Promise.all([
      t0.symbol(),
      t0.decimals(),
      t1.symbol(),
      t1.decimals(),
      provider.getBlockNumber(),
    ])
  );

  const dec0 = Number(d0);
  const dec1 = Number(d1);

  return {
    pairAddress,
    token0Address: String(token0Addr),
    token1Address: String(token1Addr),
    token0Symbol: String(s0),
    token1Symbol: String(s1),
    token0Decimals: dec0,
    token1Decimals: dec1,
    reserve0: formatUnits(reserves[0], dec0),
    reserve1: formatUnits(reserves[1], dec1),
    totalSupply: formatUnits(totalSupplyRaw, 18),
    blockNumber: Number(blockNumber),
  };
}
