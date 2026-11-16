import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, MinusCircle } from 'lucide-react';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import { POOL_ABI, ROUTER_ABI } from '../lib/abis';
import type { IndexedPool, PageRoute } from '../types/dex';

export function RemoveLiquidityPage({ onNavigate }: { onNavigate: (page: PageRoute) => void }) {
  const {
    account,
    selectedChainId,
    activeNetwork,
    getBrowserProvider,
    getReadProvider,
    setWalletModalOpen,
  } = useWallet();

  const [pools, setPools] = useState<IndexedPool[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('');
  const [lpBalance, setLpBalance] = useState<string>('0');
  const [totalSupply, setTotalSupply] = useState<string>('0');
  const [percent, setPercent] = useState<number>(50);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pools?chainId=${selectedChainId}`)
      .then((r) => (r.ok ? r.json() : { pools: [] }))
      .then((data) => {
        const list: IndexedPool[] = data.pools || [];
        setPools(list);
        if (list.length > 0) setSelectedPair(list[0].pairAddress);
      })
      .catch(() => setPools([]));
  }, [selectedChainId]);

  const activePool = pools.find((p) => p.pairAddress === selectedPair) || null;

  useEffect(() => {
    let cancelled = false;
    async function loadLpBalance() {
      setLpBalance('0');
      setTotalSupply('0');
      if (!selectedPair || !account) return;
      const provider = getReadProvider(selectedChainId);
      if (!provider) return;
      try {
        const pool = new Contract(selectedPair, POOL_ABI, provider);
        const [bal, supply] = await Promise.all([pool.balanceOf(account), pool.totalSupply()]);
        if (!cancelled) {
          setLpBalance(formatUnits(bal, 18));
          setTotalSupply(formatUnits(supply, 18));
        }
      } catch {
        // Ignore read error
      }
    }
    loadLpBalance();
    return () => {
      cancelled = true;
    };
  }, [selectedPair, account, selectedChainId, getReadProvider]);

  const lpToBurn = ((Number.parseFloat(lpBalance) * percent) / 100).toFixed(8);
  const shareRatio =
    Number.parseFloat(totalSupply) > 0
      ? Number.parseFloat(lpToBurn) / Number.parseFloat(totalSupply)
      : 0;
  const estToken0 = activePool
    ? (Number.parseFloat(activePool.reserve0) * shareRatio).toFixed(6)
    : '0';
  const estToken1 = activePool
    ? (Number.parseFloat(activePool.reserve1) * shareRatio).toFixed(6)
    : '0';

  const handleRemove = async () => {
    setError(null);
    setStatus(null);
    setTxHash(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!activeNetwork?.routerAddress || !activePool) {
      setError('Router contract or selected liquidity pool is not configured.');
      return;
    }
    if (Number.parseFloat(lpToBurn) <= 0) {
      setError('You hold 0 TATA-LP tokens in this pool on-chain.');
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
      const pool = new Contract(activePool.pairAddress, POOL_ABI, signer);
      const lpWei = parseUnits(lpToBurn, 18);

      const allowance: bigint = await pool.allowance(account, activeNetwork.routerAddress);
      if (allowance < lpWei) {
        setStatus('Approving TATA-LP token withdrawal...');
        const appTx = await pool.approve(activeNetwork.routerAddress, lpWei);
        await appTx.wait();
      }

      setStatus('Confirming Remove Liquidity in your wallet...');
      const router = new Contract(activeNetwork.routerAddress, ROUTER_ABI, signer);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
      const removeTx = await router.removeLiquidity(
        activePool.token0Address,
        activePool.token1Address,
        lpWei,
        0,
        0,
        account,
        deadline
      );
      const receipt = await removeTx.wait();
      setTxHash(receipt.hash);

      await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          txHash: receipt.hash,
          txType: 'remove_liquidity',
          walletAddress: account,
          tokenInAddress: activePool.token0Address,
          tokenInSymbol: activePool.token0Symbol,
          tokenOutAddress: activePool.token1Address,
          tokenOutSymbol: activePool.token1Symbol,
          amountIn: estToken0,
          amountOut: estToken1,
          pairAddress: activePool.pairAddress,
        }),
      });

      setStatus('Liquidity removed on-chain and tokens returned to your wallet.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Remove liquidity transaction failed.');
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
          <h1 className="text-lg font-semibold text-slate-100">Remove Liquidity</h1>
          <p className="text-xs text-slate-400">
            Burn TATA-LP tokens to withdraw your proportional on-chain reserves
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-300">Select Liquidity Pool</label>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 text-xs text-slate-100"
          >
            {pools.length === 0 ? (
              <option value="">No pools deployed on this network</option>
            ) : (
              pools.map((p) => (
                <option key={p.pairAddress} value={p.pairAddress}>
                  {p.token0Symbol} / {p.token1Symbol} ({p.pairAddress.slice(0, 8)}...)
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-3 border-t border-white/[0.07] pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Removal Percentage</span>
            <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
              {percent}%
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="grid grid-cols-4 gap-2">
            {[25, 50, 75, 100].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPercent(v)}
                className={`rounded-md py-1.5 font-mono text-xs ${
                  percent === v
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : 'bg-[#171D2C] text-slate-300 hover:text-slate-100'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-t border-white/[0.07] pt-4 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Your On-Chain LP Balance</span>
            <span className="font-mono text-slate-200 tabular-nums">
              {Number.parseFloat(lpBalance).toFixed(6)} TATA-LP
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Estimated {activePool?.token0Symbol || 'Token 0'}</span>
            <span className="font-mono text-slate-200 tabular-nums">{estToken0}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Estimated {activePool?.token1Symbol || 'Token 1'}</span>
            <span className="font-mono text-slate-200 tabular-nums">{estToken1}</span>
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
          disabled={submitting || !activePool}
          onClick={handleRemove}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          <MinusCircle className="h-4 w-4" />
          {!account
            ? 'Connect Wallet'
            : submitting
            ? 'Removing Liquidity...'
            : 'Confirm Remove Liquidity'}
        </button>
      </div>
    </div>
  );
}
