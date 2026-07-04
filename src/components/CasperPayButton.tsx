'use client';

import React, { useState } from 'react';
import {
  confirmCasperPayment,
  getCasperPaymentInfo,
  submitCasperPayment,
} from '@/app/actions/casper';

/**
 * "Pay with Casper" — the CSPR rail's checkout button, rendered under
 * the primary USDC CTA on /p/[id]. Self-contained state machine:
 *
 *   idle → quoting → signing → submitting → confirming → done
 *
 * The deploy is built + signed in the browser via the Casper Wallet
 * extension (lazy-imported so casper-js-sdk stays out of the initial
 * bundle), relayed through a server action that validates recipient
 * and amount, then polled until the node confirms execution. Only
 * after on-chain success does the parent get onPaid() to unlock.
 */

type Step = 'idle' | 'quoting' | 'signing' | 'submitting' | 'confirming' | 'done';

const POLL_INTERVAL_MS = 6_000;
const POLL_TIMEOUT_MS = 4 * 60_000; // Casper blocks land well within this

export default function CasperPayButton(props: {
  linkId: string;
  price: string; // USD, e.g. "0.25"
  onPaid: (txHash: string, payerAddress: string) => void | Promise<void>;
}) {
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ amountCspr: string; networkLabel: string } | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [needsWallet, setNeedsWallet] = useState(false);

  const busy = step !== 'idle' && step !== 'done';

  const handlePay = async () => {
    setError(null);
    setNeedsWallet(false);

    try {
      // Lazy-load the SDK-heavy client module only when the fan
      // actually chooses the Casper rail.
      const { isCasperWalletInstalled, signTransferWithCasperWallet } = await import(
        '@/lib/casper/deploy'
      );

      if (!isCasperWalletInstalled()) {
        setNeedsWallet(true);
        return;
      }

      setStep('quoting');
      const info = await getCasperPaymentInfo(props.linkId);
      if (!info.success) {
        throw new Error(info.error);
      }
      setQuote({ amountCspr: info.amountCspr, networkLabel: info.networkLabel });

      setStep('signing');
      const { signedDeployJson, senderPublicKeyHex } = await signTransferWithCasperWallet({
        targetPublicKeyHex: info.creatorCasperKey,
        amountMotes: BigInt(info.amountMotes),
        chainName: info.chainName,
        transferId: info.transferId,
      });

      setStep('submitting');
      const submitted = await submitCasperPayment(props.linkId, signedDeployJson);
      if (!submitted.success) {
        throw new Error(submitted.error);
      }
      setExplorerUrl(submitted.explorerUrl);

      setStep('confirming');
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const result = await confirmCasperPayment(props.linkId, submitted.deployHash);
        if (result.success && result.status === 'confirmed') {
          setStep('done');
          await props.onPaid(submitted.deployHash, result.payerAddress ?? senderPublicKeyHex);
          return;
        }
        if (!result.success) {
          throw new Error(result.error ?? 'Payment failed on-chain.');
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      throw new Error(
        'Confirmation timed out. If the transfer went through, refresh this page in a minute.',
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Payment failed.';
      setError(
        /cancelled|rejected/i.test(message)
          ? 'Payment was cancelled. Tap the button to try again.'
          : message,
      );
      setStep('idle');
    }
  };

  const label = () => {
    switch (step) {
      case 'quoting':
        return 'Fetching CSPR price…';
      case 'signing':
        return 'Confirm in Casper Wallet…';
      case 'submitting':
        return 'Broadcasting transfer…';
      case 'confirming':
        return `Confirming on ${quote?.networkLabel ?? 'Casper'}…`;
      case 'done':
        return '✓ Paid with CSPR';
      default:
        return quote
          ? `Pay ${quote.amountCspr} CSPR`
          : '⚡ Pay with Casper (CSPR)';
    }
  };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button
        className="btn btn-secondary"
        style={{
          width: '100%',
          padding: '0.85rem',
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          opacity: busy ? 0.75 : 1,
        }}
        onClick={handlePay}
        disabled={busy || step === 'done'}
      >
        {busy && (
          <div
            style={{
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTop: '2px solid white',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        )}
        {label()}
      </button>

      {step === 'confirming' && explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            marginTop: '0.4rem',
            fontSize: '0.68rem',
            color: 'var(--accent)',
            textDecoration: 'underline',
          }}
        >
          Track the transfer on CSPR.live →
        </a>
      )}

      {needsWallet && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            textAlign: 'left',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--card-border)',
            borderRadius: '8px',
            padding: '0.6rem 0.8rem',
          }}
        >
          Casper Wallet extension not detected.{' '}
          <a
            href="https://www.casperwallet.io/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
          >
            Install Casper Wallet
          </a>{' '}
          and refresh to pay with CSPR.
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: '0.5rem',
            fontSize: '0.72rem',
            color: '#f87171',
            textAlign: 'left',
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
