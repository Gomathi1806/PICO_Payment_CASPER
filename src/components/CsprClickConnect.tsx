'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCsprClick } from '@/components/csprclick/CsprClickProvider';
import { saveCasperPublicKey } from '@/app/actions/casper';

/**
 * Creator-side onboarding through CSPR.click: sign in with Google, Apple
 * or a Casper wallet, and buy CSPR with a card — no browser extension and
 * no seed phrase.
 *
 * Signing in hands us the creator's public key, which is the one thing
 * Pico needs to pay them, so we save it straight to their profile instead
 * of asking them to paste it.
 *
 * Renders nothing when CSPR.click has no app id configured, so the
 * dashboard's existing paste-your-key field stays the only path.
 */
export default function CsprClickConnect({
  userId,
  savedKey,
  onKeySaved,
}: {
  userId: string;
  savedKey: string | null;
  onKeySaved?: (publicKey: string) => void;
}) {
  const { clickRef, publicKey, enabled, ready } = useCsprClick();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef<string | null>(savedKey);

  // Persist the key as soon as CSPR.click reports an account, unless it is
  // already the one on file.
  useEffect(() => {
    if (!userId || !publicKey || publicKey === lastSaved.current) return;

    let cancelled = false;
    setStatus('saving');
    setError(null);

    saveCasperPublicKey(userId, publicKey)
      .then((result) => {
        if (cancelled) return;
        if (result?.success) {
          lastSaved.current = publicKey;
          setStatus('saved');
          onKeySaved?.(publicKey);
        } else {
          setStatus('error');
          setError(result?.error || 'Could not save this key.');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        setError('Could not save this key.');
      });

    return () => { cancelled = true; };
  }, [publicKey, userId, onKeySaved]);

  if (!enabled) return null;

  const short = (key: string) => `${key.slice(0, 8)}...${key.slice(-6)}`;

  return (
    <div style={{ marginTop: '1rem' }}>
      {publicKey ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Signed in with CSPR.click as{' '}
            <span style={{ color: 'var(--text)', fontFamily: 'monospace' }}>{short(publicKey)}</span>
            {status === 'saving' && ' — saving…'}
            {status === 'saved' && ' — saved as your payout key'}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => clickRef?.showBuyCsprUi()}
              disabled={!ready}
            >
              💳 Buy CSPR with a card
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => clickRef?.signOut()}
              disabled={!ready}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => clickRef?.signIn()}
          disabled={!ready}
          style={{ width: '100%' }}
        >
          {ready ? '🔑 Sign in with CSPR.click — Google, Apple or a wallet' : 'Loading CSPR.click…'}
        </button>
      )}

      {error && (
        <p style={{ color: 'var(--accent)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</p>
      )}
    </div>
  );
}
