'use client';

import React from 'react';
import { detectContent } from '@/lib/contentType';

interface Props {
  url: string;
  linkId: string;
  linkTitle?: string;
}

/**
 * Renders the gated content after a successful payment, picking the
 * right viewer for the URL type (YouTube/Vimeo embed, PDF preview,
 * image, audio player, or a plain link). Always shows the raw URL
 * underneath as a copyable fallback in case the embed fails or the
 * fan wants to save the link.
 */
export default function UnlockedContent({ url, linkId, linkTitle }: Props) {
  const detected = detectContent(url);

  const reportMailto = `mailto:hello@pico.link?subject=${encodeURIComponent(
    `Broken Pico link: ${linkId}`,
  )}&body=${encodeURIComponent(
    `Hi Pico team,\n\nThe content for the link below seems broken or inaccessible:\n\nLink ID: ${linkId}\n${
      linkTitle ? `Title: ${linkTitle}\n` : ''
    }Content URL: ${url}\n\nPlease investigate.\n\nThanks.`,
  )}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {detected.kind === 'youtube' || detected.kind === 'vimeo' ? (
        <div style={{
          position: 'relative',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          height: 0,
          borderRadius: '12px',
          overflow: 'hidden',
          background: '#000',
        }}>
          <iframe
            src={detected.embedSrc}
            title="Unlocked content"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
      ) : null}

      {detected.kind === 'image' ? (
        <a href={detected.href} target="_blank" rel="noopener noreferrer">
          {/* Intentional <img>: this is user-supplied content from
              arbitrary hosts so next/image's domain whitelist would
              reject most legitimate URLs (Drive, Dropbox, S3, etc.). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detected.href}
            alt="Unlocked image"
            style={{ width: '100%', borderRadius: '12px', display: 'block' }}
          />
        </a>
      ) : null}

      {detected.kind === 'audio' ? (
        <audio controls src={detected.href} style={{ width: '100%' }} />
      ) : null}

      {detected.kind === 'pdf' ? (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--card-border)',
          borderRadius: '12px',
          padding: '1.25rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
          <div style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text-muted)' }}>
            PDF unlocked
          </div>
          <a
            href={detected.href}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ display: 'inline-block', padding: '0.6rem 1.2rem', fontSize: '0.85rem', textDecoration: 'none' }}
          >
            Open PDF →
          </a>
        </div>
      ) : null}

      {detected.kind === 'archive' || detected.kind === 'generic' ? (
        <a
          href={detected.href || url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ display: 'block', textAlign: 'center', padding: '0.75rem', fontSize: '0.9rem', textDecoration: 'none' }}
        >
          {detected.kind === 'archive' ? '📦 Download file →' : '🔗 Open link →'}
        </a>
      ) : null}

      {/* Raw URL — copyable fallback, always visible after unlock so the
          fan can save / bookmark / share with their own copy. */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '10px',
        padding: '0.65rem 0.85rem',
        fontSize: '0.7rem',
        wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: 'var(--success)',
      }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontFamily: 'inherit' }}>
          DIRECT LINK (save this)
        </div>
        {url}
      </div>

      <a
        href={reportMailto}
        style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', textDecoration: 'underline' }}
      >
        Report broken link
      </a>
    </div>
  );
}
