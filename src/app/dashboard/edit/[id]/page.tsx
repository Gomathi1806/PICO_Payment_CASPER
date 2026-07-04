'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getPicoLinkForOwner, updatePicoLink } from '@/app/actions/pico';
import { detectContent, detectedKindToType } from '@/lib/contentType';
import FileUploader from '@/components/FileUploader';

const CONTENT_TYPES = ['PDF', 'Article', 'Video', 'Audio', 'Image', 'Course', 'Other'];
const URL_REGEX = /(https?:\/\/\S+|www\.\S+)/i;

export default function EditPicoLink(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const linkId = params.id;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [type, setType] = useState('PDF');
  const [isSaving, setIsSaving] = useState(false);
  // Tracks whether subsequent URL auto-detection should override the
  // type. Starts false because the loaded link already has a chosen
  // type we don't want to clobber; flips to true once the creator
  // clears or changes the URL field.
  const [typeAutoSet, setTypeAutoSet] = useState(false);
  const [contentMode, setContentMode] = useState<'upload' | 'url'>('url');

  const userId = session?.user?.id;
  const descriptionHasUrl = useMemo(() => URL_REGEX.test(description), [description]);

  useEffect(() => {
    if (!typeAutoSet || !contentUrl) return;
    const detected = detectedKindToType(detectContent(contentUrl).kind);
    if (detected && detected !== type) setType(detected);
  }, [contentUrl, typeAutoSet, type]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const r = await getPicoLinkForOwner(linkId, userId);
      if (cancelled) return;
      if (r.success && r.link) {
        setTitle(r.link.title || '');
        setPrice(r.link.price || '0.50');
        setDescription(r.link.description || '');
        setContentUrl(r.link.contentUrl || '');
        setType(r.link.type || 'PDF');
      } else {
        setNotFound(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [linkId, userId]);

  const handleSave = async () => {
    if (!userId) return;
    if (!title || !price) {
      alert('Title and price are required.');
      return;
    }
    if (descriptionHasUrl) {
      const ok = confirm(
        'Your description contains a URL — visible to everyone before they pay. ' +
        'Move it to "Content URL" instead. Save anyway?'
      );
      if (!ok) return;
    }
    setIsSaving(true);
    const r = await updatePicoLink({
      linkId,
      creatorId: userId,
      title,
      description,
      price,
      contentUrl: contentUrl.trim(),
      type,
    });
    if (r.success) {
      router.push('/dashboard');
    } else {
      alert(r.error || 'Failed to update.');
      setIsSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading…</div>;
  }
  if (notFound) {
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
    <div className="animate-fade">
      <header style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Edit Pico Link</h1>
      </header>

      <div className="glass" style={{ padding: '1.5rem' }}>
        <Field label="PRODUCT TITLE">
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </Field>

        <Field label="CONTENT TYPE">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {CONTENT_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setType(t); setTypeAutoSet(false); }}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid ' + (type === t ? 'rgba(59,130,246,0.5)' : 'var(--card-border)'),
                  background: type === t ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.02)',
                  color: type === t ? 'var(--accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: type === t ? 600 : 400,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>

        <Field label="PRICE (USDC)">
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '2.5rem' }}
            />
            <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>$</span>
          </div>
        </Field>

        <Field label="DESCRIPTION (PUBLIC TEASER)">
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, resize: 'none', fontSize: '0.9rem' }}
          />
          <Hint>
            ⚠️ Visible to <b>every visitor before they pay</b>. Don&apos;t put the gated link here.
          </Hint>
          {descriptionHasUrl && (
            <div style={{
              marginTop: '0.5rem',
              padding: '0.6rem 0.8rem',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              fontSize: '0.75rem',
              color: '#f87171',
              lineHeight: 1.4,
            }}>
              🚨 The description contains a URL — readable without paying. Move it to Content URL below.
            </div>
          )}
        </Field>

        <Field label="GATED CONTENT (UNLOCKED AFTER PAYMENT)">
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <ModeTab active={contentMode === 'upload'} onClick={() => setContentMode('upload')}>
              📎 Upload file
            </ModeTab>
            <ModeTab active={contentMode === 'url'} onClick={() => setContentMode('url')}>
              🔗 Paste URL
            </ModeTab>
          </div>

          {contentMode === 'upload' ? (
            <FileUploader
              currentUrl={contentUrl}
              onUploaded={(url) => { setContentUrl(url); setTypeAutoSet(true); }}
            />
          ) : (
            <input
              type="url"
              placeholder="https://drive.google.com/..."
              value={contentUrl}
              onChange={(e) => { setContentUrl(e.target.value); setTypeAutoSet(true); }}
              style={inputStyle}
            />
          )}
          <Hint>🔒 Returned to fans only after their payment is confirmed on-chain.</Hint>
        </Field>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={() => router.push('/dashboard')}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--card-border)',
  padding: '1rem',
  borderRadius: '12px',
  color: 'white',
  fontSize: '1rem',
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.6rem 0.8rem',
        fontSize: '0.8rem',
        borderRadius: '8px',
        border: '1px solid ' + (active ? 'rgba(59,130,246,0.5)' : 'var(--card-border)'),
        background: active ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.02)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem', lineHeight: 1.4 }}>
      {children}
    </div>
  );
}
