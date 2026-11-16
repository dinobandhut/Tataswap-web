import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Layers, RefreshCw } from 'lucide-react';
import { Contract, isAddress } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import { FACTORY_ABI } from '../lib/abis';
import type { IndexedPool, IndexedToken, PageRoute } from '../types/dex';

export function CreatePoolPage({ onNavigate }: { onNavigate: (page: PageRoute) => void }) {
  const {
    account,
    selectedChainId,
    activeNetwork,
    getBrowserProvider,
    getReadProvider,
    setWalletModalOpen,
  } = useWallet();

  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [pools, setPools] = useState<IndexedPool[]>([]);
  const [tokenA, setTokenA] = useState('');
  const [tokenB, setTokenB] = useState('');
  const [existingPair, setExistingPair] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [tRes, pRes] = await Promise.all([
        fetch(`/api/tokens?chainId=${selectedChainId}`),
        fetch(`/api/pools?chainId=${selectedChainId}`),
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        const list: IndexedToken[] = tData.tokens || [];
        setTokens(list);
        if (list.length >= 2 && !tokenA && !tokenB) {
          setTokenA(list[0].address);
          setTokenB(list[1].address);
        }
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPools(pData.pools || []);
      }
    } catch (err) {
      console.error('Failed to load pools:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedChainId]);

  useEffect(() => {
    let cancelled = false;
    async function checkPair() {
      setExistingPair('');
      if (!activeNetwork?.factoryAddress || !isAddress(tokenA) || !isAddress(tokenB)) return;
      if (tokenA.toLowerCase() === tokenB.toLowerCase()) return;
      const provider = getReadProvider(selectedChainId);
      if (!provider) return;
      try {
        const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, provider);
        const pair = await factory.getPair(tokenA, tokenB);
        if (!cancelled && pair !== '0x0000000000000000000000000000000000000000') {
          setExistingPair(pair);
        }
      } catch {
        // Ignore read error
      }
    }
    checkPair();
    return () => {
      cancelled = true;
    };
  }, [tokenA, tokenB, activeNetwork, selectedChainId, getReadProvider]);

  const handleCreatePair = async () => {
    setError(null);
    setStatus(null);
    setTxHash(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!activeNetwork?.factoryAddress) {
      setError('TataSwapFactory contract is not configured for this network yet.');
      return;
    }
    if (!isAddress(tokenA) || !isAddress(tokenB) || tokenA.toLowerCase() === tokenB.toLowerCase()) {
      setError('Select two distinct ERC-20 / BEP-20 token contract addresses.');
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
      const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, signer);
      setStatus('Confirm pair creation in your wallet...');
      const tx = await factory.createPair(tokenA, tokenB);
      const receipt = await tx.wait();
      setTxHash(receipt.hash);

      const newPairAddr = await factory.getPair(tokenA, tokenB);
      setExistingPair(newPairAddr);

      await fetch('/api/pools/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          pairAddress: newPairAddr,
          creatorWallet: account,
          creationTxHash: receipt.hash,
        }),
      });

      await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          txHash: receipt.hash,
          txType: 'create_pool',
          walletAddress: account,
          tokenInAddress: tokenA,
          tokenOutAddress: tokenB,
          pairAddress: newPairAddr,
        }),
      });

      setStatus(`Liquidity pair deployed at ${newPairAddr}. Proceed to Add Liquidity.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deploy liquidity pair.');
      setStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncPool = async (pairAddr: string) => {
    try {
      await fetch('/api/pools/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: selectedChainId, pairAddress: pairAddr }),
      });
      await loadData();
    } catch (err) {
      console.error('Pool sync failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      <ContractStatusNotice network={activeNetwork} onNavigate={onNavigate} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-5 lg:col-span-5">
          <div className="border-b border-white/[0.07] pb-4">
            <h1 className="text-lg font-semibold text-slate-100">Create Liquidity Pool</h1>
            <p className="text-xs text-slate-400">
              Deploy a permissionless trading pair via TataSwapFactory
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Token A Contract</label>
              <input
                type="text"
                value={tokenA}
                onChange={(e) => setTokenA(e.target.value.trim())}
                placeholder="0x..."
                className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 font-mono text-xs text-slate-100"
              />
              {tokens.length > 0 && (
                <select
                  value={tokenA}
                  onChange={(e) => setTokenA(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#171D2C] px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">Or pick indexed token...</option>
                  {tokens.map((t) => (
                    <option key={`a-${t.address}`} value={t.address}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">Token B Contract</label>
              <input
                type="text"
                value={tokenB}
                onChange={(e) => setTokenB(e.target.value.trim())}
                placeholder="0x..."
                className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 font-mono text-xs text-slate-100"
              />
              {tokens.length > 0 && (
                <select
                  value={tokenB}
                  onChange={(e) => setTokenB(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#171D2C] px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">Or pick indexed token...</option>
                  {tokens.map((t) => (
                    <option key={`b-${t.address}`} value={t.address}>
                      {t.symbol} — {t.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {existingPair && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              Pair already deployed at <span className="font-mono break-all">{existingPair}</span>. You can add liquidity immediately.
            </div>
          )}

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

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={submitting || Boolean(existingPair)}
              onClick={handleCreatePair}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              <Layers className="h-4 w-4" />
              {submitting ? 'Deploying Pool...' : 'Create Trading Pair'}
            </button>
            {existingPair && (
              <button
                type="button"
                onClick={() => onNavigate('add-liquidity')}
                className="w-full rounded-lg border border-white/10 bg-[#171D2C] py-2.5 text-xs font-medium text-slate-100 hover:border-emerald-500/40"
              >
                Go to Add Liquidity
              </button>
            )}
          </div>
        </div>

        {/* Right: Active Pools Table */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">On-Chain Liquidity Pools</h2>
              <p className="text-xs text-slate-400">
                Real reserves synced from {activeNetwork?.shortName || 'BNB Testnet'}
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {pools.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No pools deployed on this network yet. No simulated liquidity is displayed—create the first trading pair to seed real reserves.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-slate-500">
                    <th className="pb-2.5 font-medium">Pair</th>
                    <th className="pb-2.5 text-right font-medium">Reserves</th>
                    <th className="pb-2.5 text-right font-medium">Fee Tier</th>
                    <th className="pb-2.5 text-right font-medium">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {pools.map((pool) => (
                    <tr key={pool.id}>
                      <td className="py-3">
                        <div className="font-semibold text-slate-100">
                          {pool.token0Symbol} / {pool.token1Symbol}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 tabular-nums">
                          {pool.pairAddress.slice(0, 10)}...{pool.pairAddress.slice(-6)}
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                        <div>
                          {Number.parseFloat(pool.reserve0).toFixed(4)} {pool.token0Symbol}
                        </div>
                        <div className="text-slate-400">
                          {Number.parseFloat(pool.reserve1).toFixed(4)} {pool.token1Symbol}
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-slate-300 tabular-nums">
                        {(pool.feeTierBps / 100).toFixed(2)}%
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleSyncPool(pool.pairAddress)}
                          className="text-emerald-400 hover:underline"
                        >
                          Sync RPC
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
