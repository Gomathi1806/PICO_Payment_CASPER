import Link from 'next/link';
import RevenueCalculator from '@/components/RevenueCalculator';

export const metadata = {
  title: 'Pico Revenue Estimator — How much is your free tier worth?',
  description:
    '99% of your readers will never subscribe. Plug in your monthly visitors and average time-on-site to see how much per-article micropayment revenue you are leaving on the table.',
};

export default function RevenueEstimatorPage() {
  return (
    <div className="animate-fade" style={{ paddingBottom: '4rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Link href="/publishers" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Creator pitch
          </Link>
          <Link href="/publishers/print" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Newsroom pitch
          </Link>
          <Link href="/publishers/demo" style={{ fontSize: '0.78rem', color: 'var(--accent)', textDecoration: 'underline' }}>
            Demo article →
          </Link>
        </div>
      </nav>

      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
          color: 'var(--success)', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
          padding: '0.3rem 0.7rem', borderRadius: '100px', marginBottom: '1.25rem',
        }}>
          REVENUE ESTIMATOR · 30 SECONDS · NO SIGN-UP
        </div>
        <h1 className="text-gradient" style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '0.9rem' }}>
          How much revenue is your free tier worth?
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto', lineHeight: 1.5 }}>
          99% of your visitors will never subscribe. Pico turns those visits into per-article micropayments — built on x402, the open HTTP payment protocol. Plug in your numbers to see the gap.
        </p>
      </header>

      <RevenueCalculator />

      {/* What this means + CTA */}
      <section style={{ marginTop: '2rem' }}>
        <div className="glass" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>Like the numbers? See it on a real article.</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
            The demo article shows exactly what your readers experience — the editorial paywall, the unlock flow, the inline reveal. Three minutes of your time, no sign-up.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/publishers/demo" className="btn btn-primary" style={{ padding: '0.8rem 1.4rem', fontSize: '0.85rem', textDecoration: 'none' }}>
              Try the demo article →
            </Link>
            <a
              href="mailto:newsrooms@pico.link?subject=Pico%20revenue%20estimator%20%E2%80%94%20%5Bpublication%5D"
              className="btn btn-secondary"
              style={{ padding: '0.8rem 1.4rem', fontSize: '0.85rem', textDecoration: 'none' }}
            >
              Email us to discuss
            </a>
          </div>
        </div>
      </section>

      <footer style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <p>
          Built on the <a href="https://www.x402.org" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>x402 protocol</a> · USDC on Base L2 · Compliant cryptoasset onramp via Transak (FCA #928910).
        </p>
      </footer>
    </div>
  );
}
