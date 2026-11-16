import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ExternalLink,
  PlusCircle,
  ShieldCheck,
} from 'lucide-react';
import type {
  IndexedPool,
  IndexedToken,
  IndexedTransaction,
  NetworkConfig,
  PageRoute,
} from '../types/dex';

interface LiveTokenOnChain {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  bytecodeSizeBytes: number;
}

export function TokenDetailsPage({
  chainId,
  address,
  onBack,
  onNavigate,
}: {
  chainId: number;
  address: string;
  onBack: () => void;
  onNavigate: (page: PageRoute) => void;
}) {
  const [token, setToken] = useState<IndexedToken | null>(null);
  const [live, setLive] = useState<LiveTokenOnChain | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [pools, setPools] = useState<IndexedPool[]>([]);
  const [txs, setTxs] = useState<IndexedTransaction[]>([]);
  const [network, setNetwork] = useState<NetworkConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/tokens/${chainId}/${address}`);
        if (!res.ok) throw new Error('Failed to load token details');
        const data = await res.json();
        if (cancelled) return;
        setToken(data.token);
        setLive(data.liveOnChain);
        setRpcError(data.rpcError);
        setPools(data.pools || []);
        setTxs(data.transactions || []);
        setNetwork(data.network);
      } catch (err: unknown) {
        if (!cancelled) {
          setRpcError(err instanceof Error ? err.message : 'Unable to fetch token details');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (address) load();
    return () => {
      cancelled = true;
    };
  }, [chainId, address]);

  const displayName = live?.name || token?.name || 'Unknown Token';
  const displaySymbol = live?.symbol || token?.symbol || 'TOKEN';
  const verificationStatus = token?.verificationStatus || 'unverified';

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Token Explorer
      </button>

      {loading ? (
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-8 text-center text-sm text-slate-400">
          Verifying live on-chain contract metadata via {network?.shortName || 'RPC'}...
        </div>
      ) : (
        <>
          {/* Header Card */}
          <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-slate-100">
                    {displayName} ({displaySymbol})
                  </h1>
                  {verificationStatus === 'verified' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      {verificationStatus === 'flagged' ? 'Flagged High Risk' : 'Unverified Token'}
                    </span>
                  )}
                </div>
                <div className="font-mono text-xs text-slate-400 break-all tabular-nums">
                  {address} · {network?.name || `Chain ${chainId}`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onNavigate('swap')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Swap {displaySymbol}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('add-liquidity')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#171D2C] px-4 py-2 text-xs font-medium text-slate-100 hover:border-emerald-500/40"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  Add Liquidity
                </button>
                {network && (
                  <a
                    href={`${network.explorerUrl}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                  >
                    Explorer
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>

            {verificationStatus !== 'verified' && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] p-3.5 text-xs text-amber-200/90">
                <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
                <div>
                  This token was listed permissionlessly and has not been verified by TataSwap administrators. Malicious tokens may implement transfer taxes, honeypots, or mint functions—audit the contract on {network?.shortName} Explorer before interacting.
                </div>
              </div>
            )}

            {rpcError && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                Live RPC check warning: {rpcError}
              </div>
            )}

            {/* Metadata Grid */}
            <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-5 sm:grid-cols-4">
              <div>
                <div className="text-xs text-slate-500">Decimals</div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-100 tabular-nums">
                  {live?.decimals ?? token?.decimals ?? '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">On-Chain Total Supply</div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-100 tabular-nums truncate">
                  {live?.totalSupply
                    ? Number.parseFloat(live.totalSupply).toLocaleString()
                    : token?.totalSupply || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Bytecode Size</div>
                <div className="mt-1 font-mono text-base font-semibold text-slate-100 tabular-nums">
                  {live?.bytecodeSizeBytes ? `${live.bytecodeSizeBytes} bytes` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Listing Fee Paid</div>
                <div className="mt-1 font-mono text-base font-semibold text-emerald-400 tabular-nums">
                  {token?.listingFeePaid && Number(token.listingFeePaid) > 0
                    ? `${token.listingFeePaid} USDT`
                    : 'Base Asset'}
                </div>
              </div>
            </div>
          </section>

          {/* Associated Liquidity Pools */}
          <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
            <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
              Liquidity Pools
            </h2>
            {pools.length === 0 ? (
              <div className="py-6 text-sm text-slate-400">
                No liquidity pools indexed for {displaySymbol} yet. Create a pool to establish on-chain pricing and swap liquidity.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-slate-500">
                      <th className="py-2.5 font-medium">Pair</th>
                      <th className="py-2.5 font-medium">Contract</th>
                      <th className="py-2.5 text-right font-medium">Reserve 0</th>
                      <th className="py-2.5 text-right font-medium">Reserve 1</th>
                      <th className="py-2.5 text-right font-medium">Fee Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {pools.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 font-medium text-slate-100">
                          {p.token0Symbol} / {p.token1Symbol}
                        </td>
                        <td className="py-3 font-mono text-slate-400 tabular-nums">
                          {p.pairAddress.slice(0, 10)}...{p.pairAddress.slice(-6)}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                          {Number.parseFloat(p.reserve0).toFixed(4)} {p.token0Symbol}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                          {Number.parseFloat(p.reserve1).toFixed(4)} {p.token1Symbol}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-300 tabular-nums">
                          {(p.feeTierBps / 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent Verified Transactions */}
          <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
            <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
              Verified Token Transactions
            </h2>
            {txs.length === 0 ? (
              <div className="py-6 text-sm text-slate-400">
                No verified transactions recorded for this token yet.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-slate-500">
                      <th className="py-2.5 font-medium">Action</th>
                      <th className="py-2.5 font-medium">Wallet</th>
                      <th className="py-2.5 text-right font-medium">Amount In</th>
                      <th className="py-2.5 text-right font-medium">Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {txs.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-3 text-slate-200">{tx.txType}</td>
                        <td className="py-3 font-mono text-slate-400 tabular-nums">
                          {tx.walletAddress.slice(0, 8)}...{tx.walletAddress.slice(-4)}
                        </td>
                        <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                          {tx.amountIn} {tx.tokenInSymbol}
                        </td>
                        <td className="py-3 text-right font-mono tabular-nums">
                          <a
                            href={`${network?.explorerUrl || 'https://testnet.bscscan.com'}/tx/${tx.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-400 hover:underline"
                          >
                            {tx.txHash.slice(0, 12)}...
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
