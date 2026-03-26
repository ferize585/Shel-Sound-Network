import './polyfills';
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { Network } from "@aptos-labs/ts-sdk";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShelbyClientProvider } from '@shelby-protocol/react';
import { ShelbyClient } from '@shelby-protocol/sdk/browser';

const queryClient = new QueryClient();
const apiKey = import.meta.env.VITE_SHELBY_API_KEY_TESTNET;

console.log("Shelby API Key:", apiKey);

// Wrapper to satisfy the requirement of ShelbyProvider with apiKey prop
const ShelbyProvider = ({ children, apiKey }: { children: React.ReactNode; apiKey?: string }) => {
  const client = React.useMemo(() => new ShelbyClient({ network: "testnet", apiKey }), [apiKey]);
  return <ShelbyClientProvider client={client}>{children}</ShelbyClientProvider>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AptosWalletAdapterProvider 
      autoConnect={true}
      dappConfig={{ 
        network: Network.TESTNET,
        aptosConnect: {}
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
