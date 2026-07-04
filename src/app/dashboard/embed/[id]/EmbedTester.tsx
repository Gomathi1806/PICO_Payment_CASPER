'use client';

import React, { useMemo, useState } from 'react';

interface Link {
  id: string;
  title: string;
  price: string;
  type: string | null;
}

type Mode = 'editorial' | 'default';
type Platform = 'html' | 'wordpress' | 'ghost' | 'substack';

/**
 * The publisher-test workbench. Generates an embed snippet with the
 * creator's real link id + price, gives them tabs for the major CMS
 * platforms (each with platform-specific install notes), shows a live
 * preview, and packages everything into a downloadable .html file
 * they can open locally to verify the flow without touching their
 * production site.
 */
export default function EmbedTester({ link }: { link: Link }) {
  const [mode, setMode] = useState<Mode>('editorial');
  const [platform, setPlatform] = useState<Platform>('html');
  const [publication, setPublication] = useState('The Daily Ledger');
  const [previewWords, setPreviewWords] = useState(80);
  const [origin, setOrigin] = useState<string>('');

  React.useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const snippet = useMemo(() => buildSnippet({
    linkId: link.id, price: link.price, title: link.title,
    mode, publication, previewWords, origin: origin || 'https://pico.link',
  }), [link, mode, publication, previewWords, origin]);

  const fullPage = useMemo(() => buildStandaloneHtml({
    linkId: link.id, price: link.price, title: link.title,
    mode, publication, previewWords, origin: origin || 'https://pico.link',
  }), [link, mode, publication, previewWords, origin]);

  const copy = (text: string) => navigator.clipboard.writeText(text);

  const downloadHtml = () => {
    const blob = new Blob([fullPage], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pico-test-${link.id.slice(0, 8)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Configuration */}
      <div className="glass" style={{ padding: '1.25rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem' }}>
          1. Pick how it should look
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <ModeBtn active={mode === 'editorial'} onClick={() => setMode('editorial')}>
            📰 Editorial (newsroom)
          </ModeBtn>
          <ModeBtn active={mode === 'default'} onClick={() => setMode('default')}>
            ⚡ Default (creator)
          </ModeBtn>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {mode === 'editorial' && (
            <TextField
              label="Publication name"
              value={publication}
              onChange={setPublication}
              placeholder="The Daily Ledger"
            />
          )}
          <TextField
            label="Preview words shown free"
            value={String(previewWords)}
            onChange={(v) => setPreviewWords(Math.max(20, Math.min(500, parseInt(v) || 80)))}
            type="number"
          />
        </div>
      </div>

      {/* Platform tabs */}
      <div className="glass" style={{ padding: '1.25rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.85rem' }}>
          2. Copy the snippet for your platform
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
          <PlatformTab active={platform === 'html'} onClick={() => setPlatform('html')}>HTML</PlatformTab>
          <PlatformTab active={platform === 'wordpress'} onClick={() => setPlatform('wordpress')}>WordPress</PlatformTab>
          <PlatformTab active={platform === 'ghost'} onClick={() => setPlatform('ghost')}>Ghost</PlatformTab>
          <PlatformTab active={platform === 'substack'} onClick={() => setPlatform('substack')}>Substack</PlatformTab>
        </div>

        <PlatformInstructions platform={platform} />

        <pre style={{
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid var(--card-border)',
          borderRadius: '10px',
          padding: '1rem 1.1rem',
          fontSize: '0.72rem',
          lineHeight: 1.55,
          color: '#e7e7ea',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          overflowX: 'auto',
          margin: '0.85rem 0 0.6rem',
        }}>
{snippet}
        </pre>
        <button onClick={() => copy(snippet)} className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.5rem 0.9rem' }}>
          📋 Copy snippet
        </button>
      </div>

      {/* Standalone test file */}
      <div className="glass" style={{
        padding: '1.25rem',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.01) 100%)',
        border: '1px solid rgba(16,185,129,0.25)',
      }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
          3. Test it without a CMS
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 1rem', lineHeight: 1.5 }}>
          Download a complete sample article with the paywall already installed. Open the file in any browser, click the unlock button, and see your real Pico link in the popup. Best way to verify the integration before touching your production CMS.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={downloadHtml} className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '0.7rem 1.2rem' }}>
            ⬇️ Download test HTML
          </button>
          <a
            href={`/publishers/demo?linkId=${encodeURIComponent(link.id)}&price=${encodeURIComponent(link.price)}&title=${encodeURIComponent(link.title)}&mode=${mode}&publication=${encodeURIComponent(publication)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', padding: '0.7rem 1.2rem', textDecoration: 'none' }}
          >
            👁️ Open demo with your link
          </a>
        </div>
      </div>

      {/* Live preview iframe */}
      <div className="glass" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            4. Live preview
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Renders the {mode === 'editorial' ? 'editorial' : 'default'} paywall card
          </span>
        </div>
        <iframe
          title="Embed preview"
          srcDoc={fullPage}
          style={{
            width: '100%',
            height: '560px',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            background: '#f8f5ee',
          }}
        />
      </div>
    </div>
  );
}

function buildSnippet(p: {
  linkId: string; price: string; title: string; mode: Mode; publication: string;
  previewWords: number; origin: string;
}) {
  const attrs: string[] = [
    'class="pico-paywall"',
    p.mode === 'editorial' ? 'data-variant="editorial"' : '',
    p.mode === 'editorial' && p.publication ? `data-publication="${escapeAttr(p.publication)}"` : '',
    `data-link-id="${p.linkId}"`,
    `data-price="${p.price}"`,
    `data-title="${escapeAttr(p.title)}"`,
    'data-preview-selector="#article-body"',
    `data-preview-words="${p.previewWords}"`,
  ].filter(Boolean);

  return [
    '<!-- 1. Place this where you want the paywall to appear in your article -->',
    `<div ${attrs.join(' ')}></div>`,
    '',
    '<!-- 2. Place this once near </body> on any page that uses Pico paywalls -->',
    `<script src="${p.origin}/embed.js" async></script>`,
  ].join('\n');
}

function buildStandaloneHtml(p: {
  linkId: string; price: string; title: string; mode: Mode; publication: string;
  previewWords: number; origin: string;
}) {
  // Self-contained article a publisher can open locally to verify the
  // paywall flow against their real link id. The article copy is filler
  // so the preview truncation works as designed.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pico embed test — ${escapeHtml(p.title)}</title>
<style>
  body{font-family:Georgia,"Times New Roman",serif;background:#f8f5ee;color:#0b0b0d;margin:0;padding:2rem 1.5rem;}
  .wrap{max-width:660px;margin:0 auto;}
  .masthead{text-align:center;border-bottom:2px solid #1f2937;padding-bottom:.6rem;margin-bottom:1.5rem;font-family:-apple-system,sans-serif;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:600}
  h1{font-size:2.2rem;line-height:1.12;margin:1rem 0;letter-spacing:-.015em;}
  .byline{font-family:-apple-system,sans-serif;font-size:.78rem;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin:0 0 2rem;}
  #article-body{font-size:1.08rem;line-height:1.65;color:#1f2937;}
  #article-body p{margin:0 0 1.2rem;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="masthead">${escapeHtml(p.publication || 'The Daily Ledger')}</div>
    <h1>${escapeHtml(p.title)}</h1>
    <p class="byline">By Demo Reporter · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

    <div id="article-body">
      <p>The Crown and Cushion served its last pint on Tuesday after 174 years on Stationer's Row. For most of those years it was where the town met itself — for elections, for funerals, for arguments about the football. Last week, quietly, it became a Tesco Express.</p>
      <p>I sat at the bar with John, the publican who took over from his father in 1998, on the morning the brewery told him to close. He was crying, but he was also angry — and not at the brewery.</p>
      <p>"They didn't kill us," he said. "We were dying for ten years. The brewery just signed the papers." What killed the pub, John explained, was the slow erosion of community itself — and a parking restriction the council introduced in 2019 that nobody fought against because the meetings were buried in a PDF agenda that nobody read.</p>
      <p>This is the third pub on this street to close in eighteen months. Across the borough, twenty-two have shut since 2020. The pattern is consistent: not financial collapse, but slow strangulation by a thousand small decisions made in rooms that the public stopped attending.</p>
      <p>I went to the council meeting where the 2019 parking change was approved. The room was empty except for a planning officer, three councillors, and me. The motion passed in four minutes. The next morning the Crown lost half its evening trade.</p>
      <p>This is the story I want to tell more of. It costs me, a freelance reporter, about £180 in time to attend a single council meeting and verify what was said against the planning record. A subscription model never works for this kind of work — readers want one piece, not a relationship.</p>
    </div>

    ${buildSnippet({ ...p }).split('\n').filter(l => !l.startsWith('<!--')).join('\n    ')}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function escapeAttr(s: string) {
  return String(s).replace(/"/g, '&quot;');
}

function ModeBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: '0.65rem 0.85rem',
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

function PlatformTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.45rem 0.85rem',
        fontSize: '0.75rem',
        borderRadius: '6px',
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

function PlatformInstructions({ platform }: { platform: Platform }) {
  const steps: Record<Platform, string[]> = {
    html: [
      'Paste the <div> wherever you want the paywall to appear (usually after the first 1–2 paragraphs).',
      'Paste the <script> tag once, anywhere on the page (the bottom of <body> is conventional).',
    ],
    wordpress: [
      'Edit your post in the Block Editor.',
      'Add a "Custom HTML" block at the position you want the paywall.',
      'Paste the snippet into the block. The <script> tag inside Custom HTML loads on that page only — fine for testing one article.',
      'For site-wide: paste only the <script> tag in Appearance → Theme File Editor → footer.php, just before </body>.',
    ],
    ghost: [
      'Edit your post and add an "HTML" card (slash command: /html).',
      'Paste the snippet.',
      'For site-wide: Settings → Code injection → Site Footer, paste the <script> tag once.',
    ],
    substack: [
      'Substack\'s standard editor blocks <script> tags — embed.js will not run.',
      'Workaround 1: use Substack\'s Custom Domain feature with a wrapper page that includes the script.',
      'Workaround 2: link readers to a Pico unlock page directly (pico.link/p/your-id) from inside your Substack post.',
      'A native Substack integration is on our roadmap — email hello@pico.link to be added to the beta.',
    ],
  };
  return (
    <ol style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: '1.2rem', marginTop: 0 }}>
      {steps[platform].map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.3rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--card-border)',
          padding: '0.65rem 0.85rem',
          borderRadius: '10px',
          color: 'white',
          fontSize: '0.9rem',
          outline: 'none',
        }}
      />
    </label>
  );
}
