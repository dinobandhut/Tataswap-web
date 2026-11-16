import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Settings2,
} from 'lucide-react';
import { Contract, formatUnits, isAddress, parseEther, parseUnits } from 'ethers';
import { useWallet } from '../context/WalletContext';
import { ContractStatusNotice } from '../components/ContractStatusNotice';
import { ERC20_ABI, FACTORY_ABI, POOL_ABI, ROUTER_ABI } from '../lib/abis';
import type { IndexedToken, PageRoute } from '../types/dex';

interface TokenOption {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
}

export function SwapPage({ onNavigate }: { onNavigate: (page: PageRoute) => void }) {
  const {
    account,
    activeNetwork,
    selectedChainId,
    nativeBalance,
    getBrowserProvider,
    getReadProvider,
    getTokenBalance,
    setWalletModalOpen,
  } = useWallet();

  const [tokens, setTokens] = useState<TokenOption[]>([]);
  const [tokenIn, setTokenIn] = useState<TokenOption | null>(null);
  const [tokenOut, setTokenOut] = useState<TokenOption | null>(null);
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [balanceIn, setBalanceIn] = useState('0');
  const [balanceOut, setBalanceOut] = useState('0');
  const [slippagePct, setSlippagePct] = useState('0.5');
  const [deadlineMins, setDeadlineMins] = useState('20');
  const [showSettings, setShowSettings] = useState(false);

  const [pairAddress, setPairAddress] = useState<string>('');
  const [reserves, setReserves] = useState<{ rIn: string; rOut: string } | null>(null);
  const [priceImpactPct, setPriceImpactPct] = useState<string>('0.00');
  const [gasEstimate, setGasEstimate] = useState<string>('');
  const [customAddress, setCustomAddress] = useState('');
  const [customTarget, setCustomTarget] = useState<'in' | 'out'>('out');

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load tokens for active chain
  useEffect(() => {
    let cancelled = false;
    async function loadTokens() {
      const nativeOpt: TokenOption = {
        address: 'NATIVE',
        symbol: activeNetwork?.nativeSymbol || 'tBNB',
        name: `${activeNetwork?.shortName || 'BSC Testnet'} Native`,
        decimals: 18,
        isNative: true,
      };
      try {
        const res = await fetch(`/api/tokens?chainId=${selectedChainId}`);
        const data = res.ok ? await res.json() : { tokens: [] };
        const indexed: TokenOption[] = (data.tokens || []).map((t: IndexedToken) => ({
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
        }));
        if (cancelled) return;
        const merged = [nativeOpt, ...indexed];
        setTokens(merged);
        setTokenIn(merged[0] || null);
        setTokenOut(merged[1] || null);
      } catch {
        if (!cancelled) {
          setTokens([nativeOpt]);
          setTokenIn(nativeOpt);
        }
      }
    }
    loadTokens();
    return () => {
      cancelled = true;
    };
  }, [selectedChainId, activeNetwork]);

  // Refresh balances
  useEffect(() => {
    let cancelled = false;
    async function loadBalances() {
      if (!account) {
        setBalanceIn('0');
        setBalanceOut('0');
        return;
      }
      if (tokenIn) {
        if (tokenIn.isNative) {
          setBalanceIn(nativeBalance);
        } else {
          const bal = await getTokenBalance(tokenIn.address, account, selectedChainId);
          if (!cancelled) setBalanceIn(bal);
        }
      }
      if (tokenOut) {
        if (tokenOut.isNative) {
          setBalanceOut(nativeBalance);
        } else {
          const bal = await getTokenBalance(tokenOut.address, account, selectedChainId);
          if (!cancelled) setBalanceOut(bal);
        }
      }
    }
    loadBalances();
    return () => {
      cancelled = true;
    };
  }, [account, tokenIn, tokenOut, nativeBalance, selectedChainId, getTokenBalance]);

  // Fetch live on-chain pair & quote
  useEffect(() => {
    let cancelled = false;
    async function fetchQuote() {
      setPairAddress('');
      setReserves(null);
      setAmountOut('');
      setPriceImpactPct('0.00');
      setGasEstimate('');

      if (!activeNetwork?.factoryAddress || !activeNetwork?.routerAddress) return;
      if (!tokenIn || !tokenOut) return;

      const addrA = tokenIn.isNative ? activeNetwork.wrappedNativeAddress : tokenIn.address;
      const addrB = tokenOut.isNative ? activeNetwork.wrappedNativeAddress : tokenOut.address;
      if (!addrA || !addrB || addrA.toLowerCase() === addrB.toLowerCase()) return;

      const provider = getReadProvider(selectedChainId);
      if (!provider) return;

      try {
        const factory = new Contract(activeNetwork.factoryAddress, FACTORY_ABI, provider);
        const pair = await factory.getPair(addrA, addrB);
        if (cancelled) return;
        if (!pair || pair === '0x0000000000000000000000000000000000000000') {
          setPairAddress('');
          return;
        }
        setPairAddress(pair);

        const pool = new Contract(pair, POOL_ABI, provider);
        const [token0, [r0, r1]] = await Promise.all([pool.token0(), pool.getReserves()]);
        if (cancelled) return;

        const isA0 = addrA.toLowerCase() === String(token0).toLowerCase();
        const rInRaw = isA0 ? r0 : r1;
        const rOutRaw = isA0 ? r1 : r0;

        setReserves({
          rIn: formatUnits(rInRaw, tokenIn.decimals),
          rOut: formatUnits(rOutRaw, tokenOut.decimals),
        });

        if (!amountIn || Number.parseFloat(amountIn) <= 0 || rInRaw === 0n || rOutRaw === 0n) {
          return;
        }

        const router = new Contract(activeNetwork.routerAddress, ROUTER_ABI, provider);
        const amountInWei = parseUnits(amountIn, tokenIn.decimals);
        const amounts: bigint[] = await router.getAmountsOut(amountInWei, [addrA, addrB]);
        if (cancelled) return;

        const outWei = amounts[1];
        const outFormatted = formatUnits(outWei, tokenOut.decimals);
        setAmountOut(outFormatted);

        // Compute constant-product price impact
        const rInNum = Number.parseFloat(formatUnits(rInRaw, tokenIn.decimals));
        const inNum = Number.parseFloat(amountIn);
        if (rInNum > 0) {
          const impact = (inNum / (rInNum + inNum)) * 100;
          setPriceImpactPct(impact.toFixed(2));
        }

        // Gas estimation if connected
        if (account) {
          const browserProvider = getBrowserProvider();
          if (browserProvider) {
            try {
              const signer = await browserProvider.getSigner();
              const routerSigner = new Contract(activeNetwork.routerAddress, ROUTER_ABI, signer);
              const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineMins || 20) * 60);
              const minOut = (outWei * BigInt(Math.floor((100 - Number(slippagePct)) * 100))) / 10000n;
              let est: bigint;
              if (tokenIn.isNative) {
                est = await routerSigner.swapExactETHForTokens.estimateGas(
                  minOut,
                  [addrA, addrB],
                  account,
                  deadline,
                  { value: amountInWei }
                );
              } else if (tokenOut.isNative) {
                est = await routerSigner.swapExactTokensForETH.estimateGas(
                  amountInWei,
                  minOut,
                  [addrA, addrB],
                  account,
                  deadline
                );
              } else {
                est = await routerSigner.swapExactTokensForTokens.estimateGas(
                  amountInWei,
                  minOut,
                  [addrA, addrB],
                  account,
                  deadline
                );
              }
              if (!cancelled) setGasEstimate(`${est.toString()} gas`);
            } catch {
              if (!cancelled) setGasEstimate('Approval required for gas estimate');
            }
          }
        }
      } catch (err) {
        console.error('Quote fetch error:', err);
      }
    }

    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [
    amountIn,
    tokenIn,
    tokenOut,
    activeNetwork,
    selectedChainId,
    account,
    slippagePct,
    deadlineMins,
    getReadProvider,
    getBrowserProvider,
  ]);

  const handleLoadCustomToken = async () => {
    setErrorMessage(null);
    if (!isAddress(customAddress)) {
      setErrorMessage('Enter a valid ERC-20 / BEP-20 contract address.');
      return;
    }
    try {
      const res = await fetch('/api/tokens/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chainId: selectedChainId, address: customAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to inspect token');
      const opt: TokenOption = {
        address: data.metadata.address,
        symbol: data.metadata.symbol,
        name: data.metadata.name,
        decimals: data.metadata.decimals,
      };
      setTokens((prev) =>
        prev.some((t) => t.address.toLowerCase() === opt.address.toLowerCase())
          ? prev
          : [...prev, opt]
      );
      if (customTarget === 'in') setTokenIn(opt);
      else setTokenOut(opt);
      setCustomAddress('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Custom token lookup failed');
    }
  };

  const handleFlip = () => {
    const prevIn = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(prevIn);
    setAmountIn('');
    setAmountOut('');
  };

  const handleExecuteSwap = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setTxHash(null);

    if (!account) {
      setWalletModalOpen(true);
      return;
    }
    if (!activeNetwork?.routerAddress) {
      setErrorMessage(
        'TataSwapRouter is not yet deployed on this network. Deploy contracts via Hardhat and configure addresses in Admin Dashboard.'
      );
      return;
    }
    if (!tokenIn || !tokenOut || !amountIn || Number.parseFloat(amountIn) <= 0) {
      setErrorMessage('Enter a valid input amount to swap.');
      return;
    }
    if (!pairAddress || !amountOut) {
      setErrorMessage('No active liquidity pool exists on-chain for this token pair.');
      return;
    }

    const browserProvider = getBrowserProvider();
    if (!browserProvider) {
      setErrorMessage('Connect MetaMask or Trust Wallet to sign transactions.');
      return;
    }

    setSubmitting(true);
    try {
      const signer = await browserProvider.getSigner();
      const addrA = tokenIn.isNative ? activeNetwork.wrappedNativeAddress : tokenIn.address;
      const addrB = tokenOut.isNative ? activeNetwork.wrappedNativeAddress : tokenOut.address;
      const amountInWei = parseUnits(amountIn, tokenIn.decimals);
      const outWei = parseUnits(amountOut, tokenOut.decimals);
      const slippageBps = Math.floor(Number.parseFloat(slippagePct || '0.5') * 100);
      const minOutWei = (outWei * BigInt(10000 - slippageBps)) / 10000n;
      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + Number.parseInt(deadlineMins || '20', 10) * 60
      );

      // Handle ERC-20 approval if input is not native coin
      if (!tokenIn.isNative) {
        const erc20 = new Contract(tokenIn.address, ERC20_ABI, signer);
        const allowance: bigint = await erc20.allowance(account, activeNetwork.routerAddress);
        if (allowance < amountInWei) {
          setStatusMessage(`Requesting ${tokenIn.symbol} approval in your wallet...`);
          const approveTx = await erc20.approve(activeNetwork.routerAddress, amountInWei);
          await approveTx.wait();
        }
      }

      setStatusMessage('Confirming swap transaction in your wallet...');
      const router = new Contract(activeNetwork.routerAddress, ROUTER_ABI, signer);
      let swapTx;
      if (tokenIn.isNative) {
        swapTx = await router.swapExactETHForTokens(
          minOutWei,
          [addrA, addrB],
          account,
          deadline,
          { value: parseEther(amountIn) }
        );
      } else if (tokenOut.isNative) {
        swapTx = await router.swapExactTokensForETH(
          amountInWei,
          minOutWei,
          [addrA, addrB],
          account,
          deadline
        );
      } else {
        swapTx = await router.swapExactTokensForTokens(
          amountInWei,
          minOutWei,
          [addrA, addrB],
          account,
          deadline
        );
      }

      setStatusMessage('Waiting for blockchain confirmation...');
      const receipt = await swapTx.wait();
      setTxHash(receipt.hash);

      // Verify on backend & index transaction
      const feeEst = (
        (Number.parseFloat(amountIn) * (activeNetwork.swapFeeBps || 30)) /
        10000
      ).toFixed(6);

      await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: selectedChainId,
          txHash: receipt.hash,
          txType: 'swap',
          walletAddress: account,
          tokenInAddress: addrA,
          tokenInSymbol: tokenIn.symbol,
          tokenOutAddress: addrB,
          tokenOutSymbol: tokenOut.symbol,
          amountIn,
          amountOut,
          feeAmount: feeEst,
          feeToken: tokenIn.symbol,
          pairAddress,
        }),
      });

      setStatusMessage('Swap confirmed on-chain and indexed.');
      setAmountIn('');
      setAmountOut('');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Swap transaction failed or rejected.');
      setStatusMessage(null);
    } finally {
      setSubmitting(false);
    }
  };

  const minReceived = amountOut
    ? (
        Number.parseFloat(amountOut) *
        (1 - Number.parseFloat(slippagePct || '0.5') / 100)
      ).toFixed(6)
    : '0.00';

  return (
    <div className="space-y-6">
      <ContractStatusNotice network={activeNetwork} onNavigate={onNavigate} />

      <div className="mx-auto max-w-lg space-y-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-6">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-4">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Swap Tokens</h1>
              <p className="text-xs text-slate-400">
                Real AMM execution on {activeNetwork?.name || 'BNB Testnet'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
            >
              <Settings2 className="h-3.5 w-3.5" />
              {slippagePct}% Slippage
            </button>
          </div>

          {showSettings && (
            <div className="mt-4 space-y-3 border-b border-white/[0.07] pb-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Slippage Tolerance</span>
                <div className="flex items-center gap-1.5">
                  {['0.1', '0.5', '1.0'].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setSlippagePct(pct)}
                      className={`rounded-md px-2.5 py-1 font-mono ${
                        slippagePct === pct
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'bg-[#171D2C] text-slate-300'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <input
                    type="number"
                    step="0.1"
                    min="0.05"
                    max="49"
                    value={slippagePct}
                    onChange={(e) => setSlippagePct(e.target.value)}
                    className="w-16 rounded-md border border-white/10 bg-[#090C12] px-2 py-1 text-right font-mono text-slate-100"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Transaction Deadline (minutes)</span>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={deadlineMins}
                  onChange={(e) => setDeadlineMins(e.target.value)}
                  className="w-20 rounded-md border border-white/10 bg-[#090C12] px-2 py-1 text-right font-mono text-slate-100"
                />
              </div>
            </div>
          )}

          {/* Pay Input */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>You Pay</span>
              <button
                type="button"
                onClick={() => setAmountIn(balanceIn)}
                className="font-mono hover:text-emerald-400 tabular-nums"
              >
                Balance: {Number.parseFloat(balanceIn).toFixed(5)} {tokenIn?.symbol}
              </button>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#090C12] p-3">
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.0"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                className="w-full bg-transparent font-mono text-xl font-semibold text-slate-100 placeholder-slate-600 focus:outline-none tabular-nums"
              />
              <select
                value={tokenIn?.address || ''}
                onChange={(e) => {
                  const found = tokens.find((t) => t.address === e.target.value);
                  if (found) setTokenIn(found);
                }}
                className="rounded-lg border border-white/10 bg-[#151B28] px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none"
              >
                {tokens.map((t) => (
                  <option key={`in-${t.address}`} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="my-3 flex justify-center">
            <button
              type="button"
              onClick={handleFlip}
              className="rounded-lg border border-white/10 bg-[#171D2C] p-2 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-400 transition-colors"
              aria-label="Flip swap tokens"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          {/* Receive Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>You Receive (Estimated)</span>
              <span className="font-mono tabular-nums">
                Balance: {Number.parseFloat(balanceOut).toFixed(5)} {tokenOut?.symbol}
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#090C12] p-3">
              <input
                type="text"
                readOnly
                placeholder="0.0"
                value={amountOut}
                className="w-full bg-transparent font-mono text-xl font-semibold text-slate-100 placeholder-slate-600 focus:outline-none tabular-nums"
              />
              <select
                value={tokenOut?.address || ''}
                onChange={(e) => {
                  const found = tokens.find((t) => t.address === e.target.value);
                  if (found) setTokenOut(found);
                }}
                className="rounded-lg border border-white/10 bg-[#151B28] px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none"
              >
                {tokens.map((t) => (
                  <option key={`out-${t.address}`} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live Pool & AMM Quote Breakdown */}
          <div className="mt-5 space-y-2 border-t border-white/[0.07] pt-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">On-Chain Pair</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {pairAddress ? `${pairAddress.slice(0, 8)}...${pairAddress.slice(-6)}` : 'No Pool Deployed'}
              </span>
            </div>
            {reserves && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Pool Reserves</span>
                <span className="font-mono text-slate-200 tabular-nums">
                  {Number.parseFloat(reserves.rIn).toFixed(4)} {tokenIn?.symbol} /{' '}
                  {Number.parseFloat(reserves.rOut).toFixed(4)} {tokenOut?.symbol}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Minimum Received</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {minReceived} {tokenOut?.symbol}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Price Impact</span>
              <span
                className={`font-mono tabular-nums ${
                  Number.parseFloat(priceImpactPct) > 5 ? 'text-amber-400' : 'text-slate-200'
                }`}
              >
                {priceImpactPct}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Swap Fee</span>
              <span className="font-mono text-slate-200 tabular-nums">
                {((activeNetwork?.swapFeeBps ?? 30) / 100).toFixed(2)}%
              </span>
            </div>
            {gasEstimate && (
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Estimated Gas</span>
                <span className="font-mono text-slate-200 tabular-nums">{gasEstimate}</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div>{statusMessage}</div>
                {txHash && activeNetwork && (
                  <a
                    href={`${activeNetwork.explorerUrl}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 font-mono underline"
                  >
                    View Tx {txHash.slice(0, 12)}...
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={handleExecuteSwap}
            className="mt-5 w-full rounded-lg bg-emerald-500 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
          >
            {!account
              ? 'Connect Wallet to Swap'
              : submitting
              ? 'Processing Transaction...'
              : !activeNetwork?.routerAddress
              ? 'Router Contracts Not Configured'
              : !pairAddress
              ? 'No Liquidity Pool for Pair'
              : 'Confirm Swap'}
          </button>
        </div>

        {/* Custom ERC-20 Token Loader */}
        <div className="rounded-xl border border-white/[0.08] bg-[#111622] p-5 space-y-3">
          <div className="text-xs font-medium text-slate-300">
            Import Custom ERC-20 / BEP-20 Contract Address
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="0x... contract address"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-[#090C12] px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500 focus:outline-none"
            />
            <select
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value as 'in' | 'out')}
              className="rounded-lg border border-white/10 bg-[#171D2C] px-2.5 py-2 text-xs text-slate-200"
            >
              <option value="out">Set Receive</option>
              <option value="in">Set Pay</option>
            </select>
            <button
              type="button"
              onClick={handleLoadCustomToken}
              className="rounded-lg border border-white/10 bg-[#171D2C] px-4 py-2 text-xs font-medium text-slate-100 hover:border-emerald-500/40 whitespace-nowrap"
            >
              Inspect &amp; Load
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
