// ─── Casper network configuration ───────────────────────────
// Pico's second payment rail. The EVM flow (Base + USDC via x402)
// stays untouched; this module powers the parallel CSPR flow used by
// CasperPayButton, the /api/casper/content agent endpoint, and the
// server actions in src/app/actions/casper.ts.
//
// Network is selected once, at deploy time, via NEXT_PUBLIC_CASPER_NETWORK:
//   casper-test → Casper Testnet (default — hackathon qualification requires it)
//   casper      → Casper Mainnet
//
// RPC URL can be overridden with CASPER_RPC_URL (server-side only; the
// browser never talks to the node directly — deploys are built and
// signed client-side but submitted through a server action to avoid
// CORS and to keep verification server-authoritative).

export type CasperNetworkName = 'casper' | 'casper-test';

export interface CasperNetworkConfig {
  /** chain_name embedded in every deploy — MUST match the node's network */
  chainName: CasperNetworkName;
  /** Human label for UI */
  label: string;
  /** JSON-RPC endpoint (server-side use only) */
  rpcUrl: string;
  /** Block explorer base URL */
  explorerUrl: string;
  /** Faucet for test CSPR, null on mainnet */
  faucetUrl: string | null;
}

export const CASPER_NETWORKS: Record<CasperNetworkName, CasperNetworkConfig> = {
  'casper-test': {
    chainName: 'casper-test',
    label: 'Casper Testnet',
    rpcUrl: 'https://node.testnet.casper.network/rpc',
    explorerUrl: 'https://testnet.cspr.live',
    faucetUrl: 'https://testnet.cspr.live/tools/faucet',
  },
  casper: {
    chainName: 'casper',
    label: 'Casper Mainnet',
    rpcUrl: 'https://node.mainnet.casper.network/rpc',
    explorerUrl: 'https://cspr.live',
    faucetUrl: null,
  },
};

const envNetwork = (process.env.NEXT_PUBLIC_CASPER_NETWORK || 'casper-test')
  .trim()
  .toLowerCase();

export const ACTIVE_CASPER_NETWORK: CasperNetworkName =
  envNetwork === 'casper' || envNetwork === 'mainnet' ? 'casper' : 'casper-test';

export const getCasperConfig = (): CasperNetworkConfig => {
  const base = CASPER_NETWORKS[ACTIVE_CASPER_NETWORK];
  const rpcOverride = process.env.CASPER_RPC_URL?.trim();
  return rpcOverride ? { ...base, rpcUrl: rpcOverride } : base;
};

// ─── Motes math ─────────────────────────────────────────────
// 1 CSPR = 10^9 motes. Casper enforces a minimum native transfer of
// 2.5 CSPR, which acts as Pico's price floor on this rail — a $0.25
// unlock still clears it comfortably at current CSPR prices.
export const MOTES_PER_CSPR = 1_000_000_000n;
export const MIN_TRANSFER_MOTES = 2_500_000_000n; // 2.5 CSPR network minimum
export const TRANSFER_PAYMENT_MOTES = 100_000_000n; // 0.1 CSPR gas for native transfer
// A contract call is heavier than a native transfer — three state
// writes and an event emission — so give it more gas headroom.
export const ROUTER_PAYMENT_MOTES = 3_000_000_000n; // 3 CSPR gas ceiling for pay()

export const motesToCspr = (motes: bigint): string => {
  const whole = motes / MOTES_PER_CSPR;
  const frac = motes % MOTES_PER_CSPR;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(9, '0').replace(/0+$/, '')}`;
};

export const csprToMotes = (cspr: number): bigint =>
  BigInt(Math.ceil(cspr * Number(MOTES_PER_CSPR)));

export const deployExplorerUrl = (deployHash: string): string =>
  `${getCasperConfig().explorerUrl}/deploy/${deployHash}`;

// ─── PicoRouter — on-chain fee splitter ─────────────────────
// Deployed as a versioned contract package; calls target the package
// hash and Casper resolves the latest version at execution time. Set
// per network so a future mainnet deploy just needs another env var.

export const PICO_ROUTER_PACKAGE_HASH: Record<CasperNetworkName, string | null> = {
  'casper-test':
    process.env.NEXT_PUBLIC_CASPER_ROUTER_PACKAGE_HASH_TESTNET ||
    'b4b5d701e5bd635b8e49ae2b8dbc8a8169870a9c673479b8f2461d63efa0608c',
  casper: process.env.NEXT_PUBLIC_CASPER_ROUTER_PACKAGE_HASH_MAINNET || null,
};

export const getRouterPackageHash = (): string | null =>
  PICO_ROUTER_PACKAGE_HASH[ACTIVE_CASPER_NETWORK];

export const contractExplorerUrl = (packageHashHex: string): string =>
  `${getCasperConfig().explorerUrl}/contract-package/${packageHashHex}`;
