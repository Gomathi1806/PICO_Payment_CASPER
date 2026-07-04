import React from 'react';

/**
 * Shared footer used on every entry-point page (home, signup, login,
 * dashboard). Names the regulated cryptoasset providers we route
 * through and includes the FCA-mandated risk warning so no Pico page
 * can be construed as a qualifying cryptoasset financial promotion
 * under Section 21 FSMA / PS23/6.
 *
 * `variant="compact"` shrinks the spacing for places where the footer
 * sits under a dense UI (the creator dashboard) rather than at the
 * end of a long marketing page.
 */
export default function LegalFooter({ variant = 'default' }: { variant?: 'default' | 'compact' }) {
  const compact = variant === 'compact';
  return (
    <footer
      style={{
        marginTop: compact ? '3rem' : '6rem',
        paddingTop: '2rem',
        paddingBottom: compact ? '2rem' : '4rem',
        borderTop: '1px solid var(--card-border)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        maxWidth: '640px',
        marginInline: 'auto',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
        Built on{' '}
        <a
          href="https://www.x402.org"
          target="_blank"
          rel="noopener"
          style={{ color: 'var(--accent)' }}
        >
          x402
        </a>{' '}
        · Settled on Base L2 · Coinbase Smart Wallet
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', margin: 0, lineHeight: 1.55 }}>
        © 2026 Pico Payments Ltd · Pico is a non-custodial software platform. Cryptoasset purchases are facilitated by Transak Pty Ltd (FCA #928910) and Ramp Network Limited (FCA #920097). Cryptoassets are high-risk, unregulated investments — you may lose all the money you invest.
      </p>
    </footer>
  );
}
