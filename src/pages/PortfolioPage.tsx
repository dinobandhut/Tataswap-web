import React, { useEffect, useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';
import { Contract, formatUnits } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ERC20_ABI, POOL_ABI } from '../lib/abis';
import type { IndexedPool, IndexedToken, PageRoute } from '../types/dex';

interface TokenBalanceRow {
  token: IndexedToken;
  balance: string;
}

interface LpPositionRow {
  pool: IndexedPool;
  lpBalance: string;
  sharePct: string;
}

export function PortfolioPage({
  onSelectToken,
}: {
  onNavigate: (page: PageRoute) => void;
  onSelectToken: (chainId: number, address: string) => void;
}) {
  const {
    account,
    nativeBalance,
    selectedChainId,
    activeNetwork,
    getReadProvider,
    setWalletModalOpen,
  } = useWallet();

  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>([]);
  const [lpPositions, setLpPositions] = useState<LpPositionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadOnChainPortfolio = async () => {
    if (!account) return;
    const provider = getReadProvider(selectedChainId);
    if (!provider) return;

    setLoading(true);
    try {
      const [tRes, pRes] = await Promise.all([
        fetch(`/api/tokens?chainId=${selectedChainId}`),
        fetch(`/api/pools?chainId=${selectedChainId}`),
      ]);
      const tokens: IndexedToken[] = tRes.ok ? (await tRes.json()).tokens || [] : [];
      const pools: IndexedPool[] = pRes.ok ? (await pRes.json()).pools || [] : [];

      const tokRows = await Promise.all(
        tokens.map(async (tok) => {
          try {
            const c = new Contract(tok.address, ERC20_ABI, provider);
            const raw = await c.balanceOf(account);
            return { token: tok, balance: formatUnits(raw, tok.decimals) };
          } catch {
            return { token: tok, balance: '0' };
          }
        })
      );
      setTokenBalances(tokRows);

      const lpRows = await Promise.all(
        pools.map(async (pool) => {
          try {
            const c = new Contract(pool.pairAddress, POOL_ABI, provider);
            const [raw, supply] = await Promise.all([c.balanceOf(account), c.totalSupply()]);
            const balNum = Number.parseFloat(formatUnits(raw, 18));
            const supNum = Number.parseFloat(formatUnits(supply, 18));
            const share = supNum > 0 ? ((balNum / supNum) * 100).toFixed(4) : '0.0000';
            return { pool, lpBalance: formatUnits(raw, 18), sharePct: share };
          } catch {
            return { pool, lpBalance: '0', sharePct: '0.0000' };
          }
        })
      );
      setLpPositions(lpRows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOnChainPortfolio();
  }, [account, selectedChainId]);

  if (!account) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-10 text-center space-y-4">
        <Wallet className="mx-auto h-8 w-8 text-emerald-400" />
        <h1 className="text-xl font-bold text-slate-100">On-Chain Portfolio</h1>
        <p className="mx-auto max-w-md text-sm text-slate-400">
          Connect MetaMask or Trust Wallet to inspect your real on-chain token balances and LP positions. Balances are read directly from blockchain RPC nodes—never from centralized databases.
        </p>
        <button
          type="button"
          onClick={() => setWalletModalOpen(true)}
          className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">On-Chain Portfolio</h1>
          <p className="font-mono text-xs text-slate-400 tabular-nums">
            Wallet: {account} · {activeNetwork?.name}
          </p>
        </div>
        <button
          type="button"
          onClick={loadOnChainPortfolio}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#111622] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Blockchain Balances
        </button>
      </div>

      {/* Native Asset */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <div className="text-xs text-slate-400">Native Gas Balance ({activeNetwork?.shortName})</div>
        <div className="mt-2 font-mono text-3xl font-bold text-slate-100 tabular-nums">
          {Number.parseFloat(nativeBalance).toFixed(6)} {activeNetwork?.nativeSymbol || 'tBNB'}
        </div>
      </section>

      {/* ERC-20 / BEP-20 Token Balances */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
          Token Balances (Live RPC)
        </h2>
        {loading ? (
          <div className="py-6 text-sm text-slate-400">Querying token contracts on-chain...</div>
        ) : tokenBalances.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">No indexed tokens on this network.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500">
                  <th className="py-2.5 font-medium">Token</th>
                  <th className="py-2.5 font-medium">Contract</th>
                  <th className="py-2.5 text-right font-medium">On-Chain Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {tokenBalances.map(({ token, balance }) => (
                  <tr
                    key={token.id}
                    onClick={() => onSelectToken(token.chainId, token.address)}
                    className="cursor-pointer hover:bg-white/[0.02]"
                  >
                    <td className="py-3">
                      <span className="font-semibold text-slate-100">{token.symbol}</span>
                      <span className="ml-2 text-slate-400">{token.name}</span>
                    </td>
                    <td className="py-3 font-mono text-slate-400 tabular-nums">
                      {token.address.slice(0, 10)}...{token.address.slice(-6)}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-slate-100 tabular-nums">
                      {Number.parseFloat(balance).toFixed(6)} {token.symbol}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* LP Positions */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
          Liquidity Pool Positions (TATA-LP)
        </h2>
        {lpPositions.length === 0 ? (
          <div className="py-6 text-sm text-slate-400">
            No liquidity pools deployed on this network yet.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-500">
                  <th className="py-2.5 font-medium">Pool</th>
                  <th className="py-2.5 text-right font-medium">LP Balance</th>
                  <th className="py-2.5 text-right font-medium">Pool Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {lpPositions.map(({ pool, lpBalance, sharePct }) => (
                  <tr key={pool.id}>
                    <td className="py-3 font-medium text-slate-100">
                      {pool.token0Symbol} / {pool.token1Symbol}
                    </td>
                    <td className="py-3 text-right font-mono text-slate-200 tabular-nums">
                      {Number.parseFloat(lpBalance).toFixed(6)} TATA-LP
                    </td>
                    <td className="py-3 text-right font-mono text-emerald-400 tabular-nums">
                      {sharePct}%
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
