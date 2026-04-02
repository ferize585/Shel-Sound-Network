import './polyfills'; // ABSOLUTELY MUST BE FIRST LINE
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';

import App from './App';
import './index.css';

import { ShelbyClientProvider } from '@shelby-protocol/react';
import { ShelbyClient } from '@shelby-protocol/sdk/browser';
import { Network } from '@aptos-labs/ts-sdk';

const queryClient = new QueryClient();

function ShelbyProvider({ children }: { children: React.ReactNode }) {
  const shelbyClient = useMemo(() => {
    // Reverted to stable Testnet-only configuration.
    // Shelbynet prototype logic has been removed to ensure maximum stability.
    return new ShelbyClient({ 
      apiKey: import.meta.env.VITE_SHELBY_API_KEY_TESTNET,
      // Reverted to custom Shelby indexer to resolve 'blobs' field validation errors.
      // @ts-ignore - custom indexer endpoint
      gqlEndpoint: 'https://api.testnet.aptoslabs.com/nocode/v1/public/cmlfqs5wt00qrs601zt5s4kfj/v1/graphql',
      // @ts-ignore - aligning with official .xyz RPC route (root API alignment)
      rpcUrl: 'https://api.testnet.shelby.xyz',
      network: Network.TESTNET 
    });
  }, []);

  return (
    <AptosWalletAdapterProvider 
      autoConnect={true}
      dappConfig={{ network: Network.TESTNET }}
      onError={(error) => {
        if (import.meta.env.DEV) console.error('[Wallet Ecosystem] Rejection/Error caught:', error);
      }}
    >
      <ShelbyClientProvider client={shelbyClient}>
        {children}
      </ShelbyClientProvider>
    </AptosWalletAdapterProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ShelbyProvider>
        <App />
      </ShelbyProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
