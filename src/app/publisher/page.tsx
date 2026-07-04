'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import LegalFooter from '@/components/LegalFooter';
import { getUserById } from '@/app/actions/auth';
import { getWidgetStatsForOwner, type WidgetStat } from '@/app/actions/widgets';

/**
 * /publisher — B2B newsroom dashboard centred on WIDGETS (deployed
 * paywall embeds on the publisher's own site), not LINKS (the
 * shareable bio-link framing of /dashboard).
 *
 * Where /dashboard answers "how much have my links sold?", this page
 * answers "is my paywall deployed and converting?". Status surfaces
 * dormant widgets (no impressions in 7+ days = probably broken
 * embed), top-referring article URLs, and the view→conversion funnel
 * per widget.
 */
export default function PublisherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [handle, setHandle] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<WidgetStat[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'dormant' | 'idle'>('all');

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const [user, widgetsRes] = await Promise.all([
        getUserById(userId),
        getWidgetStatsForOwner(),
      ]);
      if (user.success && user.user) setHandle(user.user.handle);
      if (widgetsRes.success) setWidgets(widgetsRes.widgets);
      setLoading(false);
    })();
  }, [userId]);

  // Route side-effect belongs in useEffect, not the render body.
  // Triggers only once auth has finished resolving and confirmed no
  // session — anonymous visitors get bounced to /login from here.
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  const totals = useMemo(() => {
    const views = widgets.reduce((s, w) => s + w.views, 0);
    const conversions = widgets.reduce((s, w) => s + w.conversions, 0);
    const gross = widgets.reduce((s, w) => s + Number(w.grossRevenue), 0);
    return {
      views,
      conversions,
      grossRevenue: gross,
      netRevenue: gross * 0.95,
      activeWidgets: widgets.filter((w) => w.status === 'active').length,
      dormantWidgets: widgets.filter((w) => w.status === 'dormant').length,
      idleWidgets: widgets.filter((w) => w.status === 'idle').length,
      overallConvRate: views > 0 ? conversions / views : 0,
    };
  }, [widgets]);

  const filtered = filter === 'all' ? widgets : widgets.filter((w) => w.status === filter);

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  if (status === 'loading' || loading) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading newsroom…</div>;
  }
  if (!userId) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Redirecting…</div>;
  }

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
            background: 'rgba(99,102,241,0.12)',
            color: '#a5b4fc',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '100px',
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>Publisher</span>
        </div>
        <div onClick={handleLogout} className="glass" style={{
          padding: '0.5rem 1rem', borderRadius: '100px', fontSize: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
        }} title="Click to log out">
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
          {handle ? `@${handle}` : 'Account'}
        </div>
      </nav>

      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>Widget management</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.4rem', margin: 0 }}>
            Monitor each paywall deployed on your site. Conversion funnel, dormancy alerts, embed snippets — per widget.
          </p>
        </div>
        <Link
          href="/dashboard/new"
          className="btn btn-primary"
          style={{ padding: '0.7rem 1.2rem', fontSize: '0.85rem', borderRadius: '10px', textDecoration: 'none' }}
        >
          + Deploy new widget
        </Link>
      </header>

      {/* KPI row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '2rem' }}>
        <Stat label="Active widgets" value={totals.activeWidgets.toString()} sub={`${widgets.length} total`} tone="ok" />
        <Stat label="Dormant" value={totals.dormantWidgets.toString()} sub="no views in 7+ days" tone={totals.dormantWidgets > 0 ? 'warn' : undefined} />
        <Stat label="Impressions" value={totals.views.toLocaleString('en-GB')} sub="paywall painted" />
        <Stat label="Unlocks" value={totals.conversions.toLocaleString('en-GB')} sub={`${(totals.overallConvRate * 100).toFixed(1)}% conversion`} />
        <Stat label="Net revenue" value={`$${totals.netRevenue.toFixed(2)}`} sub="after 5% Pico fee" tone="ok" />
      </section>

      {/* Dormancy banner */}
      {totals.dormantWidgets > 0 && (
        <section style={{
          padding: '0.85rem 1.1rem',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '10px',
          marginBottom: '1.5rem',
          fontSize: '0.82rem',
          color: '#fbbf24',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
        }}>
          <span>
            ⚠️ <b>{totals.dormantWidgets}</b> widget{totals.dormantWidgets === 1 ? ' has' : 's have'} received no impressions in 7+ days. The embed may have been removed from the article, the CMS may have stripped the script, or the article was unpublished.
          </span>
          <button
            type="button"
            onClick={() => setFilter('dormant')}
            className="btn btn-secondary"
            style={{ fontSize: '0.72rem', padding: '0.3rem 0.7rem', whiteSpace: 'nowrap' }}
          >
            View dormant →
          </button>
        </section>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>All ({widgets.length})</FilterTab>
        <FilterTab active={filter === 'active'} onClick={() => setFilter('active')}>Active ({totals.activeWidgets})</FilterTab>
        <FilterTab active={filter === 'dormant'} onClick={() => setFilter('dormant')}>Dormant ({totals.dormantWidgets})</FilterTab>
        <FilterTab active={filter === 'idle'} onClick={() => setFilter('idle')}>Never viewed ({totals.idleWidgets})</FilterTab>
      </div>

      {/* Widget rows */}
      <section className="glass" style={{ padding: '1.25rem' }}>
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 1rem' }}>
            {widgets.length === 0
              ? <>No widgets deployed yet. <Link href="/dashboard/new" style={{ color: 'var(--accent)' }}>Deploy your first paywall</Link>.</>
              : 'No widgets match this filter.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {filtered.map((w) => <WidgetRow key={w.linkId} widget={w} />)}
          </div>
        )}
      </section>

      <LegalFooter variant="compact" />
    </div>
  );
}

function WidgetRow({ widget }: { widget: WidgetStat }) {
  const lastSeen = widget.lastViewAt ? timeAgo(new Date(widget.lastViewAt)) : 'never';
  const convPct = (widget.conversionRate * 100).toFixed(1);

  return (
    <div style={{
      padding: '1rem 1.1rem',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--card-border)',
      borderRadius: '12px',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 2fr) auto',
      gap: '0.85rem',
      alignItems: 'flex-start',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
          <StatusPill status={widget.status} />
          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{widget.title}</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>${widget.price} · {widget.type || 'Article'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.73rem' }}>
          <Micro label="Impressions" value={widget.views.toLocaleString('en-GB')} />
          <Micro label="Unlocks" value={widget.conversions.toLocaleString('en-GB')} />
          <Micro label="Conversion" value={`${convPct}%`} />
          <Micro label="Last view" value={lastSeen} />
        </div>
        {widget.topReferrer && (
          <div style={{
            marginTop: '0.55rem',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '0.4rem',
          }}>
            🌐 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Top referrer: <span style={{ color: 'white' }}>{shortenUrl(widget.topReferrer)}</span>
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 }}>
        <Link href={`/dashboard/embed/${widget.linkId}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', textDecoration: 'none' }}>
          📦 Embed
        </Link>
        <Link href={`/dashboard/edit/${widget.linkId}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.72rem', textDecoration: 'none' }}>
          Edit
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? '#fbbf24' : 'white';
  return (
    <div className="glass" style={{ padding: '0.9rem 1.05rem' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '0.25rem', color }}>{value}</div>
      {sub && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{sub}</div>}
    </div>
  );
}

function Micro({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.1rem' }}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: WidgetStat['status'] }) {
  const config = {
    active: { color: 'var(--success)', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', label: '● Active' },
    dormant: { color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: '● Dormant' },
    idle: { color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.04)', border: 'var(--card-border)', label: '○ Idle' },
  }[status];
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.02em',
      padding: '0.15rem 0.5rem', borderRadius: '4px',
      background: config.bg, color: config.color, border: `1px solid ${config.border}`,
    }}>
      {config.label}
    </span>
  );
}

function FilterTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.4rem 0.85rem',
        fontSize: '0.75rem',
        borderRadius: '8px',
        border: '1px solid ' + (active ? 'rgba(59,130,246,0.5)' : 'var(--card-border)'),
        background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/\/$/, '');
  } catch {
    return url.slice(0, 60);
  }
}
