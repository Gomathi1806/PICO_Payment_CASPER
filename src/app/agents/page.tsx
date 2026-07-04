'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LegalFooter from '@/components/LegalFooter';
import { getUserById } from '@/app/actions/auth';

/**
 * /agents — the developer & agentic-platform dashboard.
 *
 * Aimed at companies and devs building software that needs to pay
 * for content via x402. Different audience from creators / publishers
 * — these users care about API keys, rate limits, webhook config,
 * and integration docs.
 *
 * Backend for these features doesn't exist yet (no apiKeys table,
 * no usage table, no webhook delivery). This page is a structural
 * shell that lays out the IA, shows quickstart code, and explains
 * the timeline honestly so first agent-builders can self-onboard
 * via the existing /api/content/[id] x402 endpoint while we build
 * the developer-platform features around it.
 */
export default function AgentsDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>('');

  const userId = session?.user?.id;

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const user = await getUserById(userId);
      if (user.success && user.user) setHandle(user.user.handle);
      setLoading(false);
    })();
  }, [userId]);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (status === 'loading' || loading) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading developer console…</div>;
  }
  if (!userId) {
    router.replace('/login');
    return null;
  }

  const quickstartFetch = `import { wrapFetchWithPayment } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';

// Your agent wallet. In production, use a hosted wallet / KMS.
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

// Same call as any HTTP request — payment happens automatically on 402.
const res = await fetchWithPayment('${origin || 'https://pico.link'}/api/content/<linkId>');
const { contentUrl, title } = await res.json();`;

  const quickstartCurl = `# Step 1 — see the payment requirements
curl -i ${origin || 'https://pico.link'}/api/content/<linkId>

# Step 2 — pay + retry (handled by any x402-aware client)
# Manual signing is possible but you'll want x402-fetch.`;

  return (
    <div className="animate-fade">
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
        <div>
          <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
            Pico.
          </Link>
          <span style={{
            marginLeft: '0.75rem',
            padding: '0.2rem 0.55rem',
            background: 'rgba(168,85,247,0.12)',
            color: '#d8b4fe',
            border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: '100px',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>Developer</span>
        </div>
        <div onClick={handleLogout} className="glass" style={{
          padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
        }} title="Click to log out">
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
          {handle ? `@${handle}` : 'Account'}
        </div>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Developer console</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
          Pay for paywalled content automatically from agentic apps using the x402 HTTP standard.
          Same protocol Coinbase, Cloudflare, AWS, and Stripe are converging on.
        </p>
      </header>

      {/* Quickstart — the most important thing on the page */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.4rem' }}>Quickstart</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Hit any Pico content endpoint and your agent gets back HTTP 402 with the price.
          Sign once, retry, get content. Works today.
        </p>

        <CodeBlock label="Node / Browser — @x402/fetch" code={quickstartFetch} />
        <div style={{ height: '0.85rem' }} />
        <CodeBlock label="curl — to see the protocol" code={quickstartCurl} />

        <div style={{
          marginTop: '1rem',
          padding: '0.7rem 0.9rem',
          background: 'rgba(99,102,241,0.07)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: '8px',
          fontSize: '0.72rem',
          color: '#a5b4fc',
          lineHeight: 1.5,
        }}>
          💡 Today, every authenticated x402 client can pay any Pico endpoint without registration.
          Per-developer API keys, usage analytics, and webhook deliveries are below — pending build.
        </div>
      </section>

      {/* Developer-platform features — roadmap */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.85rem' }}>Developer platform — coming soon</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <RoadmapCard icon="🔑" title="API keys" body="Per-app keys for rate limiting, attribution, and usage caps." status="Q3" />
          <RoadmapCard icon="📈" title="Usage analytics" body="Requests, settlements, gas, latency — per key and per endpoint." status="Q3" />
          <RoadmapCard icon="🪝" title="Webhooks" body="Real-time delivery of payment + settlement events to your backend." status="Q4" />
          <RoadmapCard icon="🧪" title="Sandbox / test mode" body="Free, no-real-money x402 settlements for CI and local dev." status="Q4" />
        </div>
      </section>

      {/* Why x402 — micro pitch for developers */}
      <section className="glass" style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.01) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
      }}>
        <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem' }}>Why your agent should speak x402</h2>
        <ul style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.65, paddingLeft: '1.25rem', margin: 0 }}>
          <li><b style={{ color: 'white' }}>Open HTTP protocol.</b> No SDK lock-in — any HTTP client with a wallet can pay any endpoint.</li>
          <li><b style={{ color: 'white' }}>Per-request pricing.</b> Charge fractions of a cent per call without subscription overhead.</li>
          <li><b style={{ color: 'white' }}>Wallet-native auth.</b> Cryptographic proof of payment replaces API keys + invoicing.</li>
          <li><b style={{ color: 'white' }}>Backed by the right people.</b> Coinbase, Cloudflare, AWS, Stripe — same standard, different implementations.</li>
          <li><b style={{ color: 'white' }}>Works for humans too.</b> Browsers with x402-aware wallets can pay the same endpoints — no two payment systems to maintain.</li>
        </ul>
      </section>

      <LegalFooter variant="compact" />
    </div>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
        {label}
      </div>
      <pre style={{
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid var(--card-border)',
        borderRadius: '10px',
        padding: '0.9rem 1rem',
        fontSize: '0.72rem',
        lineHeight: 1.55,
        color: '#e7e7ea',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        overflowX: 'auto',
        margin: 0,
      }}>
{code}
      </pre>
    </div>
  );
}

function RoadmapCard({ icon, title, body, status }: { icon: string; title: string; body: string; status: string }) {
  return (
    <div className="glass" style={{ padding: '1.1rem 1.25rem', opacity: 0.85 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'rgba(59,130,246,0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', letterSpacing: '0.05em' }}>
          {status}
        </span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.3rem' }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{body}</div>
    </div>
  );
}
