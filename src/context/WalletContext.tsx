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
  discoveredProviders: DiscoveredProvider[];
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
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    trustwallet?: Eip1193Provider;
    BinanceChain?: Eip1193Provider;
    coinbaseWalletExtension?: Eip1193Provider;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<number>(97); // Default BNB Smart Chain Testnet
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [nativeBalance, setNativeBalance] = useState<string>('0');
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [activeEip1193, setActiveEip1193] = useState<Eip1193Provider | null>(null);
  const [discoveredProviders, setDiscoveredProviders] = useState<DiscoveredProvider[]>([]);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

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

  // EIP-6963 multi-wallet discovery + injected wallet detection
  useEffect(() => {
    const found: DiscoveredProvider[] = [];
    const onAnnounce = (event: Event) => {
      const custom = event as CustomEvent<{
        info: { uuid: string; name: string; rdns: string };
        provider: Eip1193Provider;
      }>;
      const { info, provider } = custom.detail;
      const lowerName = info.name.toLowerCase();
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
        if (prev.some((p) => p.id === info.uuid)) return prev;
        return [...prev, { id: info.uuid, name: info.name, type, provider }];
      });
    };

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    if (window.ethereum) {
      const providers = Array.isArray(window.ethereum.providers)
        ? window.ethereum.providers
        : [window.ethereum];
      providers.forEach((p, idx) => {
        const isTrust = Boolean(p.isTrust || p.isTrustWallet);
        const isCoinbase = Boolean(p.isCoinbaseWallet);
        const isBinance = Boolean(p.isBinance);
        let type: WalletType = 'metamask';
        let name = 'MetaMask / Injected Web3';
        if (isTrust) {
          type = 'trustwallet';
          name = 'Trust Wallet';
        } else if (isCoinbase) {
          type = 'coinbase';
          name = 'Coinbase Wallet';
        } else if (isBinance) {
          type = 'binance';
          name = 'Binance Wallet';
        }
        found.push({
          id: `injected-${idx}`,
          name,
          type,
          provider: p,
        });
      });
    }
    if (window.trustwallet) {
      found.push({
        id: 'window-trustwallet',
        name: 'Trust Wallet',
        type: 'trustwallet',
        provider: window.trustwallet,
      });
    }
    if (window.coinbaseWalletExtension) {
      found.push({
        id: 'window-coinbase',
        name: 'Coinbase Wallet',
        type: 'coinbase',
        provider: window.coinbaseWalletExtension,
      });
    }
    if (window.BinanceChain) {
      found.push({
        id: 'window-binance',
        name: 'Binance Wallet',
        type: 'binance',
        provider: window.BinanceChain,
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

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
    };
  }, []);

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
        const parsed = Number.parseInt(chainHex, 16);
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
    try {
      let targetProvider = customProvider;
      if (!targetProvider) {
        const matched = discoveredProviders.find((p) => p.type === preferred);
        targetProvider = matched?.provider || window.ethereum;
      }

      if (!targetProvider) {
        const labelMap: Record<WalletType, string> = {
          metamask: 'MetaMask',
          trustwallet: 'Trust Wallet',
          coinbase: 'Coinbase Wallet',
          binance: 'Binance Wallet',
          walletconnect: 'WalletConnect',
        };
        throw new Error(
          `${labelMap[preferred]} extension or DApp browser was not detected. Install the ${labelMap[preferred]} extension or open TataSwap inside your mobile wallet via WalletConnect.`
        );
      }

      const accounts = (await targetProvider.request({
        method: 'eth_requestAccounts',
      })) as string[];

      if (!accounts || accounts.length === 0) {
        throw new Error('Wallet connection rejected or returned no accounts.');
      }

      const chainHex = (await targetProvider.request({
        method: 'eth_chainId',
      })) as string;
      const currentChain = Number.parseInt(chainHex, 16);

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
        discoveredProviders,
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
