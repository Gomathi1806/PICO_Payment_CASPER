'use client';

import React, { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

interface Props {
  onUploaded: (blobUrl: string) => void;
  currentUrl?: string;
  disabled?: boolean;
}

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp3,.m4a,.wav,.ogg';

/**
 * Direct browser → Vercel Blob uploader. The file never touches our
 * server — we only mint a short-lived upload token via /api/upload, then
 * @vercel/blob's `upload()` PUTs straight to Blob storage with progress
 * events. On success we hand the public URL back to the parent form.
 *
 * Intentionally minimal: one click, one file, no chunking UI. 50MB files
 * over a 10 Mbps line finish in ~40s which is fine for a single bar.
 */
export default function FileUploader({ onUploaded, currentUrl, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const handlePick = () => {
    if (disabled || progress !== null) return;
    inputRef.current?.click();
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset the input so the same file can be re-selected after an error
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setError(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 50 MB.`);
      return;
    }

    setError(null);
    setProgress(0);

    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
        onUploadProgress: (e) => {
          // Library reports a 0-100 percentage on .percentage
          setProgress(Math.round(e.percentage));
        },
      });

      setUploadedUrl(blob.url);
      onUploaded(blob.url);
      setProgress(null);
    } catch (e) {
      let message = e instanceof Error ? e.message : 'Upload failed';
      // The blob client wraps any /api/upload failure in this generic string —
      // translate it into something a creator can act on.
      if (/failed to retrieve the client token/i.test(message)) {
        message =
          'Could not start the upload — the file storage service rejected the request. ' +
          'Make sure you are logged in, then try again. If it persists, use "Paste URL" instead.';
      }
      setError(message);
      setProgress(null);
    }
  };

  const displayUrl = uploadedUrl || currentUrl || '';

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <button
        type="button"
        onClick={handlePick}
        disabled={disabled || progress !== null}
        className="btn btn-secondary"
        style={{
          width: '100%',
          padding: '0.9rem',
          fontSize: '0.85rem',
          borderStyle: 'dashed',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {progress !== null
          ? `Uploading ${progress}%…`
          : uploadedUrl
            ? '✓ File uploaded — pick a different one to replace'
            : '📎 Upload PDF, image, or audio (max 50 MB)'}
      </button>

      {progress !== null && (
        <div style={{
          height: '4px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '2px',
          marginTop: '0.5rem',
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'var(--accent)',
            transition: 'width 0.2s ease',
          }} />
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          color: '#f87171',
        }}>
          ⚠️ {error}
        </div>
      )}

      {displayUrl && progress === null && (
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          wordBreak: 'break-all',
          padding: '0.5rem 0.75rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '8px',
          border: '1px solid var(--card-border)',
        }}>
          {displayUrl}
        </div>
      )}
    </div>
  );
}
