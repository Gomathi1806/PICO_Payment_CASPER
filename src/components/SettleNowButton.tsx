'use client';

import React, { useState } from 'react';
import { settleCreatorPromos } from '@/app/actions/settlement';

/** Admin-only manual trigger for the creator settlement job. */
export default function SettleNowButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleSettle = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await settleCreatorPromos();
      setOk(r.success);
      if (r.success) {
        setMsg(
          r.settledCount === 0
            ? 'Nothing outstanding — all creators are already paid.'
            : `Settled ${r.settledCount} unlock(s) · paid ${r.paidCreators} creator(s) · $${r.totalUsdc} USDC.`,
        );
      } else {
        setMsg(r.error || 'Settlement failed.');
      }
    } catch {
      setOk(false);
      setMsg('Settlement failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSettle}
        disabled={busy}
        className="btn btn-primary"
        style={{ padding: '0.6rem 1.1rem', fontSize: '0.8rem' }}
      >
        {busy ? 'Settling…' : '💸 Settle creators now'}
      </button>
      {msg && (
        <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: ok ? 'var(--success)' : '#f87171' }}>
          {ok ? '✓ ' : '⚠️ '}{msg}
        </div>
      )}
    </div>
  );
}
