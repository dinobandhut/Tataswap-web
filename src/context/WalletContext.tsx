import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, formatUnits } from 'ethers';
import type { NetworkConfig } from '../types/dex';
import { ERC20_ABI } from '../lib/abis';

export type WalletType =
  | 'metamask'
  | 'trustwallet'
  | 'walletconnect'
  | 'coinbase'
  | 'binance';

export interface DiscoveredProvider {
  id: string;
  name: string;
  type: WalletType;
  provider: Eip1193Provider;
}

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  enable?: () => Promise<string[]>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isBinance?: boolean;
}

interface WalletContextValue {
  account: string | null;
  walletType: WalletType | null;
  walletChainId: number | null;
  selectedChainId: number;
  setSelectedChainId: (chainId: number) => void;
  networks: NetworkConfig[];
  activeNetwork: NetworkConfig | null;
  refreshNetworks: () => Promise<void>;
  nativeBalance: string;
  isConnecting: boolean;
  walletError: string | null;
  clearWalletError: () => void;
  discoveredProviders: DiscoveredProvider[];
  isInIframe: boolean;
  isMobileBrowser: boolean;
  connectWallet: (preferred?: WalletType, customProvider?: Eip1193Provider) => Promise<void>;
  disconnectWallet: () => void;
  switchNetwork: (chainId: number) => Promise<void>;
  getBrowserProvider: () => BrowserProvider | null;
  getReadProvider: (chainId?: number) => JsonRpcProvider | null;
  getTokenBalance: (tokenAddress: string, ownerAddress?: string, chainId?: number) => Promise<string>;
  signMessage: (message: string) => Promise<string>;
  walletModalOpen: boolean;
  setWalletModalOpen: (open: boolean) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

declare global {
  interface Window {
    ethereum?: Eip1193Provider & {
      providers?: Eip1193Provider[];
      selectedProvider?: Eip1193Provider;
    };
    trustwallet?: Eip1193Provider & { ethereum?: Eip1193Provider };
    BinanceChain?: Eip1193Provider;
    binancew3w?: { ethereum?: Eip1193Provider };
    coinbaseWalletExtension?: Eip1193Provider;
  }
}

function classifyProvider(p: Eip1193Provider): { type: WalletType; name: string } {
  if (p.isTrust || p.isTrustWallet) {
    return { type: 'trustwallet', name: 'Trust Wallet' };
  }
  if (p.isCoinbaseWallet) {
    return { type: 'coinbase', name: 'Coinbase Wallet' };
  }
  if (p.isBinance) {
    return { type: 'binance', name: 'Binance Wallet' };
  }
  return { type: 'metamask', name: 'MetaMask / Web3 Wallet' };
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<number>(97);
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [nativeBalance, setNativeBalance] = useState<string>('0');
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [activeEip1193, setActiveEip1193] = useState<Eip1193Provider | null>(null);
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[]>([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  const isInIframe =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

  const isMobileBrowser =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  const activeNetwork =
    networks.find((n) => n.chainId === selectedChainId) || networks[0] || null;

  const refreshNetworks = useCallback(async () => {
    try {
      const res = await fetch('/api/networks');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.networks)) {
        setNetworks(data.networks);
      }
    } catch (err) {
      console.error('Failed to load networks:', err);
    }
  }, []);

  useEffect(() => {
    refreshNetworks();
  }, [refreshNetworks]);

  const scanInjectedProviders = useCallback(() => {
    const found: DiscoveredProvider[] = [];

    if (window.ethereum) {
      const rawList = Array.isArray(window.ethereum.providers)
        ? window.ethereum.providers
        : [window.ethereum];
      rawList.forEach((p, idx) => {
        if (!p || typeof p.request !== 'function') return;
        const { type, name } = classifyProvider(p);
        found.push({
          id: `injected-${idx}-${type}`,
          name,
          type,
          provider: p,
        });
      });
    }

    const trustProv = window.trustwallet?.ethereum || window.trustwallet;
    if (trustProv && typeof trustProv.request === 'function') {
      found.push({
        id: 'window-trustwallet',
        name: 'Trust Wallet',
        type: 'trustwallet',
        provider: trustProv,
      });
    }

    if (
      window.coinbaseWalletExtension &&
      typeof window.coinbaseWalletExtension.request === 'function'
    ) {
      found.push({
        id: 'window-coinbase',
        name: 'Coinbase Wallet',
        type: 'coinbase',
        provider: window.coinbaseWalletExtension,
      });
    }

    const binanceProv = window.binancew3w?.ethereum || window.BinanceChain;
    if (binanceProv && typeof binanceProv.request === 'function') {
      found.push({
        id: 'window-binance',
        name: 'Binance Wallet',
        type: 'binance',
        provider: binanceProv,
      });
    }

    if (found.length > 0) {
      setDiscoveredProviders((prev) => {
        const merged = [...prev];
        for (const item of found) {
          if (!merged.some((m) => m.provider === item.provider)) {
            merged.push(item);
          }
        }
        return merged;
      });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    }
  }, []);

  // EIP-6963 multi-wallet discovery + asynchronous mobile ethereum#initialized listener
  useEffect(() => {
    const onAnnounce = (event: Event) => {
      const custom = event as CustomEvent<{
        info: { uuid: string; name: string; rdns: string };
        provider: Eip1193Provider;
      }>;
      const { info, provider } = custom.detail;
      if (!provider || typeof provider.request !== 'function') return;
      const lowerName = (info.name || '').toLowerCase();
      const lowerRdns = (info.rdns || '').toLowerCase();
      let type: WalletType = 'metamask';
      if (lowerName.includes('trust') || lowerRdns.includes('trust')) {
        type = 'trustwallet';
      } else if (lowerName.includes('coinbase') || lowerRdns.includes('coinbase')) {
        type = 'coinbase';
      } else if (lowerName.includes('binance') || lowerRdns.includes('binance')) {
        type = 'binance';
      }
      setDiscoveredProviders((prev) => {
        if (prev.some((p) => p.id === info.uuid || p.provider === provider)) return prev;
        return [...prev, { id: info.uuid, name: info.name, type, provider }];
      });
    };

    const onEthInit = () => scanInjectedProviders();

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.addEventListener('ethereum#initialized', onEthInit);
    scanInjectedProviders();

    const retryTimer = setTimeout(scanInjectedProviders, 600);

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      window.removeEventListener('ethereum#initialized', onEthInit);
    };
  }, [scanInjectedProviders]);

  // Re-scan whenever wallet modal opens
  useEffect(() => {
    if (walletModalOpen) {
      scanInjectedProviders();
    }
  }, [walletModalOpen, scanInjectedProviders]);

  // Silent eth_accounts check for already-authorized DApp browser sessions
  useEffect(() => {
    if (account || discoveredProviders.length === 0) return;
    let cancelled = false;
    async function checkExistingSession() {
      for (const entry of discoveredProviders) {
        try {
          const accs = (await entry.provider.request({
            method: 'eth_accounts',
          })) as string[];
          if (!cancelled && Array.isArray(accs) && accs.length > 0) {
            const chainHex = (await entry.provider.request({
              method: 'eth_chainId',
            })) as string;
            const parsedChain = Number.parseInt(chainHex, 16);
            setActiveEip1193(entry.provider);
            setAccount(accs[0]);
            setWalletType(entry.type);
            if (!Number.isNaN(parsedChain)) {
              setWalletChainId(parsedChain);
            }
            break;
          }
        } catch {
          // Ignore providers that do not respond to silent check
        }
      }
    }
    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [account, discoveredProviders]);

  const getReadProvider = useCallback(
    (chainId?: number): JsonRpcProvider | null => {
      const targetId = chainId ?? selectedChainId;
      const net = networks.find((n) => n.chainId === targetId);
      if (!net?.rpcUrl) return null;
      return new JsonRpcProvider(net.rpcUrl);
    },
    [networks, selectedChainId]
  );

  const refreshNativeBalance = useCallback(async () => {
    if (!account) {
      setNativeBalance('0');
      return;
    }
    try {
      const provider = getReadProvider(selectedChainId);
      if (!provider) return;
      const bal = await provider.getBalance(account);
      setNativeBalance(formatEther(bal));
    } catch {
      setNativeBalance('0');
    }
  }, [account, getReadProvider, selectedChainId]);

  useEffect(() => {
    refreshNativeBalance();
  }, [refreshNativeBalance]);

  // Listen to EIP-1193 account & chain changes
  useEffect(() => {
    if (!activeEip1193?.on) return;
    const handleAccountsChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? (accounts as string[]) : [];
      if (list.length === 0) {
        setAccount(null);
        setWalletType(null);
      } else {
        setAccount(list[0]);
      }
    };
    const handleChainChanged = (chainHex: unknown) => {
      if (typeof chainHex === 'string') {
        const parsed = chainHex.startsWith('0x')
          ? Number.parseInt(chainHex, 16)
          : Number.parseInt(chainHex, 10);
        if (!Number.isNaN(parsed)) {
          setWalletChainId(parsed);
          if (networks.some((n) => n.chainId === parsed)) {
            setSelectedChainId(parsed);
          }
        }
      }
    };

    activeEip1193.on('accountsChanged', handleAccountsChanged);
    activeEip1193.on('chainChanged', handleChainChanged);
    return () => {
      activeEip1193.removeListener?.('accountsChanged', handleAccountsChanged);
      activeEip1193.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [activeEip1193, networks]);

  const connectWallet = async (
    preferred: WalletType = 'metamask',
    customProvider?: Eip1193Provider
  ) => {
    setWalletError(null);
    setIsConnecting(true);
    scanInjectedProviders();

    try {
      let targetProvider = customProvider;

      if (!targetProvider) {
        const matched = discoveredProviders.find((p) => p.type === preferred);
        if (matched) {
          targetProvider = matched.provider;
        } else if (preferred === 'trustwallet') {
          targetProvider =
            window.trustwallet?.ethereum || window.trustwallet || window.ethereum;
        } else if (preferred === 'binance') {
          targetProvider =
            window.binancew3w?.ethereum || window.BinanceChain || window.ethereum;
        } else if (preferred === 'coinbase') {
          targetProvider = window.coinbaseWalletExtension || window.ethereum;
        } else {
          targetProvider = window.ethereum || discoveredProviders[0]?.provider;
        }
      }

      if (!targetProvider) {
        const labelMap: Record<WalletType, string> = {
          metamask: 'MetaMask',
          trustwallet: 'Trust Wallet',
          coinbase: 'Coinbase Wallet',
          binance: 'Binance Wallet',
          walletconnect: 'WalletConnect',
        };
        if (isInIframe) {
          throw new Error(
            `${labelMap[preferred]} extension cannot inject into an embedded preview frame. Click "Open in New Tab" below to connect your browser extension, or use Mobile DApp Links.`
          );
        }
        throw new Error(
          `${labelMap[preferred]} was not detected in this browser. Use the Mobile Wallet Launch links below to open TataSwap directly inside ${labelMap[preferred]}'s DApp browser.`
        );
      }

      let accounts: string[] = [];
      try {
        accounts = (await targetProvider.request({
          method: 'eth_requestAccounts',
        })) as string[];
      } catch (reqErr: unknown) {
        const code = (reqErr as { code?: number })?.code;
        if (code === -32002) {
          throw new Error(
            'A wallet connection popup is already pending. Open your wallet extension and approve the connection.'
          );
        }
        if (code === 4001) {
          throw new Error('Connection request was rejected in your wallet.');
        }
        if (typeof targetProvider.enable === 'function') {
          accounts = await targetProvider.enable();
        } else {
          throw reqErr;
        }
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('Wallet returned no accounts.');
      }

      let currentChain = selectedChainId;
      try {
        const chainHex = (await targetProvider.request({
          method: 'eth_chainId',
        })) as string;
        const parsed = chainHex.startsWith('0x')
          ? Number.parseInt(chainHex, 16)
          : Number.parseInt(chainHex, 10);
        if (!Number.isNaN(parsed)) currentChain = parsed;
      } catch {
        // Fallback to active selectedChainId
      }

      setActiveEip1193(targetProvider);
      setAccount(accounts[0]);
      setWalletType(preferred);
      setWalletChainId(currentChain);
      if (networks.some((n) => n.chainId === currentChain)) {
        setSelectedChainId(currentChain);
      }
      setWalletModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet.';
      setWalletError(msg);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setWalletType(null);
    setWalletChainId(null);
    setActiveEip1193(null);
    setNativeBalance('0');
    setWalletError(null);
  };

  const switchNetwork = async (chainId: number) => {
    setSelectedChainId(chainId);
    setWalletError(null);
    const targetNet = networks.find((n) => n.chainId === chainId);
    if (!activeEip1193 || !targetNet) return;

    const hexChainId = `0x${chainId.toString(16)}`;
    try {
      await activeEip1193.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hexChainId }],
      });
      setWalletChainId(chainId);
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        await activeEip1193.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: targetNet.name,
              nativeCurrency: {
                name: targetNet.nativeSymbol,
                symbol: targetNet.nativeSymbol,
                decimals: 18,
              },
              rpcUrls: [targetNet.rpcUrl],
              blockExplorerUrls: [targetNet.explorerUrl],
            },
          ],
        });
        setWalletChainId(chainId);
      } else {
        setWalletError(
          err instanceof Error ? err.message : 'Failed to switch network in wallet.'
        );
      }
    }
  };

  const getBrowserProvider = useCallback(() => {
    if (!activeEip1193) return null;
    return new BrowserProvider(activeEip1193);
  }, [activeEip1193]);

  const getTokenBalance = useCallback(
    async (tokenAddress: string, ownerAddress?: string, chainId?: number) => {
      const owner = ownerAddress || account;
      if (!owner) return '0';
      const provider = getReadProvider(chainId);
      if (!provider) return '0';
      try {
        const contract = new Contract(tokenAddress, ERC20_ABI, provider);
        const [bal, dec] = await Promise.all([
          contract.balanceOf(owner),
          contract.decimals(),
        ]);
        return formatUnits(bal, Number(dec));
      } catch {
        return '0';
      }
    },
    [account, getReadProvider]
  );

  const signMessage = async (message: string) => {
    const provider = getBrowserProvider();
    if (!provider) throw new Error('Connect your Web3 wallet first.');
    const signer = await provider.getSigner();
    return await signer.signMessage(message);
  };

  return (
    <WalletContext.Provider
      value={{
        account,
        walletType,
        walletChainId,
        selectedChainId,
        setSelectedChainId,
        networks,
        activeNetwork,
        refreshNetworks,
        nativeBalance,
        isConnecting,
        walletError,
        clearWalletError: () => setWalletError(null),
        discoveredProviders,
        isInIframe,
        isMobileBrowser,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        getBrowserProvider,
        getReadProvider,
        getTokenBalance,
        signMessage,
        walletModalOpen,
        setWalletModalOpen,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
