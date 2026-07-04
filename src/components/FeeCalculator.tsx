'use client';

import React, { useMemo, useState } from 'react';

interface Provider {
  name: string;
  net: (priceGBP: number) => number;
  rejects?: (priceGBP: number) => boolean;
  highlight?: boolean;
  note?: string;
}

// Fee models used in the comparison. Pico is the x402-protocol path: a
// near-zero facilitator cost (~£0.001 in gas, currently subsidised by
// Coinbase's facilitator on Base) plus the tiered platform fee that
// kicks in via the PicoRouter splitter contract.
//
// The numbers for Stripe / PayPal / Patreon / Gumroad come from each
// provider's public UK pricing page as of June 2026.
const PROVIDERS: Provider[] = [
  {
    name: 'Stripe (UK card)',
    net: (p) => Math.max(0, p - (p * 0.015 + 0.2)),
    rejects: (p) => p < 0.3, // Stripe's effective minimum after fees
  },
  {
    name: 'PayPal',
    net: (p) => Math.max(0, p - (p * 0.029 + 0.3)),
    rejects: (p) => p < 0.4,
  },
  {
    name: 'Gumroad (10% + Stripe)',
    net: (p) => Math.max(0, p - p * 0.1 - (p * 0.015 + 0.2)),
  },
  {
    name: 'Patreon (8% + payment fee)',
    net: (p) => Math.max(0, p - p * 0.08 - (p * 0.039 + 0.3)),
  },
  {
    name: 'Pico (x402 + tiered)',
    net: (p) => {
      const bps = picoFeeBps(p);
      return p - p * (bps / 10000) - 0.001; // 0.001 = ~gas/facilitator cost
    },
    highlight: true,
    note: 'Tiered 5% < $10, 4% < $50, 3.8% < $100, 2.8% above',
  },
];

function picoFeeBps(priceGBP: number): number {
  // Mirrors src/lib/constants.ts calculateFeeBps. Tiers are in USD; we
  // approximate at parity for the calculator — close enough for a
  // marketing tool, exact rates are recomputed on-chain.
  if (priceGBP < 10) return 500;
  if (priceGBP < 50) return 400;
  if (priceGBP < 100) return 380;
  return 280;
}

const fmt = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });

/**
 * Inline calculator that lets a prospect plug their own price + monthly
 * volume in and see the per-transaction and per-month net comparison.
 * Designed to drop into either landing page without extra wrapper styles.
 */
export default function FeeCalculator() {
  const [price, setPrice] = useState(1);
  const [volume, setVolume] = useState(1000);

  const rows = useMemo(() => {
    return PROVIDERS.map((p) => {
      const rejected = p.rejects?.(price) ?? false;
      const net = rejected ? 0 : p.net(price);
      return {
        ...p,
        rejected,
        perTx: net,
        perMonth: net * volume,
      };
    });
  }, [price, volume]);

  const picoMonth = rows.find((r) => r.highlight)?.perMonth ?? 0;
  const bestCompetitor = rows
    .filter((r) => !r.highlight && !r.rejected)
    .reduce((a, b) => (a.perMonth > b.perMonth ? a : b), { perMonth: 0, name: '—' });
  const lift = bestCompetitor.perMonth > 0
    ? Math.round(((picoMonth - bestCompetitor.perMonth) / bestCompetitor.perMonth) * 100)
    : null;

  return (
    <div
      className="glass"
      style={{
        padding: '1.5rem',
        marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, rgba(99,102,241,0.01) 100%)',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.1rem', margin: 0 }}>📊 What would you actually keep?</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Plug in your numbers</span>
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <NumberField
          label="Price per unlock"
          symbol="£"
          value={price}
          onChange={setPrice}
          min={0.1}
          max={500}
          step={0.1}
        />
        <NumberField
          label="Unlocks / month"
          value={volume}
          onChange={setVolume}
          min={1}
          max={1_000_000}
          step={50}
        />
      </div>

      {/* Comparison table */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--card-border)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.25rem' }}>Provider</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.25rem' }}>Net per unlock</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.25rem' }}>Net / month</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} style={{ borderTop: '1px solid var(--card-border)' }}>
                <td style={{
                  padding: '0.6rem 0.25rem',
                  fontWeight: r.highlight ? 700 : 400,
                  color: r.highlight ? 'var(--success)' : r.rejected ? '#f87171' : 'inherit',
                }}>
                  {r.name}{r.note && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.4rem' }}>· {r.note}</span>}
                </td>
                <td style={{ padding: '0.6rem 0.25rem', textAlign: 'right' }}>
                  {r.rejected ? <span style={{ color: '#f87171' }}>Rejected</span> : fmt(r.perTx)}
                </td>
                <td style={{
                  padding: '0.6rem 0.25rem',
                  textAlign: 'right',
                  fontWeight: r.highlight ? 700 : 600,
                  color: r.highlight ? 'var(--success)' : 'inherit',
                }}>
                  {r.rejected ? '—' : fmt(r.perMonth)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Headline */}
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {lift !== null && lift > 0 ? (
          <>At <b style={{ color: 'white' }}>{fmt(price)}/unlock</b> × <b style={{ color: 'white' }}>{volume.toLocaleString('en-GB')}</b> unlocks/month, Pico nets <b style={{ color: 'var(--success)' }}>{fmt(picoMonth)}</b> — that&apos;s <b style={{ color: 'var(--success)' }}>+{lift}%</b> more than {bestCompetitor.name}.</>
        ) : price < 0.5 ? (
          <>At <b style={{ color: 'white' }}>{fmt(price)}/unlock</b>, traditional rails reject the charge or lose most of it to fees. Pico nets <b style={{ color: 'var(--success)' }}>{fmt(picoMonth)}/month</b> on this volume — a market that doesn&apos;t exist anywhere else.</>
        ) : (
          <>At <b style={{ color: 'white' }}>{fmt(price)}/unlock</b>, Pico nets <b style={{ color: 'var(--success)' }}>{fmt(picoMonth)}/month</b> on this volume.</>
        )}
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.4 }}>
        Pico fee includes x402 facilitator cost (~£0.001 per transaction, currently subsidised on Base). Stripe shown as 1.5% + 20p UK card; PayPal 2.9% + 30p; Gumroad 10% + Stripe; Patreon 8% + 3.9% + 30p. Hidden costs (chargebacks, FX, payout delay) are not modelled — Pico has none.
      </div>
    </div>
  );
}

function NumberField({
  label, symbol, value, onChange, min, max, step,
}: {
  label: string; symbol?: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step: number;
}) {
  // Decimal keypad when the field holds money (£ symbol), integer-only otherwise.
  const mode: 'decimal' | 'numeric' = symbol ? 'decimal' : 'numeric';
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.35rem', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <div style={{ position: 'relative' }}>
        {symbol && (
          <span style={{
            position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '0.9rem',
          }}>{symbol}</span>
        )}
        <input
          type="number"
          inputMode={mode}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          min={min}
          max={max}
          step={step}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--card-border)',
            padding: symbol ? '0.7rem 0.9rem 0.7rem 2rem' : '0.7rem 0.9rem',
            borderRadius: '10px',
            color: 'white',
            fontSize: '0.95rem',
            outline: 'none',
          }}
        />
      </div>
    </label>
  );
}
