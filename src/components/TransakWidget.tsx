'use client';

import React, { useEffect, useRef, useCallback } from 'react';

type Mode = 'BUY' | 'SELL';

interface Props {
  mode: Mode;
  walletAddress?: string;
  fiatCurrency?: string;
  defaultAmount?: string;
  onClose?: () => void;
  onOrderSuccess?: (orderId: string) => void;
}

function openPopup(url: string): Window | null {
  const w = 450;
  const h = 700;
  const left = Math.max(0, (window.screen.width - w) / 2 + window.screenX);
  const top = Math.max(0, (window.screen.height - h) / 2 + window.screenY);
  return window.open(
    url,
    'transak_widget',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
  );
}

async function fetchWidgetUrl(
  mode: Mode,
  walletAddress: string | undefined,
  fiatCurrency: string,
  defaultAmount: string | undefined,
): Promise<string> {
  const res = await fetch('/api/transak/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode,
      walletAddress,
      fiatCurrency,
      defaultAmount,
      referrerDomain: window.location.hostname,
    }),
  });
  if (!res.ok) {
    const { error } = await res.json() as { error?: string };
    throw new Error(error ?? `Session API error ${res.status}`);
  }
  const { widgetUrl } = await res.json() as { widgetUrl: string };
  return widgetUrl;
}

export default function TransakWidget({
  mode,
  walletAddress,
  fiatCurrency = 'GBP',
  defaultAmount,
  onClose,
  onOrderSuccess,
}: Props) {
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const widgetUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
  }, []);

  const openWidget = useCallback(async () => {
    try {
      // Reuse the same widgetUrl if we already fetched one (single-use per Transak)
      // For reopening we need a fresh one.
      const url = await fetchWidgetUrl(mode, walletAddress, fiatCurrency, defaultAmount);
      widgetUrlRef.current = url;

      const popup = openPopup(url);
      if (!popup) {
        window.open(url, '_blank');
        onClose?.();
        return;
      }
      popupRef.current = popup;

      // Poll for manual close
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (popupRef.current?.closed) {
          cleanup();
          onClose?.();
        }
      }, 1000);
    } catch (err) {
      console.error('[TransakWidget] failed to open:', err);
    }
  }, [mode, walletAddress, fiatCurrency, defaultAmount, onClose, cleanup]);

  // postMessage listener for order events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!String(event.origin).includes('transak.com')) return;
      const { event_id, data } = (event.data ?? {}) as {
        event_id?: string;
        data?: { status?: { id?: string } };
      };
      if (event_id === 'TRANSAK_ORDER_SUCCESSFUL') {
        onOrderSuccess?.(data?.status?.id ?? '');
        cleanup();
        onClose?.();
      }
      if (event_id === 'TRANSAK_WIDGET_CLOSE') {
        cleanup();
        onClose?.();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onOrderSuccess, onClose, cleanup]);

  // Open on mount
  useEffect(() => {
    openWidget();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      padding: '1.5rem',
      background: 'rgba(59,130,246,0.06)',
      border: '1px solid rgba(59,130,246,0.25)',
      borderRadius: '12px',
      textAlign: 'center',
      fontSize: '0.85rem',
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.6rem' }}>
        {mode === 'SELL' ? '🏦' : '💳'}
      </div>
      <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
        {mode === 'SELL' ? 'Transak cash-out window opened' : 'Transak buy window opened'}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.5 }}>
        Complete your {mode === 'SELL' ? 'withdrawal' : 'purchase'} in the Transak window.
        <br />If it didn&apos;t open, check your popup blocker.
      </div>
      <button
        type="button"
        onClick={openWidget}
        className="btn btn-secondary"
        style={{ marginTop: '0.85rem', fontSize: '0.78rem', padding: '0.45rem 1rem' }}
      >
        Reopen window
      </button>
    </div>
  );
}
