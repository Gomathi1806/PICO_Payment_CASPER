import Link from 'next/link';
import FeeCalculator from '@/components/FeeCalculator';
import RevenueCalculator from '@/components/RevenueCalculator';

export const metadata = {
  title: 'Pico for Newsrooms — Per-article payments for journalism',
  description:
    'A reader-supported paywall built on x402, the internet\'s payment standard. Sell single articles. Keep 95%. Settle instantly. No subscription wall, no chargebacks.',
};

const EMBED_SNIPPET = `<!-- One block where you want the paywall -->
<div class="pico-paywall"
     data-variant="editorial"
     data-publication="The Daily Ledger"
     data-link-id="YOUR_PICO_LINK_ID"
     data-price="0.20"
     data-title="The full article"
     data-preview-selector="#article-body"
     data-preview-words="120">
</div>

<!-- Once, near </body> -->
<script src="https://pico.link/embed.js" async></script>`;

// Editorial palette: warm off-white, deep ink, restrained accents.
// No emojis in copy, serif body, sans-serif eyebrow labels.
const editorialBg = '#f8f5ee';
const editorialInk = '#0b0b0d';
const editorialMuted = '#3f3f46';
const editorialRule = '#1f2937';

export default function PrintPublishersPage() {
  return (
    <div
      style={{
        background: editorialBg,
        color: editorialInk,
        minHeight: '100vh',
        margin: '-2rem',
        padding: '2rem',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      {/* Masthead */}
      <nav
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: `2px solid ${editorialRule}`,
          paddingBottom: '0.75rem',
          marginBottom: '2.5rem',
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            textDecoration: 'none',
            color: editorialInk,
            fontFamily: 'Georgia, serif',
            letterSpacing: '-0.01em',
          }}
        >
          Pico for Newsrooms
        </Link>
        <Link
          href="/publishers"
          style={{
            fontSize: '0.75rem',
            color: editorialMuted,
            textDecoration: 'underline',
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          Creator version →
        </Link>
      </nav>

      {/* Hero — newspaper headline */}
      <header style={{ maxWidth: '720px', marginBottom: '3rem' }}>
        <Eyebrow>Founded 2026 · Built on the x402 protocol</Eyebrow>
        <h1
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '3rem',
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: '0 0 1.25rem',
            color: editorialInk,
          }}
        >
          A paywall worthy of a newspaper.
        </h1>
        <p
          style={{
            fontSize: '1.25rem',
            lineHeight: 1.45,
            color: editorialMuted,
            margin: '0 0 1.75rem',
            maxWidth: '600px',
          }}
        >
          Pico is a reader-supported micropayment paywall for journalism. Readers pay <b style={{ color: editorialInk }}>20p or 50p to read one article</b> — no subscription, no sign-up, no chargebacks. You keep 95% of every payment, settled in seconds.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <a
            href="mailto:newsrooms@pico.link?subject=Pico%20for%20our%20newsroom"
            style={{
              display: 'inline-block',
              background: editorialInk,
              color: editorialBg,
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '0.85rem 1.75rem',
              borderRadius: '2px',
              textDecoration: 'none',
            }}
          >
            Request a pilot →
          </a>
          <a
            href="#how"
            style={{
              display: 'inline-block',
              border: `1px solid ${editorialInk}`,
              color: editorialInk,
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '0.85rem 1.75rem',
              borderRadius: '2px',
              textDecoration: 'none',
            }}
          >
            See it on a real article
          </a>
        </div>
      </header>

      {/* Why-this-now editorial */}
      <section
        style={{
          borderTop: `1px solid ${editorialRule}`,
          borderBottom: `1px solid ${editorialRule}`,
          padding: '2rem 0',
          marginBottom: '3rem',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '2rem',
            maxWidth: '900px',
          }}
        >
          <Column
            heading="The subscription wall is broken."
            body="Ninety-nine percent of your readers will never become subscribers. They are not the enemy. They are revenue you have decided to refuse."
          />
          <Column
            heading="Stripe cannot do 20p."
            body="Card processor minimums mean a 50p charge loses you 42% to fees, if it clears at all. Micropayments require different rails."
          />
          <Column
            heading="x402 is those rails."
            body="An open protocol pioneered by Coinbase and Cloudflare, x402 settles single-article payments in USDC on Base for less than a tenth of a penny in fees."
          />
        </div>
      </section>

      {/* What readers see */}
      <section style={{ maxWidth: '720px', marginBottom: '3rem' }}>
        <Eyebrow>What your readers see</Eyebrow>
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 1rem',
            color: editorialInk,
          }}
        >
          A calm card — not a popup, not a paywall scream.
        </h2>
        <p
          style={{
            fontSize: '1rem',
            lineHeight: 1.55,
            color: editorialMuted,
            marginBottom: '1.75rem',
          }}
        >
          The editorial variant of our embed sits inside your article. Serif type. Newsroom palette. No emoji. No flashing CTAs. It looks like part of the publication — because for readers, it is.
        </p>

        {/* Mock paywall card — preview of what publishers will get */}
        <div
          style={{
            background: '#fff',
            border: `1px solid #d1d5db`,
            borderTop: `3px solid ${editorialInk}`,
            padding: '1.75rem 2rem',
            maxWidth: '560px',
            marginBottom: '1rem',
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
              marginBottom: '0.75rem',
            }}
          >
            The Daily Ledger
          </div>
          <h3
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: '1.4rem',
              fontWeight: 700,
              margin: '0 0 0.6rem',
              color: editorialInk,
              lineHeight: 1.25,
            }}
          >
            Continue reading
          </h3>
          <p
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: '0.95rem',
              lineHeight: 1.5,
              color: '#4b5563',
              margin: '0 0 1.25rem',
            }}
          >
            This article costs 20p to unlock. Pay once — no subscription, no sign-up. Continue reading in under five seconds.
          </p>
          <span
            style={{
              display: 'inline-block',
              background: editorialInk,
              color: '#fff',
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.85rem',
              fontWeight: 600,
              padding: '0.7rem 1.5rem',
              borderRadius: '2px',
            }}
          >
            Continue reading — £0.20
          </span>
          <p
            style={{
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.65rem',
              color: '#9ca3af',
              marginTop: '1rem',
              marginBottom: 0,
            }}
          >
            Powered by Pico · Settled via x402 protocol on Base
          </p>
        </div>
        <p style={{ fontSize: '0.8rem', color: editorialMuted, marginTop: '0.5rem' }}>
          ↑ This is rendered by your `&lt;script&gt;` tag. It costs you nothing to include.
        </p>
      </section>

      {/* Snippet */}
      <section id="how" style={{ marginBottom: '3rem' }}>
        <Eyebrow>The integration</Eyebrow>
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 0.75rem',
            color: editorialInk,
          }}
        >
          Two snippets. Total install time: under five minutes.
        </h2>
        <p style={{ fontSize: '1rem', lineHeight: 1.55, color: editorialMuted, marginBottom: '1.25rem' }}>
          The same snippet works on WordPress, Ghost, Drupal, and any modern CMS that allows HTML. We&apos;ll personally help you install it on the first article.
        </p>
        <pre
          style={{
            background: '#fff',
            border: `1px solid #d1d5db`,
            padding: '1.25rem',
            fontSize: '0.78rem',
            lineHeight: 1.55,
            overflowX: 'auto',
            color: editorialInk,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            borderRadius: '2px',
          }}
        >
{EMBED_SNIPPET}
        </pre>
      </section>

      {/* Comparison table — newsroom-specific */}
      <section style={{ marginBottom: '3rem' }}>
        <Eyebrow>The numbers</Eyebrow>
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 1rem',
            color: editorialInk,
          }}
        >
          What 100,000 monthly readers actually look like.
        </h2>
        <div
          style={{
            background: '#fff',
            border: `1px solid #d1d5db`,
            padding: '1.5rem',
            borderRadius: '2px',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ color: editorialMuted, fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase', fontFamily: '-apple-system, sans-serif' }}>
                <th style={{ textAlign: 'left', padding: '0.6rem 0', fontWeight: 600 }}>Model</th>
                <th style={{ textAlign: 'right', padding: '0.6rem 0', fontWeight: 600 }}>Reader conversion</th>
                <th style={{ textAlign: 'right', padding: '0.6rem 0', fontWeight: 600 }}>Monthly revenue</th>
              </tr>
            </thead>
            <tbody style={{ color: editorialInk }}>
              <ComparisonRow plat="£5/mo subscription" conv="1%" rev="£5,000 (gross)" rule={editorialRule} />
              <ComparisonRow plat="£5/mo + Stripe fees" conv="1%" rev="£4,710 net" rule={editorialRule} />
              <ComparisonRow plat="Pico per-article (20p, 4 articles)" conv="20%" rev="£16,000 net" highlight rule={editorialRule} />
            </tbody>
          </table>
          <p style={{ fontSize: '0.75rem', color: editorialMuted, marginTop: '0.75rem', lineHeight: 1.5 }}>
            Per-article micropayments convert 20× more readers because there is no commitment. They keep paying because each individual decision is trivial. The model has been a holy grail for newspapers since 1996. x402 is what finally makes it economically viable.
          </p>
        </div>
      </section>

      {/* Revenue opportunity — the main calculator for newsroom audience */}
      <section style={{ marginBottom: '3rem' }}>
        <Eyebrow>The opportunity</Eyebrow>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem', color: editorialInk }}>
          What your 99% of non-subscribers are worth.
        </h2>
        <p style={{ fontSize: '1rem', lineHeight: 1.55, color: editorialMuted, marginBottom: '1.25rem', maxWidth: '640px' }}>
          Plug in your monthly traffic. The calculator estimates how many articles each visitor reads, then compares your current subscription revenue with what Pico would capture at three pay-per-article conversion scenarios.
        </p>
        <div style={{ background: editorialInk, padding: '1.25rem', borderRadius: '2px', color: editorialBg }}>
          <RevenueCalculator />
        </div>
      </section>

      {/* Per-unlock fee calculator — supporting detail */}
      <section style={{ marginBottom: '3rem' }}>
        <Eyebrow>Per-unlock economics</Eyebrow>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', fontWeight: 700, margin: '0 0 1rem', color: editorialInk }}>
          What 20p × your readership pays you per month.
        </h2>
        <div style={{ background: editorialInk, padding: '1.25rem', borderRadius: '2px', color: editorialBg }}>
          <FeeCalculator />
        </div>
      </section>

      {/* Pilot offer */}
      <section
        style={{
          background: editorialInk,
          color: editorialBg,
          padding: '2.5rem',
          borderRadius: '2px',
          marginBottom: '3rem',
        }}
      >
        <Eyebrow muted="#a1a1aa">A founding-newsroom offer</Eyebrow>
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 1rem',
            color: editorialBg,
            maxWidth: '640px',
          }}
        >
          We&apos;re running pilots with five newsrooms in Q3.
        </h2>
        <p style={{ fontSize: '1rem', lineHeight: 1.55, color: '#d4d4d8', marginBottom: '1.5rem', maxWidth: '600px' }}>
          Zero Pico fee for the first three months. Free integration call. Direct line to the founder for the first week. We&apos;re looking for one local UK title, one specialist trade publication, and three independent journalists or Substacks with at least 1,000 readers.
        </p>
        <a
          href="mailto:newsrooms@pico.link?subject=Pilot%20interest%20%E2%80%94%20%5Bpublication%5D&body=Publication%3A%20%5B%5D%0AAudience%20size%3A%20%5B%5D%0ACurrent%20monetisation%3A%20%5B%5D%0AWhy%20Pico%3A%20%5B%5D"
          style={{
            display: 'inline-block',
            background: editorialBg,
            color: editorialInk,
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.9rem',
            fontWeight: 600,
            padding: '0.85rem 1.75rem',
            borderRadius: '2px',
            textDecoration: 'none',
          }}
        >
          Apply for the pilot
        </a>
      </section>

      <footer
        style={{
          borderTop: `1px solid ${editorialRule}`,
          paddingTop: '1.5rem',
          fontSize: '0.75rem',
          color: editorialMuted,
          fontFamily: '-apple-system, sans-serif',
        }}
      >
        <p style={{ margin: 0 }}>
          © 2026 Pico Payments. Built on the <a href="https://www.x402.org" target="_blank" rel="noopener" style={{ color: editorialInk }}>x402 protocol</a> · Settled on Base L2 · Compliant cryptoasset onramp by Transak (FCA #928910).
        </p>
      </footer>
    </div>
  );
}

function Eyebrow({ children, muted }: { children: React.ReactNode; muted?: string }) {
  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '0.7rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: muted || '#6b7280',
        fontWeight: 600,
        marginBottom: '0.85rem',
      }}
    >
      {children}
    </div>
  );
}

function Column({ heading, body }: { heading: string; body: string }) {
  return (
    <div>
      <h3
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: '1.05rem',
          fontWeight: 700,
          margin: '0 0 0.5rem',
          lineHeight: 1.3,
        }}
      >
        {heading}
      </h3>
      <p
        style={{
          fontSize: '0.92rem',
          lineHeight: 1.55,
          color: '#3f3f46',
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function ComparisonRow({ plat, conv, rev, highlight, rule }: { plat: string; conv: string; rev: string; highlight?: boolean; rule: string }) {
  return (
    <tr style={{ borderTop: `1px solid ${rule}` }}>
      <td style={{ padding: '0.75rem 0', fontWeight: highlight ? 700 : 400 }}>{plat}</td>
      <td style={{ padding: '0.75rem 0', textAlign: 'right' }}>{conv}</td>
      <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: highlight ? 700 : 600 }}>{rev}</td>
    </tr>
  );
}
