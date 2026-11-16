import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LogIn,
  LogOut,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
} from 'lucide-react';
import { Contract, isAddress, parseUnits } from 'ethers';
import { useAuth } from '../context/AuthContext';
import { useWallet } from '../context/WalletContext';
import { FEE_MANAGER_ABI, LISTING_FEE_ABI } from '../lib/abis';
import type { IndexedToken, ListingFeeRecord, NetworkConfig } from '../types/dex';

interface AdminOverview {
  operatorEmail: string;
  officialFeeReceiver: string;
  metrics: {
    totalListedTokens: number;
    totalPools: number;
    totalTransactions: number;
    totalSwaps: number;
    totalListingFeesCollected: string;
  };
  networks: NetworkConfig[];
  recentFees: ListingFeeRecord[];
  auditLogs: {
    id: number;
    actorWallet: string;
    action: string;
    details: string;
    createdAt: string;
  }[];
}

export function AdminDashboardPage() {
  const { user, signInWithGoogle, logout, getIdToken } = useAuth();
  const {
    account,
    selectedChainId,
    refreshNetworks,
    getBrowserProvider,
    signMessage,
    setWalletModalOpen,
  } = useWallet();

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [tokens, setTokens] = useState<IndexedToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable config for selected network
  const [editChainId, setEditChainId] = useState<number>(selectedChainId);
  const [factoryAddr, setFactoryAddr] = useState('');
  const [routerAddr, setRouterAddr] = useState('');
  const [listingFeeAddr, setListingFeeAddr] = useState('');
  const [feeManagerAddr, setFeeManagerAddr] = useState('');
  const [listingFeeUsdt, setListingFeeUsdt] = useState('5');
  const [feeReceiver, setFeeReceiver] = useState('0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4');
  const [swapFeeBps, setSwapFeeBps] = useState(30);
  const [protocolFeeBps, setProtocolFeeBps] = useState(5);
  const [isEnabled, setIsEnabled] = useState(true);

  const loadAdminData = async () => {
    const token = await getIdToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [ovRes, tokRes] = await Promise.all([
        fetch('/api/admin/overview', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/tokens'),
      ]);
      if (!ovRes.ok) {
        const d = await ovRes.json();
        throw new Error(d.error || 'Failed to load admin overview');
      }
      const ovData: AdminOverview = await ovRes.json();
      setOverview(ovData);

      const targetNet =
        ovData.networks.find((n) => n.chainId === editChainId) || ovData.networks[0];
      if (targetNet) {
        setEditChainId(targetNet.chainId);
        setFactoryAddr(targetNet.factoryAddress);
        setRouterAddr(targetNet.routerAddress);
        setListingFeeAddr(targetNet.listingFeeContract);
        setFeeManagerAddr(targetNet.feeManagerContract);
        setListingFeeUsdt(targetNet.listingFeeUsdt);
        setFeeReceiver(targetNet.feeReceiverWallet);
        setSwapFeeBps(targetNet.swapFeeBps);
        setProtocolFeeBps(targetNet.protocolFeeBps);
        setIsEnabled(targetNet.isEnabled);
      }

      if (tokRes.ok) {
        const tData = await tokRes.json();
        setTokens(tData.tokens || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadAdminData();
    }
  }, [user]);

  const handleSelectEditChain = (cid: number) => {
    setEditChainId(cid);
    const targetNet = overview?.networks.find((n) => n.chainId === cid);
    if (targetNet) {
      setFactoryAddr(targetNet.factoryAddress);
      setRouterAddr(targetNet.routerAddress);
      setListingFeeAddr(targetNet.listingFeeContract);
      setFeeManagerAddr(targetNet.feeManagerContract);
      setListingFeeUsdt(targetNet.listingFeeUsdt);
      setFeeReceiver(targetNet.feeReceiverWallet);
      setSwapFeeBps(targetNet.swapFeeBps);
      setProtocolFeeBps(targetNet.protocolFeeBps);
      setIsEnabled(targetNet.isEnabled);
    }
  };

  const handleSaveConfig = async (applyOnChain: boolean) => {
    setError(null);
    setSuccess(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!isAddress(feeReceiver)) {
      setError('Enter a valid fee receiver EVM address.');
      return;
    }

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Sign in with Google to authorize admin actions.');

      let onChainTxHash = '';

      if (applyOnChain) {
        const browserProvider = getBrowserProvider();
        if (!browserProvider) throw new Error('Connect owner wallet first.');
        const signer = await browserProvider.getSigner();

        if (listingFeeAddr && isAddress(listingFeeAddr)) {
          const listingContract = new Contract(listingFeeAddr, LISTING_FEE_ABI, signer);
          const feeTx = await listingContract.setListingFee(parseUnits(listingFeeUsdt || '5', 18));
          const r1 = await feeTx.wait();
          onChainTxHash = r1.hash;

          const recTx = await listingContract.setFeeReceiverWallet(feeReceiver);
          await recTx.wait();
        }
        if (feeManagerAddr && isAddress(feeManagerAddr)) {
          const fm = new Contract(feeManagerAddr, FEE_MANAGER_ABI, signer);
          const fmTx = await fm.setProtocolFeeReceiver(feeReceiver);
          await fmTx.wait();
          const bpsTx = await fm.setSwapFees(swapFeeBps, protocolFeeBps);
          await bpsTx.wait();
        }
      }

      const signedMessage = `TataSwap Admin Config Update | Chain ${editChainId} | Fee ${listingFeeUsdt} USDT | Receiver ${feeReceiver} | Timestamp ${Date.now()}`;
      const signature = await signMessage(signedMessage);

      const res = await fetch('/api/admin/network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          chainId: editChainId,
          walletAddress: account,
          signature,
          signedMessage,
          isEnabled,
          factoryAddress: factoryAddr.trim(),
          routerAddress: routerAddr.trim(),
          listingFeeContract: listingFeeAddr.trim(),
          feeManagerContract: feeManagerAddr.trim(),
          listingFeeUsdt,
          feeReceiverWallet: feeReceiver,
          swapFeeBps,
          protocolFeeBps,
          txHash: onChainTxHash,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save network config.');

      await refreshNetworks();
      await loadAdminData();
      setSuccess(
        applyOnChain
          ? 'Smart contract parameters updated on-chain and synced to backend.'
          : 'Network contract configuration saved and signed.'
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Admin update failed.');
    }
  };

  const handleEmergencyPause = async (pause: boolean) => {
    setError(null);
    setSuccess(null);
    if (!account) {
      setWalletModalOpen(true);
      return;
    }

    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Sign in with Google first.');
      const browserProvider = getBrowserProvider();
      if (!browserProvider) throw new Error('Connect owner wallet first.');

      let txHash = '';
      const signer = await browserProvider.getSigner();

      if (listingFeeAddr && isAddress(listingFeeAddr)) {
        const lc = new Contract(listingFeeAddr, LISTING_FEE_ABI, signer);
        const tx = pause ? await lc.pause() : await lc.unpause();
        const r = await tx.wait();
        txHash = r.hash;
      }
      if (feeManagerAddr && isAddress(feeManagerAddr)) {
        const fm = new Contract(feeManagerAddr, FEE_MANAGER_ABI, signer);
        const tx = pause ? await fm.pause() : await fm.unpause();
        const r = await tx.wait();
        if (!txHash) txHash = r.hash;
      }

      const signedMessage = `TataSwap Emergency ${pause ? 'PAUSE' : 'UNPAUSE'} | Chain ${editChainId} | ${Date.now()}`;
      const signature = await signMessage(signedMessage);

      await fetch('/api/admin/network', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          chainId: editChainId,
          walletAddress: account,
          signature,
          signedMessage,
          isPaused: pause,
          txHash,
        }),
      });

      await refreshNetworks();
      await loadAdminData();
      setSuccess(pause ? 'Platform contracts paused.' : 'Platform contracts unpaused.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Emergency pause action failed.');
    }
  };

  const handleUpdateTokenLabel = async (
    chainId: number,
    tokenAddress: string,
    verificationStatus: 'verified' | 'unverified' | 'flagged'
  ) => {
    setError(null);
    setSuccess(null);
    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    try {
      const idToken = await getIdToken();
      if (!idToken) throw new Error('Sign in with Google first.');
      const signedMessage = `TataSwap Token Label | ${tokenAddress} -> ${verificationStatus} | ${Date.now()}`;
      const signature = await signMessage(signedMessage);

      const res = await fetch('/api/admin/token-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          chainId,
          tokenAddress,
          verificationStatus,
          walletAddress: account,
          signature,
          signedMessage,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to update token label.');
      }
      await loadAdminData();
      setSuccess(`Token verification label updated to ${verificationStatus}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update verification label.');
    }
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-white/[0.08] bg-[#111622] p-8 text-center space-y-4">
        <ShieldAlert className="mx-auto h-9 w-9 text-emerald-400" />
        <h1 className="text-xl font-bold text-slate-100">TataSwap Owner Admin Console</h1>
        <p className="text-sm text-slate-400">
          Admin actions require Firebase Authentication plus an EIP-191 signature from the authorized DEX owner wallet. Owner controls only govern fee parameters, contract pause state, and verification labels—never user wallets or LP assets.
        </p>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          <LogIn className="h-4 w-4" />
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Admin Dashboard</h1>
          <p className="text-xs text-slate-400">
            Operator: {user.email} · Official Fee Wallet:{' '}
            <span className="font-mono text-emerald-400">
              0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5 self-start sm:self-auto"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>

      {/* Non-custodial Governance Disclosure */}
      <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-[#111622] p-4 text-xs text-slate-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <span className="font-semibold text-slate-100">Non-Custodial Boundary: </span>
          Smart contracts enforce <span className="font-mono">Ownable2Step</span> strictly for fee parameters, emergency pause, and verification labels. The DEX owner cannot move user wallet funds or withdraw liquidity pool reserves.
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Overview KPIs */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Total Listed Tokens</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : overview?.metrics.totalListedTokens ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Total Liquidity Pools</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : overview?.metrics.totalPools ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Total Swap Transactions</div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {loading ? '—' : overview?.metrics.totalSwaps ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5">
          <div className="text-xs text-slate-400">Listing Fees Collected</div>
          <div className="mt-2 font-mono text-2xl font-bold text-emerald-400 tabular-nums">
            {loading ? '—' : `${overview?.metrics.totalListingFeesCollected ?? '0.0000'} USDT`}
          </div>
        </div>
      </section>

      {/* Network Contract & Fee Configuration */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-5">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Network Contracts, Listing Fee &amp; Emergency Controls
            </h2>
            <p className="text-xs text-slate-400">
              Configure deployed Hardhat addresses and on-chain fee parameters per network
            </p>
          </div>
          <select
            value={editChainId}
            onChange={(e) => handleSelectEditChain(Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 text-xs text-slate-100"
          >
            {(overview?.networks || []).map((n) => (
              <option key={n.chainId} value={n.chainId}>
                {n.name} ({n.chainId})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">TataSwapFactory Address</label>
            <input
              type="text"
              value={factoryAddr}
              onChange={(e) => setFactoryAddr(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">TataSwapRouter Address</label>
            <input
              type="text"
              value={routerAddr}
              onChange={(e) => setRouterAddr(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">TataSwapListingFee Address</label>
            <input
              type="text"
              value={listingFeeAddr}
              onChange={(e) => setListingFeeAddr(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">TataSwapFeeManager Address</label>
            <input
              type="text"
              value={feeManagerAddr}
              onChange={(e) => setFeeManagerAddr(e.target.value)}
              placeholder="0x..."
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs text-slate-400">Fee Receiving Wallet Address</label>
            <input
              type="text"
              value={feeReceiver}
              onChange={(e) => setFeeReceiver(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Listing Fee (USDT)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={listingFeeUsdt}
              onChange={(e) => setListingFeeUsdt(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Network Status</label>
            <select
              value={isEnabled ? 'enabled' : 'disabled'}
              onChange={(e) => setIsEnabled(e.target.value === 'enabled')}
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 text-xs text-slate-100"
            >
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Total Swap Fee (bps, max 100 = 1.00%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={swapFeeBps}
              onChange={(e) => setSwapFeeBps(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Protocol Fee Share (bps)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={protocolFeeBps}
              onChange={(e) => setProtocolFeeBps(Number(e.target.value))}
              className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleSaveConfig(false)}
            className="rounded-lg bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Save &amp; Sign Config
          </button>
          <button
            type="button"
            onClick={() => handleSaveConfig(true)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20"
          >
            Push Fee Config On-Chain + Sync
          </button>
          <button
            type="button"
            onClick={() => handleEmergencyPause(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-medium text-red-300 hover:bg-red-500/20"
          >
            <PauseCircle className="h-4 w-4" />
            Emergency Pause
          </button>
          <button
            type="button"
            onClick={() => handleEmergencyPause(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/5"
          >
            <PlayCircle className="h-4 w-4" />
            Unpause Contracts
          </button>
        </div>
      </section>

      {/* Token Verification Labels */}
      <section className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
        <h2 className="text-base font-semibold text-slate-100 border-b border-white/[0.07] pb-3">
          Manage Token Verification Labels
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-500">
                <th className="py-2.5 font-medium">Token</th>
                <th className="py-2.5 font-medium">Contract</th>
                <th className="py-2.5 font-medium">Current Label</th>
                <th className="py-2.5 text-right font-medium">Set Label</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {tokens.map((tok) => (
                <tr key={tok.id}>
                  <td className="py-3 font-medium text-slate-100">
                    {tok.symbol} · {tok.name}
                  </td>
                  <td className="py-3 font-mono text-slate-400 tabular-nums">
                    {tok.address.slice(0, 10)}...{tok.address.slice(-6)}
                  </td>
                  <td className="py-3 capitalize text-slate-300">{tok.verificationStatus}</td>
                  <td className="py-3 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateTokenLabel(tok.chainId, tok.address, 'verified')}
                      className="text-emerald-400 hover:underline"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTokenLabel(tok.chainId, tok.address, 'unverified')}
                      className="text-amber-400 hover:underline"
                    >
                      Unverify
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateTokenLabel(tok.chainId, tok.address, 'flagged')}
                      className="text-red-400 hover:underline"
                    >
                      Flag Risk
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
