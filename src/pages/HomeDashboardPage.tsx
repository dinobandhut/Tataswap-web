import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  Compass,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import type {
  AnalyticsSummary,
  IndexedPool,
  IndexedToken,
  IndexedTransaction,
  PageRoute,
} from '../types/dex';

export function HomeDashboardPage({
  onNavigate,
  onSelectToken,
}: {
  onNavigate: (page: PageRoute) => void;
  onSelectToken: (chainId: number, address: string) => void;
}) {
  const { activeNetwork, selectedChainId, networks } = useWallet();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [pools, setPools] = useState<IndexedPool[]>([]);
  const [txs, setTxs] = useState<IndexedTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [aRes, tRes, pRes, txRes] = await Promise.all([
          fetch(`/api/analytics?chainId=${selectedChainId}`),
          fetch(`/api/tokens?chainId=${selectedChainId}`),
          fetch(`/api/pools?chainId=${selectedChainId}`),
          fetch(`/api/transactions?chainId=${selectedChainId}`),
        ]);
        if (cancelled) return;
        if (aRes.ok) {
          const data = await aRes.json();
          setSummary(data.summary);
        }
        if (tRes.ok) {
          const data = await tRes.json();
          setTokens(data.tokens || []);
        }
        if (pRes.ok) {
          const data = await pRes.json();
          setPools(data.pools || []);
        }
        if (txRes.ok) {
          const data = await txRes.json();
          setTxs(data.transactions || []);
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChainId]);

  return (
    <div className="space-y-8">
      <ContractStatusNotice network={activeNetwork} onNavigate={onNavigate} />

      {/* Hero Section */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="space-y-4 lg:col-span-7">
            <div className="text-xs font-medium text-emerald-400">
              {activeNetwork?.name || 'BNB Smart Chain Testnet'} · Non-Custodial AMM
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-100 sm:text-4xl">
              Permissionless Token Listing &amp; Decentralized Liquidity
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-slate-400">
              Connect MetaMask or Trust Wallet to swap tokens, deploy constant-product liquidity pools, and list ERC-20 or BEP-20 tokens permissionlessly with transparent on-chain fee collection.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('swap')}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap"
              >
                <ArrowLeftRight className="h-4 w-4" />
                Launch Swap
              </button>
              <button
                type="button"
                onClick={() => onNavigate('list-token')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#171D2C] px-5 py-2.5 text-sm font-medium text-slate-100 hover:border-emerald-500/40 transition-colors whitespace-nowrap"
              >
                <Coins className="h-4 w-4 text-emerald-400" />
                List Your Token ({activeNetwork?.listingFeeUsdt || '5'} USDT)
              </button>
              <button
                type="button"
                onClick={() => onNavigate('create-pool')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors whitespace-nowrap"
              >
                <Layers className="h-4 w-4" />
                Create Pool
              </button>
            </div>
          </div>

          <div className="border-t border-white/[0.08] pt-6 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 space-y-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>On-Chain Fee Collection Architecture</span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                <span className="text-slate-400">Listing Fee</span>
                <span className="font-mono font-semibold text-slate-100 tabular-nums">
                  {activeNetwork?.listingFeeUsdt || '5'} USDT
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                <span className="text-slate-400">Swap Fee Tier</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {((activeNetwork?.swapFeeBps ?? 30) / 100).toFixed(2)}% ({((activeNetwork?.protocolFeeBps ?? 5) / 100).toFixed(2)}% protocol)
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400">Official Fee Receiver Wallet</span>
                <div className="font-mono text-[11px] text-emerald-400 break-all tabular-nums">
                  {activeNetwork?.feeReceiverWallet || '0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Indexed Tokens</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : summary?.totalListedTokens ?? tokens.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">On {activeNetwork?.shortName || 'BSC Testnet'}</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Liquidity Pools</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : summary?.totalPools ?? pools.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Factory pairs synced</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Verified Swaps</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : summary?.totalSwaps ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Confirmed via RPC receipts</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Listing Fees Collected</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {loading ? '—' : `${summary?.totalListingFeesCollected ?? '0.0000'} USDT`}
          </div>
          <div className="mt-1 text-xs text-slate-500">Transferred directly on-chain</div>
        </div>
      </section>

      {/* Two-Column Split: Indexed Tokens + Supported Blockchains */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Indexed Tokens</h2>
              <p className="text-xs text-slate-400">
                Real ERC-20 / BEP-20 contracts registered on {activeNetwork?.shortName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('explore')}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300"
            >
              <Compass className="h-3.5 w-3.5" />
              Explore All
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            {tokens.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                No tokens indexed on this network yet. List a token permissionlessly to register it.
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-slate-500">
                    <th className="pb-2.5 font-medium">Token</th>
                    <th className="pb-2.5 font-medium">Contract</th>
                    <th className="pb-2.5 font-medium">Status</th>
                    <th className="pb-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {tokens.slice(0, 6).map((tok) => (
                    <tr key={tok.id} className="hover:bg-white/[0.02]">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-100">{tok.symbol}</div>
                        <div className="text-xs text-slate-400">{tok.name}</div>
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300 tabular-nums">
                        {tok.address.slice(0, 8)}...{tok.address.slice(-6)}
                      </td>
                      <td className="py-3 pr-4 text-xs">
                        {tok.verificationStatus === 'verified' ? (
                          <span className="text-emerald-400">Verified</span>
                        ) : tok.verificationStatus === 'flagged' ? (
                          <span className="text-red-400">Flagged</span>
                        ) : (
                          <span className="text-amber-400">Unverified</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectToken(tok.chainId, tok.address)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 hover:text-emerald-400"
                        >
                          Inspect
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 lg:col-span-5">
          <div className="border-b border-white/[0.07] pb-4">
            <h2 className="text-base font-semibold text-slate-100">Supported Networks</h2>
            <p className="text-xs text-slate-400">
              Testnet-first deployment with multi-chain EVM readiness
            </p>
          </div>
          <div className="mt-4 divide-y divide-white/[0.05]">
            {networks.map((net) => (
              <div key={net.chainId} className="flex items-center justify-between py-3 text-xs">
                <div>
                  <div className="font-medium text-slate-100">{net.name}</div>
                  <div className="text-slate-500">
                    Chain ID {net.chainId} · {net.nativeSymbol} · {net.isTestnet ? 'Testnet' : 'Mainnet'}
                  </div>
                </div>
                <div className="text-right">
                  {net.listingFeeContract ? (
                    <span className="text-emerald-400 font-medium">Contracts Ready</span>
                  ) : net.isEnabled ? (
                    <span className="text-amber-400">Awaiting Deploy</span>
                  ) : (
                    <span className="text-slate-500">Prepared</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Verified Transactions */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
          <h2 className="text-base font-semibold text-slate-100">Recent Verified On-Chain Activity</h2>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300"
          >
            View All History
          </button>
        </div>

        {txs.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No verified transactions indexed on {activeNetwork?.shortName || 'this network'} yet. Execute an on-chain swap, listing, or liquidity operation to record it here.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500">
                  <th className="pb-2.5 font-medium">Type</th>
                  <th className="pb-2.5 font-medium">Pair / Token</th>
                  <th className="pb-2.5 font-medium">Wallet</th>
                  <th className="pb-2.5 font-medium">Block</th>
                  <th className="pb-2.5 text-right font-medium">Tx Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {txs.slice(0, 6).map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 font-medium text-slate-200">{tx.txType}</td>
                    <td className="py-3 text-slate-300">
                      {tx.tokenInSymbol || '—'} → {tx.tokenOutSymbol || '—'}
                    </td>
                    <td className="py-3 font-mono text-slate-400 tabular-nums">
                      {tx.walletAddress.slice(0, 6)}...{tx.walletAddress.slice(-4)}
                    </td>
                    <td className="py-3 font-mono text-slate-400 tabular-nums">#{tx.blockNumber}</td>
                    <td className="py-3 text-right font-mono tabular-nums">
                      <a
                        href={`${activeNetwork?.explorerUrl || 'https://testnet.bscscan.com'}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:underline"
                      >
                        {tx.txHash.slice(0, 10)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
