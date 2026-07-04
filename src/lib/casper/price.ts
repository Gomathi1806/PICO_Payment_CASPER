import 'server-only';

// ─── USD → CSPR conversion ──────────────────────────────────
// Pico prices are stored in USD; the Casper rail converts at unlock
// time using CoinGecko's public spot price, cached 60s server-side
// (same pattern as getUSDCtoGBP in actions/pico.ts). A conservative
// fallback keeps the flow alive if the API is down — set
// CASPER_USD_FALLBACK to tune it.

import { MIN_TRANSFER_MOTES, MOTES_PER_CSPR } from './config';

const FALLBACK_RATE = Number(process.env.CASPER_USD_FALLBACK) || 0.01;

let cache: { rate: number; ts: number } | null = null;

/** Current CSPR price in USD, cached for 60 seconds. */
export async function getCsprUsdRate(): Promise<number> {
  if (cache && Date.now() - cache.ts < 60_000) return cache.rate;
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=casper-network&vs_currencies=usd',
      { next: { revalidate: 60 } },
    );
    const json = await res.json();
    const rate = Number(json?.['casper-network']?.usd);
    if (!rate || !Number.isFinite(rate) || rate <= 0) throw new Error('bad rate');
    cache = { rate, ts: Date.now() };
    return rate;
  } catch {
    return cache?.rate ?? FALLBACK_RATE;
  }
}

/**
 * Converts a USD price to motes at the given rate, rounding up and
 * enforcing Casper's 2.5 CSPR native-transfer minimum.
 */
export function usdToMotes(usd: number, rate: number): bigint {
  const cspr = usd / rate;
  const motes = BigInt(Math.ceil(cspr * Number(MOTES_PER_CSPR)));
  return motes < MIN_TRANSFER_MOTES ? MIN_TRANSFER_MOTES : motes;
}

/**
 * Minimum motes we'll accept as covering `usd` when verifying a
 * payment. Allows 5% slippage so a fan quoted a price a minute ago
 * isn't rejected because CSPR ticked up before confirmation.
 */
export function minAcceptableMotes(usd: number, rate: number): bigint {
  const exact = usdToMotes(usd, rate);
  const withSlippage = (exact * 95n) / 100n;
  return withSlippage < MIN_TRANSFER_MOTES ? MIN_TRANSFER_MOTES : withSlippage;
}
