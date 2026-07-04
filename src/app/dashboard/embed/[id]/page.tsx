'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { getPicoLinkForOwner } from '@/app/actions/pico';
import EmbedTester from './EmbedTester';

/**
 * Publisher-integration page for a single Pico link.
 *
 * Closes the "I can't test the publisher product" gap: a creator picks
 * one of their existing links, lands here, and gets ready-to-paste
 * snippets, a live preview iframe of the editorial paywall, and a
 * downloadable standalone HTML test page they can open in any browser
 * (no CMS / WordPress / Ghost needed to validate the flow).
 */
export default function EmbedIntegrationPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const linkId = params.id;
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [link, setLink] = useState<{ id: string; title: string; price: string; type: string | null } | null>(null);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const r = await getPicoLinkForOwner(linkId, userId);
      if (cancelled) return;
      if (r.success && r.link) {
        setLink({
          id: r.link.id,
          title: r.link.title,
          price: r.link.price,
          type: r.link.type,
        });
      } else {
        setNotFound(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [linkId, userId]);

  if (status === 'loading' || loading) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading…</div>;
  }
  if (notFound || !link) {
    return (
      <div style={{ textAlign: 'center', padding: '6rem 0' }}>
        <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
          Link not found, or you don&apos;t own it.
        </p>
        <Link href="/dashboard" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ paddingBottom: '4rem' }}>
      <header style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Publisher integration
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0.2rem 0 0' }}>
            {link.title}
          </h1>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            ${link.price} · {link.type || 'Article'}
          </div>
        </div>
      </header>

      <EmbedTester link={link} />
    </div>
  );
}
