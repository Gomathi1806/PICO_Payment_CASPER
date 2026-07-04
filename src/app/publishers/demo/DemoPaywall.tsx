'use client';

import React, { useState } from 'react';

interface Props {
  gatedParagraphs: string[];
}

/**
 * Demo-only version of the editorial paywall — identical look to what
 * the real embed.js renders for newsroom publishers, but the unlock
 * button reveals the gated paragraphs locally without touching the
 * payment endpoint. Lets prospects feel the UX without us needing to
 * seed a real Pico link with a real creator wallet just for the demo.
 */
export default function DemoPaywall({ gatedParagraphs }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [opening, setOpening] = useState(false);

  if (unlocked) {
    return (
      <>
        <div
          style={{
            margin: '1.5rem 0',
            padding: '0.5rem 0.85rem',
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '2px',
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.75rem',
            color: '#047857',
          }}
        >
          ✓ Unlocked for £0.20 · settled via x402 protocol on Base · demo mode
        </div>
        <div style={{ fontSize: '1.1rem', lineHeight: 1.65, color: '#1f2937' }}>
          {gatedParagraphs.map((p, i) => (
            <p key={i} style={{ margin: '0 0 1.3rem' }}>{p}</p>
          ))}
        </div>
      </>
    );
  }

  const handleUnlock = () => {
    setOpening(true);
    // Simulate the popup latency — real flow is ~3s from Apple Pay
    // confirmation to USDC settlement on Base.
    setTimeout(() => {
      setUnlocked(true);
      setOpening(false);
    }, 1200);
  };

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #d1d5db',
        borderTop: '3px solid #0b0b0d',
        padding: '1.85rem 2.1rem',
        maxWidth: '560px',
        margin: '2rem auto',
      }}
    >
      <div
        style={{
          fontFamily: '-apple-system, sans-serif',
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: '#6b7280',
          fontWeight: 600,
          marginBottom: '0.85rem',
        }}
      >
        The Daily Ledger
      </div>
      <h3
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '1.55rem',
          fontWeight: 700,
          margin: '0 0 0.7rem',
          color: '#0b0b0d',
          lineHeight: 1.2,
        }}
      >
        Continue reading
      </h3>
      <p
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '1rem',
          lineHeight: 1.55,
          color: '#4b5563',
          margin: '0 0 1.5rem',
        }}
      >
        This article costs 20p to unlock. Pay once — no subscription, no sign-up. Continue reading in under five seconds.
      </p>
      <button
        type="button"
        onClick={handleUnlock}
        disabled={opening}
        style={{
          background: '#0b0b0d',
          color: '#fff',
          fontFamily: '-apple-system, sans-serif',
          fontSize: '0.92rem',
          fontWeight: 600,
          padding: '0.85rem 1.85rem',
          border: 0,
          borderRadius: '2px',
          cursor: opening ? 'wait' : 'pointer',
          opacity: opening ? 0.7 : 1,
        }}
      >
        {opening ? 'Settling on Base…' : 'Continue reading — £0.20'}
      </button>
      <p
        style={{
          fontFamily: '-apple-system, sans-serif',
          fontSize: '0.7rem',
          color: '#9ca3af',
          margin: '1.1rem 0 0',
        }}
      >
        Powered by Pico · Settled via x402 protocol on Base
      </p>
      <p
        style={{
          fontFamily: '-apple-system, sans-serif',
          fontSize: '0.65rem',
          color: '#a16207',
          margin: '0.5rem 0 0',
          fontStyle: 'italic',
        }}
      >
        Demo mode: no real payment is taken. Click the button to see the unlock animation.
      </p>
    </div>
  );
}
