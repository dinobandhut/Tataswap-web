import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, PlusCircle } from 'lucide-react';
import { Contract, formatUnits, parseEther, parseUnits } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import { ERC20_ABI, FACTORY_ABI, POOL_ABI, ROUTER_ABI } from '../lib/abis';
import type { IndexedToken, PageRoute } from '../types/dex';

interface TokenOpt {
  address: string;
  symbol: string;
  decimals: number;
  isNative?: boolean;
}

export function AddLiquidityPage({ onNavigate }: { onNavigate: (page: PageRoute) => void }) {
  const {
    account,
    selectedChainId,
    activeNetwork,
    nativeBalance,
    getBrowserProvider,
    getReadProvider,
    getTokenBalance,
    setWalletModalOpen,
  } = useWallet();

  const [tokens, setTokens] = useState<TokenOpt[]>([]);
  const [tokenA, setTokenA] = useState<TokenOpt | null>(null);
  const [tokenB, setTokenB] = useState<TokenOpt | null>(null);
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [balA, setBalA] = useState('0');
  const [balB, setBalB] = useState('0');
  const [pairAddr, setPairAddr] = useState('');
  const [reserves, setReserves] = useState<{ rA: string; rB: string } | null>(null);
  const [slippagePct, setSlippagePct] = useState('0.5');

  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const nativeOpt: TokenOpt = {
        address: 'NATIVE',
        symbol: activeNetwork?.nativeSymbol || 'tBNB',
        decimals: 18,
        isNative: true,
      };
      const res = await fetch(`/api/tokens?chainId=${selectedChainId}`);
      const data = res.ok ? await res.json() : { tokens: [] };
      const list: TokenOpt[] = [
        nativeOpt,
        ...(data.tokens || []).map((t: IndexedToken) => ({
          address: t.address,
          symbol: t.symbol,
          decimals: t.decimals,
        })),
      ];
      if (!cancelled) {
        setTokens(list);
        setTokenA(list[0] || null);
        setTokenB(list[1] || null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChainId, activeNetwork]);

  useEffect(() => {
    let cancelled = false;
    async function refreshBals() {
      if (!account) {
        setBalA('0');
        setBalB('0');
        return;
      }
      if (tokenA) {
        setBalA(
          tokenA.isNative
            ? nativeBalance
            : await getTokenBalance(tokenA.address, account, selectedChainId)
        );
      }
      if (tokenB && !cancelled) {
        setBalB(
          tokenB.isNative
            ? nativeBalance
            : await getTokenBalance(tokenB.address, account, selectedChainId)
        );
      }
    }
    refreshBals();
    return () => {
      cancelled = true;
    };
  }, [account, tokenA, tokenB, nativeBalance, selectedChainId, getTokenBalance]);

  // Check existing reserves and auto-quote B if pool already seeded
  useEffect(() => {
    let cancelled = false;
    async function readReserves() {
      setPairAddr('');
      setReserves(null);
      if (!activeNetwork?.factoryAddress || !tokenA || !tokenB) return;
      const addrA = tokenA.isNative ? activeNetwork.wrappedNativeAddress : tokenA.address;
      const addrB = tokenB.isNative ? activeNetwork.wrappedNativeAddress : tokenB.address;
      if (addrA.toLowerCase() === addrB.toLowerCase()) return;

      const provider = getReadProvider(selectedChainId);
      if (!provider) return;
      try {
        const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, provider);
        const pair = await factory.getPair(addrA, addrB);
        if (cancelled || pair === '0x0000000000000000000000000000000000000000') return;
        setPairAddr(pair);

        const pool = new Contract(pair, POOL_ABI, provider);
        const [t0, [r0, r1]] = await Promise.all([pool.token0(), pool.getReserves()]);
        if (cancelled) return;
        const isA0 = addrA.toLowerCase() === String(t0).toLowerCase();
        const rA = formatUnits(isA0 ? r0 : r1, tokenA.decimals);
        const rB = formatUnits(isA0 ? r1 : r0, tokenB.decimals);
        setReserves({ rA, rB });
      } catch {
        // Ignore read error
      }
    }
    readReserves();
    return () => {
      cancelled = true;
    };
  }, [tokenA, tokenB, activeNetwork, selectedChainId, getReadProvider]);

  const handleAmountAChange = (val: string) => {
    setAmountA(val);
    if (reserves && Number.parseFloat(reserves.rA) > 0 && Number.parseFloat(val) > 0) {
      const ratio = Number.parseFloat(reserves.rB) / Number.parseFloat(reserves.rA);
      setAmountB((Number.parseFloat(val) * ratio).toFixed(6));
    }
  };

  const handleAddLiquidity = async () => {
    setError(null);
    setStatus(null);
    setTxHash(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!activeNetwork?.routerAddress) {
      setError('TataSwapRouter is not deployed/configured for this network yet.');
      return;
    }
    if (!tokenA || !tokenB || !amountA || !amountB) {
      setError('Enter valid Token A and Token B deposit amounts.');
      return;
    }
    const browserProvider = getBrowserProvider();
    if (!browserProvider) {
      setError('Connect MetaMask or Trust Wallet first.');
      return;
    }

    setSubmitting(true);
    try {
      const signer = await browserProvider.getSigner();
      const router = new Contract(activeNetwork.routerAddress, ROUTER_ABI, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const slipBps = Math.floor(Number.parseFloat(slippagePct || '0.5') * 100);

      const amtAWei = parseUnits(amountA, tokenA.decimals);
      const amtBWei = parseUnits(amountB, tokenB.decimals);
      const minA = (amtAWei * BigInt(10000 - slipBps)) / 10000n;
      const minB = (amtBWei * BigInt(10000 - slipBps)) / 10000n;

      if (!tokenA.isNative) {
        const ercA = new Contract(tokenA.address, ERC20_ABI, signer);
        const allowA: bigint = await ercA.allowance(account, activeNetwork.routerAddress);
        if (allowA < amtAWei) {
          setStatus(`Approving ${tokenA.symbol}...`);
          const tx = await ercA.approve(activeNetwork.routerAddress, amtAWei);
          await tx.wait();
        }
      }
      if (!tokenB.isNative) {
        const ercB = new Contract(tokenB.address, ERC20_ABI, signer);
        const allowB: bigint = await ercB.allowance(account, activeNetwork.routerAddress);
        if (allowB < amtBWei) {
          setStatus(`Approving ${tokenB.symbol}...`);
          const tx = await ercB.approve(activeNetwork.routerAddress, amtBWei);
          await tx.wait();
        }
      }

      setStatus('Confirming Add Liquidity transaction in your wallet...');
      let addTx;
      if (tokenA.isNative) {
        addTx = await router.addLiquidityETH(
          tokenB.address,
          amtBWei,
          minB,
          minA,
          account,
          deadline,
          { value: parseEther(amountA) }
        );
      } else if (tokenB.isNative) {
        addTx = await router.addLiquidityETH(
          tokenA.address,
          amtAWei,
          minA,
          minB,
          account,
          deadline,
          { value: parseEther(amountB) }
        );
      } else {
        addTx = await router.addLiquidity(
          tokenA.address,
          tokenB.address,
          amtAWei,
          amtBWei,
          minA,
          minB,
          account,
          deadline
        );
      }

      const receipt = await addTx.wait();
      setTxHash(receipt.hash);

      const addrA = tokenA.isNative ? activeNetwork.wrappedNativeAddress : tokenA.address;
      const addrB = tokenB.isNative ? activeNetwork.wrappedNativeAddress : tokenB.address;
      const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, signer);
      const finalPair = await factory.getPair(addrA, addrB);

      await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          txHash: receipt.hash,
          txType: 'add_liquidity',
          walletAddress: account,
          tokenInAddress: addrA,
          tokenInSymbol: tokenA.symbol,
          tokenOutAddress: addrB,
          tokenOutSymbol: tokenB.symbol,
          amountIn: amountA,
          amountOut: amountB,
          pairAddress: finalPair,
        }),
      });

      setStatus('Liquidity added on-chain and LP tokens minted to your wallet.');
      setAmountA('');
      setAmountB('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Add liquidity transaction failed.');
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ContractStatusNotice network={activeNetwork} onNavigate={onNavigate} />

      <div className="mx-auto max-w-lg rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-5">
        <div className="border-b border-white/[0.07] pb-4">
          <h1 className="text-lg font-semibold text-slate-100">Add Liquidity</h1>
          <p className="text-xs text-slate-400">
            Deposit token pairs to earn {(((activeNetwork?.swapFeeBps ?? 30) - (activeNetwork?.protocolFeeBps ?? 5)) / 100).toFixed(2)}% LP fees on every swap
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Token A</span>
            <span className="font-mono tabular-nums">
              Balance: {Number.parseFloat(balA).toFixed(4)} {tokenA?.symbol}
            </span>
          </div>
          <div className="flex gap-3 rounded-lg border border-white/10 bg-[#090C12] p-3">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amountA}
              onChange={(e) => handleAmountAChange(e.target.value)}
              className="w-full bg-transparent font-mono text-lg font-semibold text-slate-100 focus:outline-none tabular-nums"
            />
            <select
              value={tokenA?.address || ''}
              onChange={(e) => {
                const found = tokens.find((t) => t.address === e.target.value);
                if (found) setTokenA(found);
              }}
              className="rounded-lg border border-white/10 bg-[#151B28] px-3 py-2 text-xs font-semibold text-slate-100"
            >
              {tokens.map((t) => (
                <option key={`la-${t.address}`} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Token B</span>
            <span className="font-mono tabular-nums">
              Balance: {Number.parseFloat(balB).toFixed(4)} {tokenB?.symbol}
            </span>
          </div>
          <div className="flex gap-3 rounded-lg border border-white/10 bg-[#090C12] p-3">
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={amountB}
              onChange={(e) => setAmountB(e.target.value)}
              className="w-full bg-transparent font-mono text-lg font-semibold text-slate-100 focus:outline-none tabular-nums"
            />
            <select
              value={tokenB?.address || ''}
              onChange={(e) => {
                const found = tokens.find((t) => t.address === e.target.value);
                if (found) setTokenB(found);
              }}
              className="rounded-lg border border-white/10 bg-[#151B28] px-3 py-2 text-xs font-semibold text-slate-100"
            >
              {tokens.map((t) => (
                <option key={`lb-${t.address}`} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2 border-t border-white/[0.07] pt-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Pair Contract</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {pairAddr ? `${pairAddr.slice(0, 8)}...${pairAddr.slice(-6)}` : 'New Pair (First Deposit Sets Ratio)'}
            </span>
          </div>
          {reserves && (
            <div className="flex justify-between">
              <span className="text-slate-400">Current Reserves</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {Number.parseFloat(reserves.rA).toFixed(4)} {tokenA?.symbol} /{' '}
                {Number.parseFloat(reserves.rB).toFixed(4)} {tokenB?.symbol}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Slippage Tolerance (%)</span>
            <input
              type="number"
              step="0.1"
              value={slippagePct}
              onChange={(e) => setSlippagePct(e.target.value)}
              className="w-16 rounded border border-white/10 bg-[#090C12] px-2 py-1 text-right font-mono text-slate-100"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div>{status}</div>
              {txHash && activeNetwork && (
                <a
                  href={`${activeNetwork.explorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono underline"
                >
                  View Tx {txHash.slice(0, 12)}...
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={submitting}
          onClick={handleAddLiquidity}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          <PlusCircle className="h-4 w-4" />
          {!account
            ? 'Connect Wallet'
            : submitting
            ? 'Confirming Deposit...'
            : 'Supply Liquidity'}
        </button>
      </div>
    </div>
  );
}
