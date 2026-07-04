'use client';

import React, { useState } from 'react';
import { markPromosSettledManually } from '@/app/actions/settlement';

/**
 * Admin manual reconciliation — mark outstanding promo debts settled
 * after paying creators by hand (no treasury key required).
 */
export default function MarkSettledButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const handleMark = async () => {
    if (!window.confirm('Mark all outstanding free-unlock debts as PAID? Only do this after you have actually paid the creators.')) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await markPromosSettledManually();
      setOk(r.success);
      if (r.success) {
        setMsg(
          r.settledCount === 0
            ? 'Nothing outstanding to reconcile.'
            : `Marked ${r.settledCount} unlock(s) as settled.`,
        );
      } else {
        setMsg(r.error || 'Could not mark as settled.');
      }
    } catch {
      setOk(false);
      setMsg('Could not mark as settled.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleMark}
        disabled={busy}
        className="btn btn-secondary"
        style={{ padding: '0.6rem 1.1rem', fontSize: '0.8rem' }}
      >
        {busy ? 'Updating…' : '✓ Mark as settled (manual)'}
      </button>
      {msg && (
        <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: ok ? 'var(--success)' : '#f87171' }}>
          {ok ? '✓ ' : '⚠️ '}{msg}
        </div>
      )}
    </div>
  );
}
