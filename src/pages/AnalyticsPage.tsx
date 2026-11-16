import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import type { AnalyticsSummary, ListingFeeRecord, NetworkConfig } from '../types/dex';

export function AnalyticsPage() {
  const { selectedChainId, activeNetwork } = useWallet();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [fees, setFees] = useState<ListingFeeRecord[]>([]);
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics?chainId=${selectedChainId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setSummary(data.summary);
        setFees(data.feeCollections || []);
        setNetworks(data.networks || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChainId]);

  const swapFeePct = ((activeNetwork?.swapFeeBps ?? 30) / 100).toFixed(2);
  const protocolFeePct = ((activeNetwork?.protocolFeeBps ?? 5) / 100).toFixed(2);
  const lpFeePct = (
    ((activeNetwork?.swapFeeBps ?? 30) - (activeNetwork?.protocolFeeBps ?? 5)) /
    100
  ).toFixed(2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Protocol Analytics &amp; Fees</h1>
        <p className="text-sm text-slate-400">
          Transparent fee accounting computed strictly from verified on-chain records
        </p>
      </div>

      {/* KPI Grid */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Total Listed Tokens</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : summary?.totalListedTokens ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Total Swap Transactions</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : summary?.totalSwaps ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Listing Fees Collected</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {loading ? '—' : `${summary?.totalListingFeesCollected ?? '0.0000'} USDT`}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Swap Fee Split</div>
          <div className="mt-2 font-mono text-lg font-bold text-slate-100 tabular-nums">
            {swapFeePct}% ({lpFeePct}% LP + {protocolFeePct}% Protocol)
          </div>
        </div>
      </section>

      {/* Owner Fee Receiver Summary */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-100">
          On-Chain Fee Receiver Configuration
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 text-xs">
          <div>
            <div className="text-slate-500">Official Owner Fee Wallet</div>
            <div className="mt-1 font-mono text-emerald-400 break-all tabular-nums">
              {summary?.officialFeeReceiver || '0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4'}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Current Listing Fee</div>
            <div className="mt-1 font-mono text-slate-100 tabular-nums">
              {activeNetwork?.listingFeeUsdt || '5'} USDT per token listing
            </div>
          </div>
          <div>
            <div className="text-slate-500">Configured Networks</div>
            <div className="mt-1 font-mono text-slate-100 tabular-nums">
              {networks.filter((n) => n.isEnabled).length} active / {networks.length} total EVM targets
            </div>
          </div>
        </div>
      </section>

      {/* Listing Fee Collection History */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
          Owner Listing Fee Collection History
        </h2>
        {fees.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No listing fee transactions recorded on {activeNetwork?.shortName} yet. Every token listing fee is sent directly on-chain to 0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4 and verified here.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500">
                  <th className="py-2.5 font-medium">Lister Wallet</th>
                  <th className="py-2.5 font-medium">Listed Token</th>
                  <th className="py-2.5 text-right font-medium">Fee Paid</th>
                  <th className="py-2.5 font-medium">Receiver Wallet</th>
                  <th className="py-2.5 text-right font-medium">Tx Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td className="py-3 font-mono text-slate-300 tabular-nums">
                      {f.listerWallet.slice(0, 8)}...{f.listerWallet.slice(-4)}
                    </td>
                    <td className="py-3 text-slate-100 font-medium">{f.tokenSymbol}</td>
                    <td className="py-3 text-right font-mono text-emerald-400 tabular-nums">
                      {f.amountPaid} {f.paymentSymbol}
                    </td>
                    <td className="py-3 font-mono text-slate-400 tabular-nums">
                      {f.receiverWallet.slice(0, 8)}...{f.receiverWallet.slice(-4)}
                    </td>
                    <td className="py-3 text-right">
                      <a
                        href={`${activeNetwork?.explorerUrl || 'https://testnet.bscscan.com'}/tx/${f.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-emerald-400 hover:underline"
                      >
                        {f.txHash.slice(0, 10)}...
                        <ExternalLink className="h-3 w-3" />
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
