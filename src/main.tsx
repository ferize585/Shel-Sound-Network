import './polyfills';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { PetraWallet } from "petra-plugin-wallet-adapter";
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShelbyClientProvider } from '@shelby-protocol/react';
import { ShelbyClient } from '@shelby-protocol/sdk/browser';

const queryClient = new QueryClient();
const apiKey = import.meta.env.VITE_SHELBY_API_KEY_TESTNET;

// Wrapper to satisfy the requirement of ShelbyProvider with apiKey prop
const ShelbyProvider = ({ children, apiKey }: { children: React.ReactNode; apiKey?: string }) => {
  // @ts-ignore - The Shelby SDK expects a specific string or enum that may conflict with the upgraded Aptos SDK types
  const client = React.useMemo(() => new ShelbyClient({ network: "testnet", apiKey }), [apiKey]);
  return <ShelbyClientProvider client={client}>{children}</ShelbyClientProvider>;
};

const wallets = [
  new PetraWallet() as any
];

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AptosWalletAdapterProvider 
      plugins={wallets}
      autoConnect={true}
      dappConfig={{ 
        network: Network.TESTNET,
        aptosConnect: { dappId: "shelby-audio-player" }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ShelbyProvider apiKey={apiKey}>
          <App />
        </ShelbyProvider>
      </QueryClientProvider>
    </AptosWalletAdapterProvider>
  </React.StrictMode>,
)
