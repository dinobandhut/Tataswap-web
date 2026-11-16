import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Search, ShieldCheck } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import type { IndexedPool, IndexedToken, PageRoute } from '../types/dex';

export function ExploreTokensPage({
  onSelectToken,
  onNavigate,
}: {
  onSelectToken: (chainId: number, address: string) => void;
  onNavigate: (page: PageRoute) => void;
}) {
  const { selectedChainId, activeNetwork } = useWallet();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [pools, setPools] = useState<IndexedPool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ chainId: String(selectedChainId) });
        if (search.trim()) params.set('q', search.trim());
        const [tRes, pRes] = await Promise.all([
          fetch(`/api/tokens?${params.toString()}`),
          fetch(`/api/pools?chainId=${selectedChainId}`),
        ]);
        if (cancelled) return;
        if (tRes.ok) {
          const data = await tRes.json();
          setTokens(data.tokens || []);
        }
        if (pRes.ok) {
          const data = await pRes.json();
          setPools(data.pools || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChainId, search]);

  const filtered = tokens.filter((t) => {
    if (statusFilter === 'verified') return t.verificationStatus === 'verified';
    if (statusFilter === 'unverified') return t.verificationStatus !== 'verified';
    return true;
  });

  const getTokenPoolStats = (address: string) => {
    const matching = pools.filter(
      (p) =>
        p.token0Address.toLowerCase() === address.toLowerCase() ||
        p.token1Address.toLowerCase() === address.toLowerCase()
    );
    return {
      poolCount: matching.length,
      txCount: matching.reduce((acc, p) => acc + p.txCount, 0),
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Explore Tokens</h1>
          <p className="text-sm text-slate-400">
            Permissionless public token explorer for {activeNetwork?.name || 'BNB Smart Chain Testnet'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('list-token')}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 whitespace-nowrap self-start sm:self-auto"
        >
          List New Token
        </button>
      </div>

      {/* Warning Notice for Unverified Permissionless Tokens */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4 text-xs text-slate-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <span className="font-semibold text-amber-300">Permissionless Listing Risk Notice: </span>
          Any wallet can list an ERC-20 or BEP-20 token on TataSwap without admin pre-approval. Always inspect contract source code, holder distribution, and liquidity lock status before trading tokens marked as Unverified.
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by token name, symbol, or 0x contract address..."
            className="w-full rounded-lg border border-white/10 bg-[#111622] py-2.5 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#111622] p-1 border border-white/[0.08]">
          {(['all', 'verified', 'unverified'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === tab
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Token Table */}
      <div className="rounded-xl border border-white/[0.08] bg-[#111622] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Loading indexed tokens from Cloud SQL...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No matching tokens found on {activeNetwork?.shortName}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.07] text-xs text-slate-500">
                  <th className="px-5 py-3.5 font-medium">Token</th>
                  <th className="px-5 py-3.5 font-medium">Contract Address</th>
                  <th className="px-5 py-3.5 font-medium">Network</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 text-right font-medium">Pools</th>
                  <th className="px-5 py-3.5 text-right font-medium">Tx Count</th>
                  <th className="px-5 py-3.5 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {filtered.map((tok) => {
                  const stats = getTokenPoolStats(tok.address);
                  return (
                    <tr
                      key={tok.id}
                      onClick={() => onSelectToken(tok.chainId, tok.address)}
                      className="cursor-pointer hover:bg-white/[0.025] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-100">{tok.symbol}</div>
                        <div className="text-xs text-slate-400">{tok.name}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-300 tabular-nums">
                        {tok.address.slice(0, 10)}...{tok.address.slice(-6)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-300">
                        {activeNetwork?.shortName || `Chain ${tok.chainId}`}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {tok.verificationStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verified
                          </span>
                        ) : tok.verificationStatus === 'flagged' ? (
                          <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Flagged Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Unverified
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-200 tabular-nums">
                        {stats.poolCount}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-200 tabular-nums">
                        {tok.txCount + stats.txCount}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectToken(tok.chainId, tok.address);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          Open
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
