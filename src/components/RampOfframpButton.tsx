'use client';

import React, { useState } from 'react';

interface Props {
  walletAddress: string;
  defaultAmountUSDC?: string;
  onSaleCreated?: (saleId: string) => void;
}

const RAMP_API_KEY = process.env.NEXT_PUBLIC_RAMP_API_KEY;

/**
 * One-click off-ramp button using Ramp Network's widget.
 *
 * Phase 1: gated by NEXT_PUBLIC_RAMP_API_KEY. When the key isn't
 * configured (i.e., Ramp hasn't approved Pico's partner application
 * yet), the button renders in a "pending approval" state so creators
 * see the planned UX without us pretending the integration is live.
 *
 * Once Ramp approves us:
 *   1. Add NEXT_PUBLIC_RAMP_API_KEY=<prod-key> to Vercel env
 *   2. Whitelist pico.link in the Ramp partner dashboard
 *   3. Redeploy. Button activates automatically.
 */
export default function RampOfframpButton({ walletAddress, defaultAmountUSDC, onSaleCreated }: Props) {
  const [busy, setBusy] = useState(false);

  if (!RAMP_API_KEY) {
    return (
      <button
        type="button"
        disabled
        className="btn btn-secondary"
        style={{ width: '100%', padding: '0.85rem', fontSize: '0.85rem', opacity: 0.65, cursor: 'not-allowed' }}
        title="Ramp Network production approval pending"
      >
        ⏳ Ramp 1-click cashout — pending approval
      </button>
    );
  }

  const handleClick = async () => {
    setBusy(true);
    try {
      // Lazy import — Ramp's SDK touches window and would break SSR if
      // top-level imported. The button is client-only anyway, but the
      // lazy load also keeps it out of the initial dashboard bundle.
      const { RampInstantSDK, RampInstantEventTypes } = await import('@ramp-network/ramp-instant-sdk');

      const widget = new RampInstantSDK({
        hostAppName: 'Pico',
        hostLogoUrl: typeof window !== 'undefined' ? `${window.location.origin}/icon.png` : '',
        hostApiKey: RAMP_API_KEY,
        swapAsset: 'BASE_USDC',
        userAddress: walletAddress,
        fiatCurrency: 'GBP',
        ...(defaultAmountUSDC ? { swapAmount: toBaseUnits(defaultAmountUSDC) } : {}),
        // Off-ramp flow — Ramp's widget infers this from swapAsset +
        // sale-mode flag. The widget shows GBP destinations (Faster
        // Payments bank transfer at 0.99% in the UK).
        enabledFlows: ['OFFRAMP'],
        defaultFlow: 'OFFRAMP',
      });

      widget.on('*', (event) => {
        if (event.type === RampInstantEventTypes.OFFRAMP_SALE_CREATED) {
          const saleId = (event.payload as { sale?: { id?: string } } | undefined)?.sale?.id;
          if (saleId && onSaleCreated) onSaleCreated(saleId);
        }
        if (event.type === RampInstantEventTypes.WIDGET_CLOSE) {
          setBusy(false);
        }
      });

      widget.show();
    } catch (err) {
      console.error('[Pico] Ramp widget failed to open:', err);
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || !walletAddress}
      className="btn btn-primary"
      style={{ width: '100%', padding: '0.85rem', fontSize: '0.85rem' }}
    >
      {busy ? 'Opening Ramp…' : '🚀 Cash out via Ramp — UK bank in ~1 hour'}
    </button>
  );
}

// Ramp accepts swapAmount in base units. USDC = 6 decimals, so £10 of
// USDC ≈ 12_500_000 units depending on rate. The widget recomputes the
// actual fiat at open time; we just give it the asset-side amount.
function toBaseUnits(usdc: string): string {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return Math.round(n * 1_000_000).toString();
}
