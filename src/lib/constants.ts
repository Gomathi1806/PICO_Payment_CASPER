import { base, baseSepolia } from 'wagmi/chains';

// USDC on Base Mainnet (official Circle address)
export const USDC_MAINNET_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;

// USDC on Base Sepolia Testnet (official Circle address)
export const USDC_TESTNET_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

// Minimal ERC-20 ABI — only what we need for transfer & balance
export const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Pico treasury wallet — receives the platform fee.
// Set NEXT_PUBLIC_PICO_TREASURY_ADDRESS in .env. Falls back to zero address (fee disabled) for local dev.
export const PICO_TREASURY_ADDRESS = (
  process.env.NEXT_PUBLIC_PICO_TREASURY_ADDRESS ||
  '0x0000000000000000000000000000000000000000'
) as `0x${string}`;

// Tiered platform fee — lower % at higher price points so we stay competitive
// with Stripe/PayPal/Patreon at every tier. See README for the full comparison.
//   < $10   → 5.0%
//   < $50   → 4.0%
//   < $100  → 3.8%
//   >= $100 → 2.8%
export const calculateFeeBps = (priceUSD: number): bigint => {
  if (priceUSD < 10) return 500n;
  if (priceUSD < 50) return 400n;
  if (priceUSD < 100) return 380n;
  return 280n;
};

export const splitFee = (totalUnits: bigint, priceUSD: number) => {
  const bps = calculateFeeBps(priceUSD);
  const fee = (totalUnits * bps) / 10000n;
  const creatorAmount = totalUnits - fee;
  return { fee, creatorAmount, bps };
};

export const getUSDCConfig = (chainId?: number) => {
  if (chainId === baseSepolia.id) {
    return {
      address: USDC_TESTNET_ADDRESS,
      decimals: 6,
      name: 'Base Sepolia Testnet',
      faucetUrl: 'https://faucet.circle.com/',
    };
  }
  return {
    address: USDC_MAINNET_ADDRESS,
    decimals: 6,
    name: 'Base Mainnet',
    faucetUrl: null,
  };
};
