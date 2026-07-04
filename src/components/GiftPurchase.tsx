'use client';

import React, { useState } from 'react';
import { useAccount, useConnect, useWriteContract, useChainId } from 'wagmi';
import { parseUnits } from 'viem';
import { ERC20_ABI, getUSDCConfig, splitFee, PICO_TREASURY_ADDRESS } from '@/lib/constants';
import { buyGiftCard } from '@/app/actions/giftcards';

/**
 * Fan gift purchase — a fan pays the creator on-chain for N unlocks, then
 * gets a shareable /claim link. Money goes creator-direct (verified
 * server-side); Pico never holds it. Mainnet only (gift verification
 * runs against Base mainnet USDC).
 */
export default function GiftPurchase({
  linkId,
  creatorWallet,
  price,
  linkTitle,
}: {
  linkId: string;
  creatorWallet: string | null;
  price: string;
  linkTitle: string;
}) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();

  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [claimUrl, setClaimUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const usdc = getUSDCConfig(chainId);
  const total = (Number(price) * qty).toFixed(2);

  const handleGift = async () => {
    setError(null);
    if (!creatorWallet) { setError('This creator has no wallet set up yet.'); return; }
    if (chainId !== 8453) { setError('Switch to Base Mainnet to send a gift.'); return; }

    if (!isConnected) {
      const cb = connectors.find((c) => c.id === 'coinbaseWallet' || c.id === 'coinbaseWalletSDK');
      if (!cb) { setError('Wallet provider not found.'); return; }
      try { await connect({ connector: cb }); } catch { setError('Connection cancelled.'); }
      return;
    }
    if (!address) return;

    setBusy(true);
    try {
      const totalUnits = parseUnits(total, usdc.decimals);
      const { fee, creatorAmount } = splitFee(totalUnits, Number(total));
      const treasuryEnabled =
        PICO_TREASURY_ADDRESS !== '0x0000000000000000000000000000000000000000' && fee > 0n;

      // Creator share first — this is the tx we verify server-side.
      // Pico's 5% fee follows as a best-effort second transfer.
      let creatorTx: string;
      if (treasuryEnabled) {
        creatorTx = await writeContractAsync({
          address: usdc.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [creatorWallet as `0x${string}`, creatorAmount],
        });
        try {
          await writeContractAsync({
            address: usdc.address,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [PICO_TREASURY_ADDRESS, fee],
          });
        } catch { /* fee best-effort — creator is already paid */ }
      } else {
        creatorTx = await writeContractAsync({
          address: usdc.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [creatorWallet as `0x${string}`, totalUnits],
        });
      }

      const res = await buyGiftCard({
        scopeType: 'link',
        scopeId: linkId,
        totalValue: total,
        fundingTx: creatorTx,
        funderAddress: address,
      });
      if (res.success && res.claimUrl) {
        const full = `${window.location.origin}${res.claimUrl}`;
        setClaimUrl(full);
        try { await navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
      } else {
        setError(res.error || 'Could not create the gift.');
      }
    } catch {
      setError('Payment was cancelled or failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn btn-secondary"
        style={{ width: '100%', marginTop: '0.6rem', fontSize: '0.8rem', padding: '0.6rem' }}
      >
        🎁 Gift this to a friend
      </button>
    );
  }

  return (
    <div style={{
      marginTop: '0.6rem',
      padding: '1rem',
      border: '1px solid rgba(16,185,129,0.3)',
      background: 'rgba(16,185,129,0.05)',
      borderRadius: '12px',
      textAlign: 'left',
    }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
        🎁 Gift “{linkTitle}”
      </div>

      {claimUrl ? (
        <>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.6rem' }}>
            Done! Share this link — your friend unlocks it free:
          </p>
          <div
            onClick={() => { navigator.clipboard?.writeText(claimUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ fontSize: '0.7rem', fontFamily: 'monospace', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--card-border)', borderRadius: '8px', padding: '0.6rem', wordBreak: 'break-all', cursor: 'pointer' }}
            title="Click to copy"
          >
            {copied ? '✓ Copied!' : claimUrl}
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.7rem' }}>
            You pay the creator now; your friend redeems free. How many unlocks?
          </p>
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.7rem' }}>
            {[1, 3, 5].map((n) => (
              <button
                key={n}
                onClick={() => setQty(n)}
                className="btn btn-secondary"
                style={{
                  flex: 1, padding: '0.5rem', fontSize: '0.8rem',
                  border: qty === n ? '1px solid rgba(16,185,129,0.6)' : '1px solid var(--card-border)',
                  background: qty === n ? 'rgba(16,185,129,0.12)' : 'transparent',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {error && (
            <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '0.6rem' }}>⚠️ {error}</div>
          )}
          <button
            onClick={handleGift}
            disabled={busy}
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.75rem', fontSize: '0.85rem' }}
          >
            {busy ? 'Processing…' : isConnected ? `Gift ${qty} — pay $${total} USDC` : `Connect & gift — $${total}`}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.45rem' }}
          >
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
