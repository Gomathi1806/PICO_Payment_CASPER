'use client';

import React, { useEffect, useState, use } from 'react';
import { useAccount, useConnect } from 'wagmi';
import { getGiftCardInfo, redeemByCode } from '@/app/actions/giftcards';
import UnlockedContent from '@/components/UnlockedContent';
import LegalFooter from '@/components/LegalFooter';

/**
 * /claim/[code] — redeem a gift or giveaway voucher.
 *
 * The recipient connects a Coinbase Smart Wallet (FaceID), the voucher
 * is redeemed against the content it unlocks, and the gated content is
 * revealed. No payment — the voucher was already funded by whoever
 * created it (a fan or the creator).
 */
export default function ClaimPage(props: { params: Promise<{ code: string }> }) {
  const { code } = use(props.params);

  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getGiftCardInfo>> | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getGiftCardInfo(code);
      setInfo(res);
      setLoading(false);
    })();
  }, [code]);

  const handleClaim = async () => {
    setError(null);
    if (!isConnected) {
      const cb = connectors.find((c) => c.id === 'coinbaseWallet' || c.id === 'coinbaseWalletSDK');
      if (!cb) { setError('Wallet provider not found. Please refresh.'); return; }
      try { await connect({ connector: cb }); } catch { setError('Connection cancelled.'); }
      return;
    }
    if (!address || !info?.found || !info.linkId) return;

    setRedeeming(true);
    try {
      const res = await redeemByCode({ code, linkId: info.linkId, redeemerAddress: address });
      if (res.success) {
        setDone(true);
        setUnlockedUrl(res.contentUrl ?? null);
      } else {
        setError(res.error || 'Could not redeem this code.');
      }
    } catch {
      setError('Could not redeem this code.');
    } finally {
      setRedeeming(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading your gift…</div>;

  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginBottom: '2.5rem', marginTop: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 800 }}>Pico.</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          You&apos;ve been gifted an unlock 🎁
        </p>
      </header>

      <div className="glass" style={{ padding: '2rem', textAlign: 'center', maxWidth: '460px', margin: '0 auto' }}>
        {!info?.found ? (
          <p style={{ color: '#f87171' }}>This gift code doesn&apos;t exist.</p>
        ) : info.status !== 'active' && !done ? (
          <p style={{ color: '#fbbf24' }}>This gift has already been fully used.</p>
        ) : !info.linkId ? (
          <p style={{ color: 'var(--text-muted)' }}>
            This is a creator-wide gift. Open any of the creator&apos;s Pico links to use it.
          </p>
        ) : done ? (
          <div style={{ color: 'var(--success)' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
            <h3 style={{ marginBottom: '0.5rem' }}>Unlocked!</h3>
            {unlockedUrl ? (
              <UnlockedContent url={unlockedUrl} linkId={info.linkId} linkTitle={info.link?.title || 'Your content'} />
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fetching your content…</p>
            )}
          </div>
        ) : (
          <>
            <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent)', letterSpacing: '0.1em', marginBottom: '0.75rem' }}>
              {info.link?.type || 'DIGITAL CONTENT'}
            </div>
            <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>{info.link?.title || 'Gifted content'}</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Someone unlocked this for you — claim it free, no payment needed.
            </p>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '0.7rem 1rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#f87171' }}>
                ⚠️ {error}
              </div>
            )}
            <button
              onClick={handleClaim}
              disabled={redeeming}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem' }}
            >
              {redeeming ? 'Unlocking…' : isConnected ? '🎁 Claim my gift' : '🎁 Claim with FaceID'}
            </button>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
              🔐 Secured by Coinbase Smart Wallet — no seed phrase
            </p>
          </>
        )}
      </div>

      <LegalFooter variant="compact" />
    </div>
  );
}
