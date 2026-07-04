import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { isAdmin } from '@/lib/roles';
import { getPlatformStats, getPlatformRecentPayments } from '@/app/actions/admin';
import { getAllWidgetStatsForAdmin } from '@/app/actions/widgets';
import { getOutstandingPromoLiability } from '@/app/actions/settlement';
import SettleNowButton from '@/components/SettleNowButton';
import MarkSettledButton from '@/components/MarkSettledButton';
import LegalFooter from '@/components/LegalFooter';

/**
 * /admin — platform overview for internal Pico staff.
 *
 * Server component because it gates on the session + ADMIN_EMAILS
 * allowlist before any data is fetched. Anyone whose role isn't admin
 * (or whose email isn't on the env allowlist) gets bounced to /login.
 *
 * The stats here are real — pulled from the live DB via server
 * actions in src/app/actions/admin.ts, themselves re-gated for
 * defence in depth so a leaked client-side state can't bypass the
 * server check.
 */
export default async function AdminDashboard() {
  const session = await auth();
  const allowed = await isAdmin(session?.user?.id, session?.user?.email ?? undefined);
  if (!allowed) {
    redirect('/login?reason=admin-required');
  }

  const [statsRes, recentRes, widgetsRes, liabilityRes] = await Promise.all([
    getPlatformStats(),
    getPlatformRecentPayments(25),
    getAllWidgetStatsForAdmin(),
    getOutstandingPromoLiability(),
  ]);

  const stats = statsRes.success ? statsRes.stats : null;
  const recent = recentRes.success ? recentRes.payments : [];
  const allWidgets = widgetsRes.success ? widgetsRes.widgets : [];
  const gross = Number(stats?.grossVolume ?? '0.00');
  const piclFee = gross * 0.05;

  // Widget health buckets — admin cares about deployment problems at
  // platform scale: dormant widgets often mean a publisher's CMS
  // stripped the script tag or someone deleted the article.
  const activeWidgets = allWidgets.filter((w) => w.status === 'active');
  const dormantWidgets = allWidgets.filter((w) => w.status === 'dormant');
  const idleWidgets = allWidgets.filter((w) => w.status === 'idle');
  const topByRevenue = [...allWidgets]
    .sort((a, b) => Number(b.grossRevenue) - Number(a.grossRevenue))
    .slice(0, 5);
  const topByConversion = [...allWidgets]
    .filter((w) => w.views >= 5) // ignore noise from low-view widgets
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 5);

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
            background: 'rgba(239,68,68,0.12)',
            color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '100px',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>Platform Admin</span>
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {session?.user?.email}
        </span>
      </nav>

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Platform overview</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem' }}>
          Real-time stats across all Pico users. Read-only for now — moderation tools and AML alerts in Q3.
        </p>
      </header>

      {/* Platform stats */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Stat label="Total users" value={(stats?.totalUsers ?? 0).toString()} sub={`${stats?.usersByRole.creator ?? 0} creators · ${stats?.usersByRole.publisher ?? 0} publishers`} />
        <Stat label="Developer / agent users" value={(stats?.usersByRole.agent ?? 0).toString()} sub="x402 API consumers" />
        <Stat label="Paywalled links" value={(stats?.totalLinks ?? 0).toString()} sub={`${stats?.totalPayments ?? 0} unlocks`} />
        <Stat label="Gross volume" value={`$${gross.toFixed(2)}`} sub="all-time USDC paid" tone="ok" />
        <Stat label="Pico treasury (est)" value={`$${piclFee.toFixed(2)}`} sub="@ 5% effective fee" tone="warn" />
      </section>

      {/* Widget health — cross-tenant deployment monitoring */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Widget health — across all publishers</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {allWidgets.length} total widgets
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <MiniStat label="Active" value={activeWidgets.length.toString()} sub="view in last 7 days" tone="ok" />
          <MiniStat label="Dormant" value={dormantWidgets.length.toString()} sub="no recent views" tone={dormantWidgets.length > 0 ? 'warn' : undefined} />
          <MiniStat label="Idle" value={idleWidgets.length.toString()} sub="never viewed" />
          <MiniStat
            label="Total impressions"
            value={allWidgets.reduce((s, w) => s + w.views, 0).toLocaleString('en-GB')}
            sub={`${allWidgets.reduce((s, w) => s + w.conversions, 0).toLocaleString('en-GB')} unlocks`}
          />
        </div>

        {/* Top performers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <LeaderboardCard
            title="🏆 Top widgets by revenue"
            rows={topByRevenue.map((w) => ({
              left: `@${w.creatorHandle || '?'} — ${w.title}`,
              right: `$${Number(w.grossRevenue).toFixed(2)}`,
            }))}
            emptyHint="No payments yet."
          />
          <LeaderboardCard
            title="📈 Top widgets by conversion"
            rows={topByConversion.map((w) => ({
              left: `@${w.creatorHandle || '?'} — ${w.title}`,
              right: `${(w.conversionRate * 100).toFixed(1)}% (${w.views} views)`,
            }))}
            emptyHint="No widgets with 5+ views yet."
          />
        </div>

        {/* Dormant detail — most actionable signal */}
        {dormantWidgets.length > 0 && (
          <details style={{ marginTop: '1.25rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', listStyle: 'none' }}>
              ⚠️ {dormantWidgets.length} dormant widget{dormantWidgets.length === 1 ? '' : 's'} — likely deployment issues
            </summary>
            <div style={{ marginTop: '0.85rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    <th style={{ textAlign: 'left', padding: '0.4rem' }}>Publisher</th>
                    <th style={{ textAlign: 'left', padding: '0.4rem' }}>Widget</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem' }}>Views</th>
                    <th style={{ textAlign: 'right', padding: '0.4rem' }}>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {dormantWidgets.map((w) => (
                    <tr key={w.linkId} style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td style={{ padding: '0.55rem 0.4rem' }}>@{w.creatorHandle || '?'}</td>
                      <td style={{ padding: '0.55rem 0.4rem', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.title}
                      </td>
                      <td style={{ padding: '0.55rem 0.4rem', textAlign: 'right' }}>{w.views}</td>
                      <td style={{ padding: '0.55rem 0.4rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                        {w.lastViewAt ? new Date(w.lastViewAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {/* Recent payments — the platform-wide activity feed */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Recent payments — all users</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>last {recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '1.5rem 0' }}>
            No payments recorded yet.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>When</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Creator</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Article</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem 0.4rem' }}>Amount</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Payer</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.4rem' }}>Tx</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '0.65rem 0.4rem', color: 'var(--text-muted)' }}>
                      {p.createdAt ? new Date(p.createdAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem' }}>@{p.creatorHandle}</td>
                    <td style={{ padding: '0.65rem 0.4rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>
                      ${Number(p.amount).toFixed(2)}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {p.payerAddress.slice(0, 6)}…{p.payerAddress.slice(-4)}
                    </td>
                    <td style={{ padding: '0.65rem 0.4rem', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                      <a
                        href={`https://basescan.org/tx/${p.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'none' }}
                      >
                        {p.txHash.slice(0, 8)}…
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Gift card creator settlement */}
      <section className="glass" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: 0 }}>Creator settlement — free unlocks Pico owes</h2>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>auto-runs daily · 03:00 UTC</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <MiniStat
            label="Outstanding liability"
            value={`$${liabilityRes.outstanding}`}
            sub="owed to creators (promos)"
            tone={Number(liabilityRes.outstanding) > 0 ? 'warn' : 'ok'}
          />
          <MiniStat label="Unsettled unlocks" value={(liabilityRes.count ?? 0).toString()} sub="awaiting payout" />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1rem' }}>
          Launch mode (Option 1): free unlocks are <b>off</b> — Pico relies on creator giveaways
          and fan gifts, which cost Pico nothing. If you enable free unlocks later, settle creators
          either automatically (treasury key) or manually after paying them by hand.
        </p>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <SettleNowButton />
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Pays on-chain · needs <code>TREASURY_PRIVATE_KEY</code>
            </div>
          </div>
          <div>
            <MarkSettledButton />
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Reconcile only · use after paying by hand
            </div>
          </div>
        </div>
      </section>

      {/* Operational reminders */}
      <section className="glass" style={{
        padding: '1.25rem 1.5rem',
        background: 'rgba(245, 158, 11, 0.06)',
        border: '1px solid rgba(245, 158, 11, 0.25)',
        marginBottom: '2rem',
      }}>
        <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem' }}>Operational reminders</h3>
        <ul style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: '1.2rem', margin: 0 }}>
          <li>Treasury balance is on-chain — check the wallet address you set as <code>NEXT_PUBLIC_PICO_TREASURY_ADDRESS</code> on BaseScan.</li>
          <li>Sweep treasury to Coinbase Business at least monthly; convert to GBP and move to Revolut Business.</li>
          <li>Sanctions screening is currently manual — review the payer addresses in this list against the UK HMT sanctions list.</li>
          <li>Roadmap: user suspension, manual link takedown, AML alerts, treasury balance snapshot — all Q3.</li>
        </ul>
      </section>

      <LegalFooter variant="compact" />
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? '#fbbf24' : 'white';
  return (
    <div style={{
      padding: '0.8rem 1rem',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--card-border)',
      borderRadius: '10px',
    }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, marginTop: '0.2rem', color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  );
}

function LeaderboardCard({ title, rows, emptyHint }: { title: string; rows: { left: string; right: string }[]; emptyHint: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--card-border)',
      borderRadius: '10px',
    }}>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.5rem' }}>{title}</div>
      {rows.length === 0 ? (
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{emptyHint}</p>
      ) : (
        <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.75rem', lineHeight: 1.6 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.left}</span>
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{r.right}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? '#fbbf24' : 'white';
  return (
    <div className="glass" style={{ padding: '1.1rem 1.25rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.35rem', color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  );
}
