import Link from 'next/link';
import FeeCalculator from '@/components/FeeCalculator';
import RevenueCalculator from '@/components/RevenueCalculator';

export const metadata = {
  title: 'Pico for Publishers — Per-article micropayments for newsletters and journalism',
  description:
    'Charge £0.20–£5 per article. Keep 95%. Get paid instantly in your wallet. The micropayment paywall that works where Stripe cannot.',
};

const EMBED_SNIPPET = `<!-- Place where you want the paywall -->
<div class="pico-paywall"
     data-link-id="YOUR_PICO_LINK_ID"
     data-price="0.50"
     data-title="The full article"
     data-preview-selector="#article-body"
     data-preview-words="100">
</div>

<!-- Place once near </body> -->
<script src="https://pico.link/embed.js" async></script>`;

export default function PublishersPage() {
  return (
    <div className="animate-fade" style={{ paddingBottom: '4rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>
        <Link href="/signup" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', borderRadius: '10px', textDecoration: 'none' }}>
          Get started
        </Link>
      </nav>

      {/* Hero */}
      <header style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
          color: 'var(--accent)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
          padding: '0.3rem 0.7rem', borderRadius: '100px', marginBottom: '1.5rem',
        }}>
          BUILT ON x402 · THE INTERNET&apos;S PAYMENT STANDARD
        </div>
        <h1 className="text-gradient" style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1rem' }}>
          Sell your content for 20p. Keep 95%.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '580px', margin: '0 auto 2rem', lineHeight: 1.5 }}>
          The micropayment tool for writers, podcasters, and creators — sell single articles, prompts, or exclusive posts from <b style={{ color: 'white' }}>£0.20–£5</b> via Apple Pay or card. No subscription. No signup. Built on <b style={{ color: 'white' }}>x402</b>, the open HTTP payment protocol from Coinbase.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup"
             className="btn btn-primary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            Start selling — free
          </Link>
          <a href="#how" className="btn btn-secondary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            See how it works
          </a>
        </div>
      </header>

      {/* x402 differentiator */}
      <section className="glass" style={{
        padding: '1.5rem 1.75rem', marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.02) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
      }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: '0.5rem' }}>
          🤖 AGENT-READY PAYWALL
        </div>
        <h3 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>
          The first paywall AI agents can actually pay
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.55, margin: 0 }}>
          Stripe, Patreon, and Substack paywalls require a human to fill in a form. Pico speaks <b style={{ color: 'white' }}>HTTP 402 Payment Required</b> — the open standard backed by Coinbase, Cloudflare, AWS, and Stripe. That means <b style={{ color: 'white' }}>AI research agents, RSS readers, and machine-to-machine clients</b> can pay for your content automatically. As agentic browsing becomes the default, x402 paywalls earn revenue that subscription walls turn away.
        </p>
      </section>

      {/* The deal */}
      <section className="glass" style={{
        padding: '2rem', marginBottom: '2rem',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.02) 100%)',
        border: '1px solid rgba(16,185,129,0.25)',
      }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--success)', marginBottom: '0.5rem' }}>
          🎁 FOUNDING PUBLISHER OFFER
        </div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>0% Pico fee for the first 3 months</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '1.25rem' }}>
          We&apos;re onboarding our first 10 publishers personally. You get the standard 95% revenue share <b style={{ color: 'white' }}>plus</b> the platform fee waived for 3 months, plus a 30-minute integration call where we set up the embed for you on your WordPress / Ghost / Substack / Beehiiv / Webflow site.
        </p>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.7, paddingLeft: '1.25rem', marginBottom: 0 }}>
          <li>0% Pico platform fee for 90 days (normally 5% under £10)</li>
          <li>Free 30-min Zoom integration call</li>
          <li>Custom embed code with your colours / branding</li>
          <li>Direct WhatsApp/email support for the first week</li>
          <li>Featured as a launch partner when we go public</li>
        </ul>
      </section>

      {/* Why */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>Why Pico beats subscriptions for the £0.20–£5 tier</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <FeatureCard
            icon="💸"
            title="Stripe loses 42% on £0.50"
            body="Pico loses 5%. You actually keep what your readers pay."
          />
          <FeatureCard
            icon="⚡"
            title="Paid in 30 seconds"
            body="Stripe holds for 7 days. USDC hits your wallet instantly."
          />
          <FeatureCard
            icon="🛡️"
            title="Zero chargebacks"
            body="Blockchain payments are final. No £15 dispute fees, ever."
          />
          <FeatureCard
            icon="🌍"
            title="Global by default"
            body="No cross-border fees, no FX markup. Same price worldwide."
          />
          <FeatureCard
            icon="🪪"
            title="No reader signup"
            body="Apple Pay / card → FaceID. The word ‘crypto’ never appears."
          />
          <FeatureCard
            icon="📈"
            title="Free-tier monetisation"
            body="Convert the 99% of readers who&#39;d never subscribe."
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>How it works — 3 lines of HTML</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          Drop the embed into any article. It shows a preview, blurs the rest, and reveals the full content when the reader pays. Remembers unlocks per device so readers never pay twice.
        </p>
        <pre style={{
          background: 'rgba(0,0,0,0.4)', border: '1px solid var(--card-border)', borderRadius: '12px',
          padding: '1.25rem', fontSize: '0.75rem', lineHeight: 1.5, overflowX: 'auto',
          color: '#e7e7ea', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}>
{EMBED_SNIPPET}
        </pre>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '1.25rem' }}>
          <StepCard num="1" title="Create a link" body="Sign up, set the price (e.g. £0.50), get a link ID." />
          <StepCard num="2" title="Paste the embed" body="Two lines in your CMS. Works on WordPress, Ghost, Substack, Webflow." />
          <StepCard num="3" title="Reader unlocks" body="Apple Pay → instant unlock. They never see the paywall again." />
          <StepCard num="4" title="You get paid" body="USDC hits your wallet in 30 seconds. Withdraw to bank when ready." />
        </div>
      </section>

      {/* Revenue opportunity calculator — the bigger of the two */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>How much revenue is your free tier worth?</h2>
        <RevenueCalculator />
      </section>

      {/* Per-transaction fee calculator */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>How much do you keep per unlock?</h2>
        <FeeCalculator />
      </section>

      {/* What you get */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>What a £1 article actually pays you</h2>
        <div className="glass" style={{ padding: '1.5rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>Platform</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Reader pays</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>You keep</th>
              </tr>
            </thead>
            <tbody>
              <CompareRow plat="Stripe (UK card)" pays="£1.00" keep="£0.79" />
              <CompareRow plat="PayPal" pays="£1.00" keep="£0.67" />
              <CompareRow plat="Gumroad (10% + Stripe)" pays="£1.00" keep="£0.61" />
              <CompareRow plat="Patreon" pays="£1.00" keep="£0.59" />
              <CompareRow plat="Pico" pays="£1.00" keep="£0.95" highlight />
            </tbody>
          </table>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.4 }}>
            Stripe physically rejects most charges under £2. Pico has no minimum — you can sell single posts at £0.20 if you want.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>Questions publishers actually ask</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Faq q="Do my readers need a crypto wallet or an account?"
               a="No. Readers tap Pay, do FaceID/passkey, and pay with Apple Pay or card. We use Coinbase Smart Wallet under the hood — readers never see seed phrases or the word ‘crypto’." />
          <Faq q="What happens if Pico goes bust?"
               a="Your earnings are on-chain in a wallet only you control. Even if we disappear, your USDC and your reader base exist independently. You&#39;re never locked in." />
          <Faq q="How fast do I get paid?"
               a="Instantly. USDC settles to your wallet in 3 seconds. To convert USDC → GBP into your bank, the manual flow takes ~30 minutes via Coinbase. We&#39;re launching one-click bank cashout via Transak (0.99% fee, ~1 hour) once our production approval comes through." />
          <Faq q="What about chargebacks?"
               a="None. Blockchain payments are final. You&#39;ll never pay a £15 dispute fee again." />
          <Faq q="Does it work on WordPress / Ghost / Substack?"
               a="Yes — anywhere you can paste HTML. WordPress is one custom HTML block. Ghost is one code injection. Substack is more limited (their editor blocks scripts) but works in custom domain Ghost-style sites and their email-only newsletter sponsorships." />
          <Faq q="Is this legal in the UK?"
               a="Yes. Pico is a non-custodial software platform. The regulated bits — fiat onramp, KYC, sanctions — are handled by Transak (FCA #928910). You&#39;re selling digital content, we&#39;re a payment integration, your readers pay a regulated processor. Standard fintech architecture." />
          <Faq q="What about VAT?"
               a="Same as Stripe — you&#39;re responsible for VAT on your sales if you&#39;re VAT-registered. We don&#39;t change your tax obligations; we&#39;re a payment rail." />
        </div>
      </section>

      {/* CTA */}
      <section className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Be a founding publisher</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', maxWidth: '480px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
          We&apos;re hand-onboarding our first 10 publishers. Tell us about your newsletter / publication and we&apos;ll get you live this week with zero fee for the first 3 months.
        </p>
        <a href="mailto:hello@pico.link?subject=Pico%20founding%20publisher%20%E2%80%94%20%5Byour%20publication%5D&body=Hi%2C%0A%0AI%20publish%20%5Bname%5D%20with%20%5BX%5D%20readers%2C%20mostly%20about%20%5Btopic%5D.%20My%20current%20paywall%2Fmonetisation%20is%20%5BStripe%2FPatreon%2FNone%5D.%20I%27d%20like%20to%20try%20Pico%20for%20%5Buse%20case%5D.%0A%0ASite%3A%20%5Burl%5D%0AAvailable%3A%20%5Bdates%2Ftimes%5D%0A%0AThanks!"
           className="btn btn-primary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
          Email us to get started
        </a>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1rem' }}>
          Or sign up directly →{' '}
          <Link href="/signup" style={{ color: 'var(--accent)' }}>create a creator account</Link>
        </p>
      </section>

      <footer style={{ textAlign: 'center', marginTop: '3rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
        <p>© 2026 Pico Payments. Built on the <a href="https://www.x402.org" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>x402 protocol</a>, Coinbase Smart Wallet &amp; Base L2.</p>
        <p style={{ marginTop: '0.5rem' }}>
          Cryptoasset purchases facilitated by Transak Pty Ltd (FCA #928910). Cryptoassets are high-risk, unregulated investments — you may lose all the money you invest.
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="glass" style={{ padding: '1.25rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{body}</div>
    </div>
  );
}

function StepCard({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div style={{
      padding: '1rem', background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--card-border)', borderRadius: '12px',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '0.4rem' }}>STEP {num}</div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>{title}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{body}</div>
    </div>
  );
}

function CompareRow({ plat, pays, keep, highlight }: { plat: string; pays: string; keep: string; highlight?: boolean }) {
  return (
    <tr style={{ borderTop: '1px solid var(--card-border)' }}>
      <td style={{ padding: '0.6rem 0', fontWeight: highlight ? 700 : 400, color: highlight ? 'var(--success)' : 'inherit' }}>{plat}</td>
      <td style={{ padding: '0.6rem 0', textAlign: 'right', color: 'var(--text-muted)' }}>{pays}</td>
      <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: highlight ? 700 : 600, color: highlight ? 'var(--success)' : 'inherit' }}>{keep}</td>
    </tr>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="glass" style={{ padding: '1rem 1.25rem' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', listStyle: 'none' }}>
        {q}
      </summary>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '0.75rem' }}>
        {a}
      </p>
    </details>
  );
}
