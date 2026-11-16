import React from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { NetworkConfig, PageRoute } from '../types/dex';

export function ContractStatusNotice({
  network,
  onNavigate,
}: {
  network: NetworkConfig | null;
  onNavigate: (page: PageRoute) => void;
}) {
  if (!network) return null;
  const deployed =
    Boolean(network.factoryAddress) &&
    Boolean(network.routerAddress) &&
    Boolean(network.listingFeeContract);

  if (deployed) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400 shrink-0" />
        <div className="space-y-1 text-xs leading-relaxed text-amber-100/90">
          <div className="font-semibold text-amber-300">
            Smart Contracts Pending Deployment on {network.name}
          </div>
          <p className="text-slate-300">
            Deploy <span className="font-mono">TataSwapFactory</span>,{' '}
            <span className="font-mono">TataSwapRouter</span>, and{' '}
            <span className="font-mono">TataSwapListingFee</span> via Hardhat (
            <span className="font-mono">scripts/deploy.ts</span>) and register their addresses in
            Admin Dashboard before executing on-chain swaps or listings. Real RPC inspection and
            wallet balances are active now.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('admin')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/25 whitespace-nowrap shrink-0"
      >
        Configure Contracts
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
