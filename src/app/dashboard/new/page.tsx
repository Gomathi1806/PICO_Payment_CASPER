'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { createPicoLink } from '@/app/actions/pico';
import { detectContent, detectedKindToType } from '@/lib/contentType';
import FileUploader from '@/components/FileUploader';

const CONTENT_TYPES = ['PDF', 'Article', 'Video', 'Audio', 'Image', 'Course', 'Other'];

const URL_REGEX = /(https?:\/\/\S+|www\.\S+)/i;

export default function CreateNewLink() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('0.50');
  const [description, setDescription] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [type, setType] = useState('PDF');
  // Track whether the type was set by auto-detection vs. the creator
  // picking it manually. We only auto-update if they haven't overridden.
  const [typeAutoSet, setTypeAutoSet] = useState(true);
  const [contentMode, setContentMode] = useState<'upload' | 'url'>('upload');
  const [isSaving, setIsSaving] = useState(false);

  const userId = session?.user?.id;
  const handle = session?.user?.name;

  // Catch the most common creator mistake: pasting the gated URL into
  // the public description field. Show an inline warning if we spot one.
  const descriptionHasUrl = useMemo(() => URL_REGEX.test(description), [description]);

  // Auto-pick the content type when the creator pastes a recognisable
  // URL (YouTube → Video, .pdf → PDF, etc.). Skipped once they manually
  // change the type, so we never override an explicit choice.
  React.useEffect(() => {
    if (!typeAutoSet || !contentUrl) return;
    const detected = detectedKindToType(detectContent(contentUrl).kind);
    if (detected && detected !== type) setType(detected);
  }, [contentUrl, typeAutoSet, type]);

  const handleSubmit = async () => {
    if (!userId) {
      router.replace('/login');
      return;
    }

    if (!title || !price) {
      alert('Please add a title and price.');
      return;
    }

    if (!contentUrl) {
      const ok = confirm(
        'You haven\'t added the Content URL — the gated link fans receive after paying. ' +
        'You can add it now or edit the link later. Save without it?'
      );
      if (!ok) return;
    }

    if (descriptionHasUrl) {
      const ok = confirm(
        'Your description contains a URL. Anyone visiting the link can see the description ' +
        'BEFORE paying — so any URL here will be visible to non-paying visitors.\n\n' +
        'The gated URL should go in "Content URL" instead. Save anyway?'
      );
      if (!ok) return;
    }

    setIsSaving(true);
    const result = await createPicoLink({
      title,
      description,
      price,
      contentUrl: contentUrl.trim() || undefined,
      type,
      creatorId: userId,
    });

    if (result.success) {
      router.push('/dashboard');
    } else {
      alert(result.error || 'Something went wrong.');
      setIsSaving(false);
    }
  };

  if (status === 'loading') {
    return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading...</div>;
  }

  return (
    <div className="animate-fade">
      <header style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Create New Pico Link</h1>
      </header>

      <div style={{ display: 'grid', gap: '2rem' }}>
        {/* Form */}
        <div className="glass" style={{ padding: '1.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
            borderRadius: '100px', padding: '0.3rem 0.75rem', fontSize: '0.75rem',
            color: 'var(--accent)', marginBottom: '1.5rem'
          }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--success)' }}></div>
            @{handle}
          </div>

          {/* Title */}
          <Field label="PRODUCT TITLE">
            <input
              type="text"
              placeholder="e.g. My 5 Daily AI Prompts"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {/* Content type */}
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

          {/* Price */}
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
            <Hint>Pico fee: 5% under $10 · 4% under $50 · 3.8% under $100 · 2.8% above</Hint>
          </Field>

          {/* Description with public-teaser warning */}
          <Field label="DESCRIPTION (PUBLIC TEASER)">
            <textarea
              rows={3}
              placeholder="What are they buying? Visible to everyone — don't put the gated link here."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ ...inputStyle, resize: 'none', fontSize: '0.9rem' }}
            />
            <Hint>
              ⚠️ This text is shown to <b>every visitor before they pay</b>. Use it to describe what
              they&apos;re buying. The gated link goes in <b>Content URL</b> below.
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
                🚨 Your description contains a URL. Anyone can read this without paying. Move the
                URL to the Content URL field below.
              </div>
            )}
          </Field>

          {/* Gated content — tabbed Upload vs Paste URL */}
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
                onUploaded={(url) => setContentUrl(url)}
              />
            ) : (
              <input
                type="url"
                placeholder="https://drive.google.com/... or https://yourstore.com/file.pdf"
                value={contentUrl}
                onChange={(e) => setContentUrl(e.target.value)}
                style={inputStyle}
              />
            )}

            <Hint>
              🔒 {contentMode === 'upload'
                ? 'Files are hosted on Vercel Blob storage and only the URL is shared with paying fans.'
                : 'Host your file on Google Drive, Dropbox, Notion, your own site — anywhere with a shareable URL.'}
              {' '}We never reveal this to non-paying visitors.
            </Hint>
          </Field>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Create Pico Link'}
          </button>
        </div>

        {/* Preview */}
        <div>
          <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center', letterSpacing: '0.1em' }}>LIVE PREVIEW (what fans see)</label>
          <div className="glass" style={{ padding: '1.5rem', opacity: 0.85 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>{type.toUpperCase()}</span>
              <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>${price || '0.00'}</span>
            </div>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{title || 'Your Product Title'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
              {description
                ? description.replace(URL_REGEX, '[link removed — visible after unlock]')
                : 'The description appears here…'}
            </p>
            <button className="btn btn-primary" style={{ width: '100%', padding: '0.7rem', fontSize: '0.9rem' }} disabled>
              🔒 Unlock with FaceID — ${price || '0.00'}
            </button>
          </div>
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
