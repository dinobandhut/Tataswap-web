import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  UserPlus,
  LogIn,
  LogOut,
  ChevronLeft,
} from 'lucide-react';
import { useWallet, type WalletType } from '../context/WalletContext';
import { useAuth } from '../context/AuthContext';

function WalletIcon({ type }: { type: WalletType }) {
  if (type === 'trustwallet') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0500FF]/15 border border-[#3375BB]/30 shrink-0">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M12 2.5L4.5 5.8V11.6C4.5 16.5 7.7 20.9 12 22C16.3 20.9 19.5 16.5 19.5 11.6V5.8L12 2.5Z"
            stroke="#3B82F6"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (type === 'walletconnect') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#3B99FC]/15 border border-[#3B99FC]/30 shrink-0">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path
            d="M6.3 9.2C9.4 6.1 14.6 6.1 17.7 9.2L18.1 9.6C18.3 9.8 18.3 10.1 18.1 10.3L16.8 11.6C16.7 11.7 16.5 11.7 16.4 11.6L15.8 11C13.7 8.9 10.3 8.9 8.2 11L7.6 11.6C7.5 11.7 7.3 11.7 7.2 11.6L5.9 10.3C5.7 10.1 5.7 9.8 5.9 9.6L6.3 9.2ZM20.2 11.8L21.3 12.9C21.5 13.1 21.5 13.4 21.3 13.6L16.4 18.5C16.2 18.7 15.9 18.7 15.7 18.5L12.2 15C12.1 14.9 11.9 14.9 11.8 15L8.3 18.5C8.1 18.7 7.8 18.7 7.6 18.5L2.7 13.6C2.5 13.4 2.5 13.1 2.7 12.9L3.8 11.8C4 11.6 4.3 11.6 4.5 11.8L8 15.3C8.1 15.4 8.3 15.4 8.4 15.3L11.9 11.8C12.1 11.6 12.4 11.6 12.6 11.8L16.1 15.3C16.2 15.4 16.4 15.4 16.5 15.3L20 11.8C20.2 11.6 20.5 11.6 20.2 11.8Z"
            fill="#3B99FC"
          />
        </svg>
      </div>
    );
  }
  if (type === 'metamask') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F6851B]/15 border border-[#F6851B]/30 shrink-0">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="M19.5 4L13.4 8.6L14.5 5.9L19.5 4Z" fill="#E2761B" />
          <path d="M4.5 4L10.5 8.6L9.5 5.9L4.5 4Z" fill="#E4761B" />
          <path d="M17.2 15.6L15.6 18.1L19.1 19.1L20.1 15.7L17.2 15.6Z" fill="#E4761B" />
          <path d="M3.9 15.7L4.9 19.1L8.4 18.1L6.8 15.6L3.9 15.7Z" fill="#E4761B" />
          <path d="M8.2 10.9L7.2 12.4L10.7 12.6L10.6 8.8L8.2 10.9Z" fill="#F6851B" />
          <path d="M15.8 10.9L13.3 8.8L13.3 12.6L16.8 12.4L15.8 10.9Z" fill="#F6851B" />
        </svg>
      </div>
    );
  }
  if (type === 'coinbase') {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0052FF]/15 border border-[#0052FF]/35 shrink-0">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <circle cx="12" cy="12" r="8.5" fill="#0052FF" />
          <rect x="9" y="9" width="6" height="6" rx="1.2" fill="#FFFFFF" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F0B90B]/15 border border-[#F0B90B]/35 shrink-0">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M12 4L14.9 6.9L9.9 11.9L7 9L12 4ZM17.1 9.1L20 12L17.1 14.9L14.2 12L17.1 9.1ZM6.9 9.1L9.8 12L6.9 14.9L4 12L6.9 9.1ZM12 14.1L14.9 17L12 19.9L9.1 17L12 14.1Z"
          fill="#F0B90B"
        />
      </svg>
    </div>
  );
}

const WALLET_LABEL: Record<WalletType, string> = {
  trustwallet: 'Trust Wallet Mobile & Extension',
  walletconnect: 'WalletConnect',
  metamask: 'MetaMask',
  coinbase: 'Coinbase Wallet',
  binance: 'Binance Wallet',
};

export function WalletModal() {
  const {
    walletModalOpen,
    setWalletModalOpen,
    account,
    walletType,
    walletChainId,
    nativeBalance,
    activeNetwork,
    connectWallet,
    disconnectWallet,
    discoveredProviders,
    isConnecting,
    walletError,
  } = useWallet();

  const { user, signInWithGoogle, logout, getIdToken } = useAuth();

  const [copied, setCopied] = useState(false);
  const [showWalletConnectView, setShowWalletConnectView] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  if (!walletModalOpen) return null;

  const copyAddress = () => {
    if (!account) return;
    navigator.clipboard.writeText(account);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleAccountAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      const token = await getIdToken();
      if (token) {
        await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ walletAddress: account || undefined }),
        });
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Account sign-in failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  const walletOptions: {
    type: WalletType;
    name: string;
    subtitle: string;
    onClick: () => void;
  }[] = [
    {
      type: 'trustwallet',
      name: 'TataSwap / Trust Mobile',
      subtitle: discoveredProviders.some((p) => p.type === 'trustwallet')
        ? 'Detected in browser'
        : 'Trust Wallet extension & mobile',
      onClick: () => connectWallet('trustwallet'),
    },
    {
      type: 'walletconnect',
      name: 'WalletConnect',
      subtitle: 'Connect mobile wallets via DApp deep link',
      onClick: () => setShowWalletConnectView(true),
    },
    {
      type: 'metamask',
      name: 'MetaMask',
      subtitle: discoveredProviders.some((p) => p.type === 'metamask')
        ? 'Detected in browser'
        : 'MetaMask browser & mobile wallet',
      onClick: () => connectWallet('metamask'),
    },
    {
      type: 'coinbase',
      name: 'Coinbase Wallet',
      subtitle: discoveredProviders.some((p) => p.type === 'coinbase')
        ? 'Detected in browser'
        : 'Coinbase Wallet extension & mobile',
      onClick: () => connectWallet('coinbase'),
    },
    {
      type: 'binance',
      name: 'Binance Wallet',
      subtitle: discoveredProviders.some((p) => p.type === 'binance')
        ? 'Detected in browser'
        : 'BNB Smart Chain official Web3 wallet',
      onClick: () => connectWallet('binance'),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
    >
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#111622] p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-2">
            {showWalletConnectView && !account && (
              <button
                type="button"
                onClick={() => setShowWalletConnectView(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/5 hover:text-slate-100"
                aria-label="Back to wallet list"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h2 id="wallet-modal-title" className="text-lg font-semibold text-slate-100">
              {account
                ? 'Connected wallet'
                : showWalletConnectView
                ? 'WalletConnect Mobile'
                : 'Connect a wallet'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowWalletConnectView(false);
              setWalletModalOpen(false);
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100 transition-colors"
            aria-label="Close wallet dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {account ? (
          <div className="mt-5 space-y-5">
            <div className="space-y-2 border-b border-white/[0.08] pb-4">
              <div className="text-xs text-slate-400">
                {walletType ? WALLET_LABEL[walletType] : 'Web3 Wallet'} · Chain ID{' '}
                {walletChainId ?? activeNetwork?.chainId}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm text-slate-100 truncate tabular-nums">
                  {account}
                </span>
                <button
                  type="button"
                  onClick={copyAddress}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/5 whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">On-Chain Balance</span>
              <span className="font-mono font-semibold text-slate-100 tabular-nums">
                {Number.parseFloat(nativeBalance).toFixed(5)}{' '}
                {activeNetwork?.nativeSymbol || 'tBNB'}
              </span>
            </div>

            {user && (
              <div className="flex items-center justify-between border-t border-white/[0.07] pt-3 text-xs">
                <span className="text-slate-400">Signed-in Account: {user.email}</span>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1 text-slate-300 hover:text-red-300"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            )}

            {activeNetwork && (
              <a
                href={`${activeNetwork.explorerUrl}/address/${account}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-white/5 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                View on {activeNetwork.shortName} Explorer
              </a>
            )}

            <button
              type="button"
              onClick={() => {
                disconnectWallet();
                setWalletModalOpen(false);
              }}
              className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-300 hover:bg-red-500/20 transition-colors"
            >
              Disconnect Wallet
            </button>
          </div>
        ) : showWalletConnectView ? (
          <div className="mt-5 space-y-3">
            <p className="text-xs leading-relaxed text-slate-400">
              Launch TataSwap directly inside your mobile wallet&apos;s built-in DApp browser on BNB Smart Chain for one-tap signing without browser extensions.
            </p>
            <a
              href={`https://link.trustwallet.com/open_url?coin_id=20000714&url=${encodeURIComponent(
                currentUrl
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161C2C] px-4 py-3 hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-3">
                <WalletIcon type="trustwallet" />
                <div>
                  <div className="text-sm font-medium text-slate-100">Open in Trust Wallet App</div>
                  <div className="text-xs text-slate-400">BNB Chain DApp Browser</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400" />
            </a>
            <a
              href={`https://metamask.app.link/dapp/${currentUrl.replace(/^https?:\/\//, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161C2C] px-4 py-3 hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-3">
                <WalletIcon type="metamask" />
                <div>
                  <div className="text-sm font-medium text-slate-100">Open in MetaMask Mobile</div>
                  <div className="text-xs text-slate-400">MetaMask DApp Browser</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400" />
            </a>
            <a
              href={`https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(currentUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#161C2C] px-4 py-3 hover:border-emerald-500/40"
            >
              <div className="flex items-center gap-3">
                <WalletIcon type="coinbase" />
                <div>
                  <div className="text-sm font-medium text-slate-100">Open in Coinbase Wallet</div>
                  <div className="text-xs text-slate-400">Coinbase Mobile DApp Browser</div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-slate-400" />
            </a>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              {walletOptions.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  disabled={isConnecting}
                  onClick={item.onClick}
                  className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-[#161C2C] px-3.5 py-3 text-left hover:border-emerald-500/45 hover:bg-[#1B2235] transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <WalletIcon type={item.type} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-100 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-emerald-400 whitespace-nowrap pl-2">
                    Connect
                  </span>
                </button>
              ))}
            </div>

            {walletError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {walletError}
              </div>
            )}

            {/* "or" Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-slate-500">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Create account & Log in */}
            {user ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs">
                <div className="text-emerald-300 truncate">
                  Signed in as <span className="font-semibold">{user.email}</span>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1 font-medium text-slate-200 hover:text-red-300 whitespace-nowrap ml-2"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Log out
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleAccountAuth}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  {authLoading ? 'Opening Sign-In...' : 'Create account'}
                </button>
                <button
                  type="button"
                  disabled={authLoading}
                  onClick={handleAccountAuth}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#161C2C] py-2.5 text-sm font-medium text-emerald-400 hover:bg-[#1B2235] disabled:opacity-50 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  Log in
                </button>
              </div>
            )}

            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {authError}
              </div>
            )}

            <p className="text-center text-[11px] leading-relaxed text-slate-500">
              By connecting a wallet, you agree to TataSwap&apos;s non-custodial protocol terms. Private keys and seed phrases are never requested or stored.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
