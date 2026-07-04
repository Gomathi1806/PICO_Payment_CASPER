import Link from 'next/link';
import LegalFooter from '@/components/LegalFooter';

export const metadata = {
  title: 'Pico for Developers — Pay paywalls from agentic apps via x402',
  description:
    'Your AI agent, scraper, or backend can pay any Pico paywall automatically via the x402 HTTP protocol. Per-call pricing, on-chain settlement, no API keys to manage.',
};

const QUICKSTART_FETCH = `import { wrapFetchWithPayment } from '@x402/fetch';
import { privateKeyToAccount } from 'viem/accounts';

// One agent wallet, one line of wrapper. Done.
const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY);
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

// Hit any Pico content URL — payment happens automatically on 402.
const res = await fetchWithPayment('https://pico.link/api/content/abc-123');
const { contentUrl, title } = await res.json();`;

const CURL_PROOF = `# A bare curl shows you the 402 challenge — no signing required to peek.
$ curl -i https://pico.link/api/content/abc-123

HTTP/1.1 402 Payment Required
content-type: application/json
www-authenticate: x402

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "price": "$0.20",
    "payTo": "0x...",
    "description": "Unlock: The full article"
  }]
}`;

export default function ForDevelopersPage() {
  return (
    <div className="animate-fade" style={{ paddingBottom: '4rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/publishers" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'underline' }}>
            Publishers
          </Link>
          <Link href="/signup" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.78rem', borderRadius: '10px', textDecoration: 'none' }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{
          display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
          color: '#a5b4fc', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
          padding: '0.3rem 0.7rem', borderRadius: '100px', marginBottom: '1.5rem',
        }}>
          BUILT ON x402 · THE INTERNET&apos;S PAYMENT STANDARD
        </div>
        <h1 className="text-gradient" style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1rem' }}>
          The paywall your agent can pay.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '620px', margin: '0 auto 2rem', lineHeight: 1.5 }}>
          Pico paywalls speak <b style={{ color: 'white' }}>HTTP 402</b>. Your agent hits a URL, gets back a structured price, signs once, retries with proof of payment. Same protocol Coinbase, Cloudflare, AWS, and Stripe are converging on. <b style={{ color: 'white' }}>No API keys to manage, no per-vendor SDKs.</b>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn btn-primary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            Get an agent account →
          </Link>
          <a href="#quickstart" className="btn btn-secondary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            See the code
          </a>
        </div>
      </header>

      {/* Quickstart */}
      <section id="quickstart" style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Quickstart — two snippets</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.25rem', lineHeight: 1.5 }}>
          The first shows what your agent sees when it&apos;s built right. The second is the protocol underneath — a plain curl so you can see the price tag in JSON before writing any code.
        </p>

        <CodeCard label="@x402/fetch — Node or browser" code={QUICKSTART_FETCH} />
        <div style={{ height: '1rem' }} />
        <CodeCard label="curl — see the 402 challenge" code={CURL_PROOF} />
      </section>

      {/* Why x402 vs everything else */}
      <section className="glass" style={{
        padding: '1.75rem',
        marginBottom: '3rem',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.01) 100%)',
        border: '1px solid rgba(99,102,241,0.25)',
      }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: '#a5b4fc', marginBottom: '0.5rem' }}>
          🤖 WHY AGENTS NEED THIS
        </div>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>API keys + monthly subscriptions are the old web.</h2>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.7, paddingLeft: '1.4rem', margin: 0 }}>
          <li><b style={{ color: 'white' }}>No vendor signups.</b> No dashboards to provision keys in. The wallet is the identity.</li>
          <li><b style={{ color: 'white' }}>Per-request pricing.</b> Pay 0.001 USDC per call. Charge 0.005 USDC per inference. Real microeconomics.</li>
          <li><b style={{ color: 'white' }}>Cryptographic auth.</b> The X-Payment header is a signed proof — no shared secrets to rotate.</li>
          <li><b style={{ color: 'white' }}>Same protocol your data sources will adopt.</b> Cloudflare, AWS, Stripe — all in. Build once, settle anywhere.</li>
          <li><b style={{ color: 'white' }}>Composability.</b> Your agent calls another agent which calls a Pico paywall — all via the same HTTP 402 handshake.</li>
        </ul>
      </section>

      {/* Use cases */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>What developers are building</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <UseCard icon="🔬" title="Research agents" body="Agents that read paywalled journalism, academic papers, and primary sources — auto-paying as they fetch." />
          <UseCard icon="📰" title="News aggregators" body="Backend pipelines that ingest premium articles for summarisation, with per-article costs passed through transparently." />
          <UseCard icon="🤝" title="AI assistants" body="End-user assistants that say &apos;I can read this for 20p — proceed?&apos; instead of hitting a subscription wall." />
          <UseCard icon="📊" title="Data products" body="Tools that mine paywalled feeds with explicit, auditable per-record payment trails — perfect for compliance." />
          <UseCard icon="🧪" title="Evaluation harnesses" body="LLM evals that need consistent access to premium ground truth without expensive sub-licensing deals." />
          <UseCard icon="🌐" title="Browser extensions" body="User agents that auto-unlock at the publisher&apos;s price when the reader has agreed in advance." />
        </div>
      </section>

      {/* Cost example */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>What does it cost your agent?</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem', lineHeight: 1.5 }}>
          The publisher sets the price. The protocol cost is the on-chain settlement on Base — currently sub-cent per call.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: '0.7rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0' }}>Scenario</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Publisher price</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Settlement cost</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0' }}>Total per call</th>
            </tr>
          </thead>
          <tbody>
            <CostRow scenario="Read one article" publisher="$0.20" settlement="~$0.001" total="~$0.201" />
            <CostRow scenario="Fetch one premium paper" publisher="$1.50" settlement="~$0.001" total="~$1.501" />
            <CostRow scenario="100 research queries / day" publisher="$0.05" settlement="~$0.001" total="$5.10/day" highlight />
            <CostRow scenario="10,000 data pipeline calls / month" publisher="$0.01" settlement="~$0.001" total="$110/month" />
          </tbody>
        </table>
      </section>

      {/* Roadmap honesty */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.3rem', marginBottom: '1.25rem' }}>Coming this quarter</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
          <RoadmapPill icon="🔑" title="Per-agent API keys" sub="Q3" />
          <RoadmapPill icon="📈" title="Usage analytics" sub="Q3" />
          <RoadmapPill icon="🪝" title="Webhooks" sub="Q4" />
          <RoadmapPill icon="🧪" title="Sandbox mode" sub="Q4" />
        </div>
      </section>

      {/* CTA */}
      <section className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Start building today.</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', maxWidth: '500px', margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
          The endpoint is live now. No waitlist, no approval flow — sign up, get an agent account, paste the snippet, watch your agent pay.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" className="btn btn-primary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            Create agent account
          </Link>
          <a href="mailto:developers@pico.link" className="btn btn-secondary" style={{ padding: '0.85rem 1.5rem', fontSize: '0.9rem', textDecoration: 'none' }}>
            developers@pico.link
          </a>
        </div>
      </section>

      <LegalFooter />
    </div>
  );
}

function CodeCard({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
        {label}
      </div>
      <pre style={{
        background: 'rgba(0,0,0,0.5)',
        border: '1px solid var(--card-border)',
        borderRadius: '10px',
        padding: '1.1rem 1.25rem',
        fontSize: '0.75rem',
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

function UseCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="glass" style={{ padding: '1.25rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>{title}</div>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function RoadmapPill({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      border: '1px solid var(--card-border)',
      borderRadius: '10px',
      background: 'rgba(255,255,255,0.02)',
      opacity: 0.85,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.3rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'rgba(59,130,246,0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', letterSpacing: '0.05em' }}>
          {sub}
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</div>
    </div>
  );
}

function CostRow({ scenario, publisher, settlement, total, highlight }: { scenario: string; publisher: string; settlement: string; total: string; highlight?: boolean }) {
  return (
    <tr style={{ borderTop: '1px solid var(--card-border)' }}>
      <td style={{ padding: '0.6rem 0', fontWeight: highlight ? 600 : 400 }}>{scenario}</td>
      <td style={{ padding: '0.6rem 0', textAlign: 'right', color: 'var(--text-muted)' }}>{publisher}</td>
      <td style={{ padding: '0.6rem 0', textAlign: 'right', color: 'var(--text-muted)' }}>{settlement}</td>
      <td style={{ padding: '0.6rem 0', textAlign: 'right', fontWeight: highlight ? 700 : 600, color: highlight ? 'var(--success)' : 'inherit' }}>{total}</td>
    </tr>
  );
}
