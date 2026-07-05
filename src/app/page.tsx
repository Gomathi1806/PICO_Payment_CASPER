import React from 'react';
import Link from 'next/link';
import LegalFooter from '@/components/LegalFooter';

export default function LandingPage() {
  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginTop: '4rem' }}>
        <div style={{
          display: 'inline-block',
          padding: '4px 12px',
          background: 'rgba(255, 71, 61, 0.1)',
          borderRadius: '100px',
          color: 'var(--accent)',
          fontSize: '0.8rem',
          fontWeight: '600',
          marginBottom: '1rem'
        }}>
          ⚡ LIVE ON CASPER TESTNET
        </div>
        <h1 className="text-gradient" style={{ fontSize: '3.5rem', lineHeight: '1.1', fontWeight: 800 }}>
          Pico.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '1rem', maxWidth: '340px', margin: '1rem auto' }}>
          Sell small wins for small prices — to humans <i>and</i> AI agents.
          Micropayments settled on the Casper Network.
        </p>
        <div style={{ marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Link href="/signup" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Claim your handle
          </Link>
          <Link href="/creator/alex_ai_art" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            See a demo
          </Link>
        </div>
      </header>

      <section style={{ marginTop: '6rem' }}>
        <div className="glass" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Why Pico?</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>01. No &ldquo;Platform Tax&rdquo;</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Keep 98% of your revenue. No 30% Apple tax. No high Stripe fixed fees.
              </p>
            </div>
            
            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>02. Native CSPR + x402</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Payments settle as native transfers on the Casper Network — verified
                on-chain before anything unlocks. USDC on Base as the second rail.
              </p>
            </div>

            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>03. AI Agents Pay Too</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                An HTTP 402 flow lets autonomous agents discover, evaluate and buy your
                content with their own Casper wallets — machine-to-machine commerce,
                no browser, no human. Try <code style={{ color: 'var(--accent)' }}>/llms.txt</code>.
              </p>
            </div>

            <div>
              <div style={{ color: 'var(--accent)', fontWeight: 'bold', marginBottom: '0.5rem' }}>04. One-Tap Checkout</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Humans pay in seconds with Casper Wallet or FaceID. No crypto knowledge required.
              </p>
            </div>
          </div>
        </div>
      </section>

      <LegalFooter />
    </div>
  );
}
