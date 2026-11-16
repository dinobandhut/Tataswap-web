import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  ExternalLink,
  SearchCheck,
  ShieldCheck,
} from 'lucide-react';
import { Contract, isAddress, parseUnits } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import { ERC20_ABI, FACTORY_ABI, LISTING_FEE_ABI } from '../lib/abis';
import type { PageRoute } from '../types/dex';

interface InspectedMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  bytecodeSizeBytes: number;
}

export function CreateTokenListingPage({
  onNavigate,
  onSelectToken,
}: {
  onNavigate: (page: PageRoute) => void;
  onSelectToken: (chainId: number, address: string) => void;
}) {
  const {
    account,
    selectedChainId,
    activeNetwork,
    networks,
    switchNetwork,
    getBrowserProvider,
    getReadProvider,
    getTokenBalance,
    setWalletModalOpen,
  } = useWallet();

  const [tokenAddress, setTokenAddress] = useState('');
  const [pairChoice, setPairChoice] = useState<'wrapped' | 'usdt' | 'none'>('wrapped');
  const [inspected, setInspected] = useState<InspectedMetadata | null>(null);
  const [alreadyListed, setAlreadyListed] = useState(false);
  const [inspecting, setInspecting] = useState(false);

  const [usdtBalance, setUsdtBalance] = useState('0');
  const [onChainFee, setOnChainFee] = useState<string | null>(null);
  const [onChainReceiver, setOnChainReceiver] = useState<string | null>(null);
  const [onChainPayToken, setOnChainPayToken] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [stepStatus, setStepStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [listedDone, setListedDone] = useState(false);

  const feeReceiver =
    onChainReceiver ||
    activeNetwork?.feeReceiverWallet ||
    '0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4';
  const feeAmountDisplay = onChainFee || activeNetwork?.listingFeeUsdt || '5';
  const paymentTokenAddr =
    onChainPayToken || activeNetwork?.acceptedPaymentToken || activeNetwork?.usdtAddress || '';

  // Read live fee config & user payment token balance from blockchain
  useEffect(() => {
    let cancelled = false;
    async function syncFeeAndBalance() {
      if (!activeNetwork) return;
      const provider = getReadProvider(selectedChainId);
      if (provider && activeNetwork.listingFeeContract) {
        try {
          const listingContract = new Contract(
            activeNetwork.listingFeeContract,
            LISTING_FEE_ABI,
            provider
          );
          const [receiver, payTok, feeWei] = await Promise.all([
            listingContract.feeReceiverWallet(),
            listingContract.paymentToken(),
            listingContract.listingFee(),
          ]);
          const payErc20 = new Contract(payTok, ERC20_ABI, provider);
          const payDec = Number(await payErc20.decimals());
          if (!cancelled) {
            setOnChainReceiver(String(receiver));
            setOnChainPayToken(String(payTok));
            setOnChainFee((Number(feeWei) / 10 ** payDec).toString());
          }
        } catch {
          // Use DB defaults if contract call unavailable
        }
      }

      if (account && paymentTokenAddr) {
        const bal = await getTokenBalance(paymentTokenAddr, account, selectedChainId);
        if (!cancelled) setUsdtBalance(bal);
      } else {
        setUsdtBalance('0');
      }
    }
    syncFeeAndBalance();
    return () => {
      cancelled = true;
    };
  }, [account, activeNetwork, selectedChainId, paymentTokenAddr, getReadProvider, getTokenBalance]);

  const handleInspectToken = async () => {
    setError(null);
    setInspected(null);
    setAlreadyListed(false);
    setListedDone(false);
    setTxHash(null);

    if (!isAddress(tokenAddress)) {
      setError('Enter a valid ERC-20 / BEP-20 contract address (0x...).');
      return;
    }

    setInspecting(true);
    try {
      const res = await fetch('/api/tokens/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: selectedChainId, address: tokenAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Contract inspection failed.');
      setInspected(data.metadata);
      setAlreadyListed(Boolean(data.alreadyListed));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to inspect contract on-chain.');
    } finally {
      setInspecting(false);
    }
  };

  const handleSubmitListing = async () => {
    setError(null);
    setStepStatus(null);
    setTxHash(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!inspected) {
      setError('Inspect and verify your token contract first.');
      return;
    }
    if (!activeNetwork?.listingFeeContract) {
      setError(
        `TataSwapListingFee smart contract is not yet deployed on ${
          activeNetwork?.name || 'this network'
        }. Deploy contracts with Hardhat (scripts/deploy.ts) and configure the contract address in Admin Dashboard before submitting on-chain.`
      );
      return;
    }

    const browserProvider = getBrowserProvider();
    if (!browserProvider) {
      setError('Connect MetaMask or Trust Wallet to submit the listing transaction.');
      return;
    }

    setSubmitting(true);
    try {
      const signer = await browserProvider.getSigner();
      const listingContract = new Contract(
        activeNetwork.listingFeeContract,
        LISTING_FEE_ABI,
        signer
      );

      // Read exact on-chain fee & payment token directly from the smart contract
      const [contractFeeWei, contractPayToken] = await Promise.all([
        listingContract.listingFee(),
        listingContract.paymentToken(),
      ]);

      const payToken = new Contract(contractPayToken, ERC20_ABI, signer);
      const [userBal, allowance]: [bigint, bigint] = await Promise.all([
        payToken.balanceOf(account),
        payToken.allowance(account, activeNetwork.listingFeeContract),
      ]);

      if (userBal < contractFeeWei) {
        const payDec = Number(await payToken.decimals());
        throw new Error(
          `Insufficient USDT balance for listing fee. Required: ${feeAmountDisplay} USDT, wallet balance: ${(
            Number(userBal) /
            10 ** payDec
          ).toFixed(4)} USDT.`
        );
      }

      if (allowance < contractFeeWei) {
        setStepStatus(
          `Step 1/3: Approving ${feeAmountDisplay} USDT spending for TataSwapListingFee contract...`
        );
        const approveTx = await payToken.approve(
          activeNetwork.listingFeeContract,
          contractFeeWei
        );
        await approveTx.wait();
      }

      const pairWithAddress =
        pairChoice === 'wrapped'
          ? activeNetwork.wrappedNativeAddress
          : pairChoice === 'usdt'
          ? activeNetwork.usdtAddress
          : '0x0000000000000000000000000000000000000000';

      setStepStatus(
        `Step 2/3: Confirming permissionless listing & direct ${feeAmountDisplay} USDT fee transfer to ${feeReceiver}...`
      );
      const listTx = await listingContract.listToken(inspected.address, pairWithAddress);
      const receipt = await listTx.wait();
      setTxHash(receipt.hash);

      // Look up created pair address if pairWithAddress was set
      let createdPairAddr = '';
      if (
        pairWithAddress !== '0x0000000000000000000000000000000000000000' &&
        activeNetwork.factoryAddress
      ) {
        try {
          const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, signer);
          createdPairAddr = await factory.getPair(inspected.address, pairWithAddress);
        } catch {
          // Non-fatal
        }
      }

      setStepStatus('Step 3/3: Verifying on-chain receipt & indexing token in TataSwap Explorer...');
      const verifyRes = await fetch('/api/tokens/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          tokenAddress: inspected.address,
          txHash: receipt.hash,
          listerWallet: account,
          pairAddress: createdPairAddr,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'On-chain verification failed.');
      }

      setListedDone(true);
      setStepStatus(
        `Token ${inspected.symbol} listed successfully! ${feeAmountDisplay} USDT transferred on-chain to ${feeReceiver}.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Listing transaction reverted or rejected.');
      setStepStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ContractStatusNotice network={activeNetwork} onNavigate={onNavigate} />

      <div>
        <h1 className="text-2xl font-bold text-slate-100">Create Token Listing</h1>
        <p className="text-sm text-slate-400">
          List any ERC-20 or BEP-20 compatible token permissionlessly without admin approval. Listing fees transfer atomically on-chain to the official DEX fee receiver.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Permissionless Listing Form */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-6 lg:col-span-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                1. Connected Wallet
              </label>
              <button
                type="button"
                onClick={() => setWalletModalOpen(true)}
                className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 text-left font-mono text-xs text-slate-200 hover:border-emerald-500/40 truncate tabular-nums"
              >
                {account ? account : 'Click to Connect MetaMask / Trust Wallet'}
              </button>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="list-network" className="text-xs font-medium text-slate-300">
                2. Blockchain Network
              </label>
              <select
                id="list-network"
                value={selectedChainId}
                onChange={(e) => switchNetwork(Number(e.target.value))}
                className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
              >
                {networks.map((n) => (
                  <option key={n.chainId} value={n.chainId}>
                    {n.name} (Chain {n.chainId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2 border-t border-white/[0.07] pt-5">
            <label htmlFor="token-contract-input" className="text-xs font-medium text-slate-300">
              3. Enter Token Contract Address (ERC-20 / BEP-20)
            </label>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <input
                id="token-contract-input"
                type="text"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value.trim())}
                placeholder="0x..."
                className="flex-1 rounded-lg border border-white/10 bg-[#090C12] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={inspecting}
                onClick={handleInspectToken}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 whitespace-nowrap"
              >
                <SearchCheck className="h-4 w-4" />
                {inspecting ? 'Verifying RPC...' : 'Detect & Verify Contract'}
              </button>
            </div>
          </div>

          {inspected && (
            <div className="space-y-4 border-t border-white/[0.07] pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-400">
                  On-Chain ERC-20 / BEP-20 Bytecode Verified
                </span>
                <span className="font-mono text-xs text-slate-400 tabular-nums">
                  {inspected.bytecodeSizeBytes} bytes
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
                <div>
                  <div className="text-slate-500">Name</div>
                  <div className="mt-1 font-semibold text-slate-100">{inspected.name}</div>
                </div>
                <div>
                  <div className="text-slate-500">Symbol</div>
                  <div className="mt-1 font-semibold text-slate-100">{inspected.symbol}</div>
                </div>
                <div>
                  <div className="text-slate-500">Decimals</div>
                  <div className="mt-1 font-mono text-slate-100 tabular-nums">
                    {inspected.decimals}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Total Supply</div>
                  <div className="mt-1 font-mono text-slate-100 truncate tabular-nums">
                    {Number.parseFloat(inspected.totalSupply).toLocaleString()}
                  </div>
                </div>
              </div>

              {alreadyListed && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  This token is already indexed in TataSwap Explorer.
                </div>
              )}

              <div className="space-y-1.5 pt-2">
                <label htmlFor="pair-select" className="text-xs font-medium text-slate-300">
                  4. Register Initial Trading Pair (Optional)
                </label>
                <select
                  id="pair-select"
                  value={pairChoice}
                  onChange={(e) => setPairChoice(e.target.value as 'wrapped' | 'usdt' | 'none')}
                  className="w-full rounded-lg border border-white/10 bg-[#090C12] px-3 py-2.5 text-xs text-slate-100"
                >
                  <option value="wrapped">
                    Pair with {activeNetwork?.nativeSymbol || 'WBNB'} ({activeNetwork?.wrappedNativeAddress.slice(0, 8)}...)
                  </option>
                  <option value="usdt">
                    Pair with USDT ({activeNetwork?.usdtAddress.slice(0, 8)}...)
                  </option>
                  <option value="none">Register token only (create pair later)</option>
                </select>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {stepStatus && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1.5">
                <div>{stepStatus}</div>
                {txHash && activeNetwork && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <a
                      href={`${activeNetwork.explorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono underline"
                    >
                      Explorer Tx: {txHash.slice(0, 14)}...
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {listedDone && inspected && (
                      <button
                        type="button"
                        onClick={() => onSelectToken(selectedChainId, inspected.address)}
                        className="font-semibold text-slate-100 underline hover:text-emerald-300"
                      >
                        Open in Token Explorer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !inspected || alreadyListed}
            onClick={handleSubmitListing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            <Coins className="h-4 w-4" />
            {submitting
              ? 'Processing On-Chain Listing...'
              : `Pay ${feeAmountDisplay} USDT & List Token On-Chain`}
          </button>
        </div>

        {/* Right: Transparent On-Chain Fee Disclosure */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6 space-y-5 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-white/[0.07] pb-4">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                Listing Fee Disclosure
              </h2>
              <p className="text-xs text-slate-400">
                Verify fee destination before signing in your wallet
              </p>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <span className="text-slate-400">Required Listing Fee</span>
              <span className="font-mono text-sm font-bold text-slate-100 tabular-nums">
                {feeAmountDisplay} USDT
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <span className="text-slate-400">Your USDT Balance</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {account ? `${Number.parseFloat(usdtBalance).toFixed(4)} USDT` : 'Connect Wallet'}
              </span>
            </div>
            <div className="space-y-1 border-b border-white/[0.06] pb-3">
              <span className="text-slate-400">Official Fee Receiver Wallet</span>
              <div className="font-mono text-[11px] text-emerald-400 break-all tabular-nums">
                {feeReceiver}
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-400">Payment Token Contract</span>
              <div className="font-mono text-[11px] text-slate-300 break-all tabular-nums">
                {paymentTokenAddr || 'Configured per chain'}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/[0.07] bg-[#090C12] p-4 space-y-2 text-xs text-slate-400 leading-relaxed">
            <div className="font-semibold text-slate-200">Atomic Revert Protection</div>
            <p>
              The <span className="font-mono text-slate-300">TataSwapListingFee</span> contract verifies ERC-20 bytecode &amp; metadata, transfers the fee directly to the owner wallet (<span className="font-mono">0xD9e5...1CA4</span>), and registers the listing in a single atomic transaction. If registration or pair creation fails, the entire transaction reverts so your USDT is never lost.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
