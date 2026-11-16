import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Coins,
  Compass,
  Droplets,
  History,
  Home,
  Layers,
  Menu,
  MinusCircle,
  PlusCircle,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react';
import { useWallet } from '../context/WalletContext';
import type { PageRoute } from '../types/dex';
import { WalletModal } from './WalletModal';

interface NavGroup {
  label: string;
  items: { id: PageRoute; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Exchange',
    items: [
      { id: 'home', label: 'Home Dashboard', icon: Home },
      { id: 'swap', label: 'Swap', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Markets',
    items: [
      { id: 'explore', label: 'Explore Tokens', icon: Compass },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Liquidity & Listing',
    items: [
      { id: 'list-token', label: 'List Token', icon: Coins },
      { id: 'create-pool', label: 'Create Pool', icon: Layers },
      { id: 'add-liquidity', label: 'Add Liquidity', icon: PlusCircle },
      { id: 'remove-liquidity', label: 'Remove Liquidity', icon: MinusCircle },
    ],
  },
  {
    label: 'Account & Governance',
    items: [
      { id: 'portfolio', label: 'Portfolio', icon: Droplets },
      { id: 'history', label: 'Transaction History', icon: History },
      { id: 'admin', label: 'Admin Dashboard', icon: ShieldAlert },
    ],
  },
];

const PAGE_TITLES: Record<PageRoute, string> = {
  home: 'Home Dashboard',
  swap: 'Swap',
  explore: 'Explore Tokens',
  'token-details': 'Token Details',
  'list-token': 'Create Token Listing',
  'create-pool': 'Create Liquidity Pool',
  'add-liquidity': 'Add Liquidity',
  'remove-liquidity': 'Remove Liquidity',
  portfolio: 'Portfolio',
  history: 'Transaction History',
  analytics: 'Analytics',
  admin: 'Admin Dashboard',
};

export function Layout({
  currentPage,
  onNavigate,
  children,
}: {
  currentPage: PageRoute;
  onNavigate: (page: PageRoute) => void;
  children: React.ReactNode;
}) {
  const {
    account,
    nativeBalance,
    selectedChainId,
    networks,
    activeNetwork,
    switchNetwork,
    setWalletModalOpen,
  } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const shortAddress = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : null;

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between px-4 py-5">
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => {
            onNavigate('home');
            setMobileMenuOpen(false);
          }}
          className="flex w-full items-center gap-2.5 px-2 text-left"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-slate-950">
            T
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap">
            TataSwap
          </span>
        </button>

        <nav className="space-y-5" aria-label="Main navigation">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 pb-1 text-xs font-medium text-slate-500">
                {group.label}
              </div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active =
                  currentPage === item.id ||
                  (item.id === 'explore' && currentPage === 'token-details');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigate(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-slate-300 hover:bg-white/[0.04] hover:text-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-white/[0.07] pt-4 px-2 space-y-1.5 text-xs text-slate-400">
        <div>Official Fee Receiver</div>
        <div className="font-mono text-[11px] text-slate-300 truncate tabular-nums">
          0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090C12] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-white/[0.07] bg-[#0C1018]">
        <div className="sticky top-0 h-screen overflow-y-auto">{renderSidebarContent()}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-68 bg-[#0C1018] border-r border-white/[0.08] overflow-y-auto">
            <div className="flex justify-end p-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-white/[0.07] bg-[#090C12]/95 px-4 py-3 backdrop-blur sm:px-8">
          {/* Zone 1: Breadcrumb / Mobile trigger */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/5 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-sm whitespace-nowrap shrink-0">
              <span className="text-slate-500 hidden sm:inline">TataSwap</span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <span className="font-display font-semibold text-slate-100">
                {PAGE_TITLES[currentPage]}
              </span>
            </div>
          </div>

          {/* Zone 2: Network Selector */}
          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="network-select" className="sr-only">
              Blockchain Network
            </label>
            <select
              id="network-select"
              value={selectedChainId}
              onChange={(e) => switchNetwork(Number(e.target.value))}
              className="rounded-lg border border-white/10 bg-[#111622] px-3 py-2 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none whitespace-nowrap"
            >
              {networks.length > 0 ? (
                networks.map((net) => (
                  <option key={net.chainId} value={net.chainId}>
                    {net.shortName} ({net.chainId})
                  </option>
                ))
              ) : (
                <option value={97}>BSC Testnet (97)</option>
              )}
            </select>

            {/* Zone 3: 1 Primary CTA */}
            <button
              type="button"
              onClick={() => setWalletModalOpen(true)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                account
                  ? 'border border-white/10 bg-[#151B28] text-slate-100 hover:border-emerald-500/40'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              {account ? (
                <span className="font-mono tabular-nums">
                  {shortAddress} · {Number.parseFloat(nativeBalance).toFixed(3)}{' '}
                  {activeNetwork?.nativeSymbol || 'tBNB'}
                </span>
              ) : (
                <span>Connect Wallet</span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto max-w-[1200px]">{children}</div>
        </main>

        <footer className="border-t border-white/[0.07] px-4 py-5 sm:px-8">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              TataSwap DEX · Non-Custodial AMM Protocol · BNB Smart Chain Testnet First
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => onNavigate('explore')}
                className="hover:text-slate-300 transition-colors"
              >
                Explorer
              </button>
              <button
                type="button"
                onClick={() => onNavigate('list-token')}
                className="hover:text-slate-300 transition-colors"
              >
                Permissionless Listing
              </button>
              <button
                type="button"
                onClick={() => onNavigate('analytics')}
                className="hover:text-slate-300 transition-colors"
              >
                Protocol Fees
              </button>
            </div>
          </div>
        </footer>
      </div>

      <WalletModal />
    </div>
  );
}
