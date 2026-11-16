import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Search } from 'lucide-react';
import { isHexString } from 'ethers';
import { useWallet } from '../context/WalletContext';
import type { IndexedTransaction } from '../types/dex';

export function TransactionHistoryPage() {
  const { selectedChainId, activeNetwork, account } = useWallet();
  const [txType, setTxType] = useState<string>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [transactions, setTransactions] = useState<IndexedTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [verifyHash, setVerifyHash] = useState('');
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);

  const loadTxs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ chainId: String(selectedChainId) });
      if (txType !== 'all') params.set('type', txType);
      if (onlyMine && account) params.set('wallet', account);
      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTxs();
  }, [selectedChainId, txType, onlyMine, account]);

  const handleManualVerify = async () => {
    setVerifyMsg(null);
    setVerifyErr(null);
    if (!isHexString(verifyHash.trim(), 32)) {
      setVerifyErr('Enter a valid 32-byte transaction hash (0x...).');
      return;
    }
    try {
      const res = await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          txHash: verifyHash.trim(),
          txType: 'swap',
          walletAddress: account || '0x0000000000000000000000000000000000000000',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setVerifyMsg(
        data.verified
          ? `Confirmed on-chain at block #${data.transaction?.blockNumber} and indexed.`
          : 'Transaction is still pending on-chain.'
      );
      setVerifyHash('');
      await loadTxs();
    } catch (err: unknown) {
      setVerifyErr(err instanceof Error ? err.message : 'Unable to verify txHash on RPC.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Transaction History</h1>
          <p className="text-sm text-slate-400">
            RPC-verified swaps, token listings, pool creations, and liquidity actions on {activeNetwork?.name}
          </p>
        </div>

        {account && (
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => setOnlyMine(e.target.checked)}
              className="accent-emerald-500"
            />
            Show only my connected wallet
          </label>
        )}
      </div>

      {/* Filter Tabs + Manual Tx Receipt Verifier */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/[0.08] bg-[#111622] p-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'swap', label: 'Swaps' },
            { id: 'token_listing', label: 'Listings' },
            { id: 'add_liquidity', label: 'Add LP' },
            { id: 'remove_liquidity', label: 'Remove LP' },
            { id: 'create_pool', label: 'Pools' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTxType(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                txType === tab.id
                  ? 'bg-emerald-500 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={verifyHash}
            onChange={(e) => setVerifyHash(e.target.value)}
            placeholder="Verify tx hash on-chain (0x...)"
            className="w-64 rounded-lg border border-white/10 bg-[#111622] px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-500"
          />
          <button
            type="button"
            onClick={handleManualVerify}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#171D2C] px-3 py-2 text-xs font-medium text-slate-200 hover:border-emerald-500/40 whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" />
            Verify Receipt
          </button>
        </div>
      </div>

      {verifyErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {verifyErr}
        </div>
      )}
      {verifyMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          {verifyMsg}
        </div>
      )}

      <div className="rounded-xl border border-white/[0.08] bg-[#111622] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-400">Loading verified ledger...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No verified transactions recorded for this filter yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.07] text-slate-500">
                  <th className="px-5 py-3.5 font-medium">Type</th>
                  <th className="px-5 py-3.5 font-medium">Assets</th>
                  <th className="px-5 py-3.5 font-medium">Wallet</th>
                  <th className="px-5 py-3.5 text-right font-medium">Block</th>
                  <th className="px-5 py-3.5 text-right font-medium">Status</th>
                  <th className="px-5 py-3.5 text-right font-medium">Explorer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-medium text-slate-100">{tx.txType}</td>
                    <td className="px-5 py-3.5 font-mono text-slate-300 tabular-nums">
                      {tx.amountIn} {tx.tokenInSymbol || '—'} → {tx.amountOut} {tx.tokenOutSymbol || '—'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-400 tabular-nums">
                      {tx.walletAddress.slice(0, 8)}...{tx.walletAddress.slice(-4)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-slate-400 tabular-nums">
                      #{tx.blockNumber}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <a
                        href={`${activeNetwork?.explorerUrl || 'https://testnet.bscscan.com'}/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-emerald-400 hover:underline"
                      >
                        {tx.txHash.slice(0, 10)}...
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
