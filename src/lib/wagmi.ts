import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

export const config = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: 'Pico',
      preference: { options: 'smartWalletOnly' }, // Forces FaceID/Passkey — no MetaMask, no seed phrases
    }),
  ],
  transports: {
    // Using fast, official RPC nodes to prevent "Fetching balances" loading hangs
    [base.id]: http('https://mainnet.base.org'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
});
