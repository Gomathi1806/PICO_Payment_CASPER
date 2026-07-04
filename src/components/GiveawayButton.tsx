'use client';

import React, { useState } from 'react';
import { createGiveaway } from '@/app/actions/giftcards';

/**
 * Creator-facing "give away free unlocks of my own content" button.
 * Generates a shareable /claim/<code> link redeemable `quantity` times
 * (once per wallet). No money moves — the creator forgoes revenue.
 */
export default function GiveawayButton({ linkId, creatorId }: { linkId: string; creatorId: string }) {
  const [busy, setBusy] = useState(false);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const res = await createGiveaway({ creatorId, linkId, quantity: 10 });
      if (res.success && res.claimUrl) {
        const full = `${window.location.origin}${res.claimUrl}`;
        setClaimUrl(full);
        try {
          await navigator.clipboard.writeText(full);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard blocked — URL still shown */ }
      }
    } finally {
      setBusy(false);
    }
  };

  if (claimUrl) {
    return (
      <button
        className="btn btn-secondary"
        style={{ padding: '0.5rem 0.6rem', fontSize: '0.72rem', borderRadius: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => { navigator.clipboard?.writeText(claimUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        title={claimUrl}
      >
        {copied ? '✓ Copied gift link' : '🎁 Copy gift link (×10)'}
      </button>
    );
  }

  return (
    <button
      className="btn btn-secondary"
      style={{ padding: '0.5rem 0.6rem', fontSize: '0.72rem', borderRadius: '10px', whiteSpace: 'nowrap' }}
      onClick={handleGenerate}
      disabled={busy}
      title="Generate 10 free unlocks to give away"
    >
      {busy ? 'Creating…' : '🎁 Give away'}
    </button>
  );
}
