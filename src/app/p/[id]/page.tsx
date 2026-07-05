'use client';

import React, { useState, useEffect, use } from 'react';
import { useConnect, useWriteContract, useAccount, useReadContract, useChainId, useSwitchChain, useDisconnect, useSendCalls } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { getPicoLinkById, getCreatorWalletByLinkId, recordPayment, getUnlockedContent } from '@/app/actions/pico';
import { getCreditEligibility, redeemFreeUnlock } from '@/app/actions/giftcards';
import GiftPurchase from '@/components/GiftPurchase';
import { isInAppBrowser, getBrowserName } from '@/lib/utils/browser';
import { ERC20_ABI, getUSDCConfig, PICO_TREASURY_ADDRESS, splitFee } from '@/lib/constants';
import { PicoLink } from '@/db/schema';
import TransakWidget from '@/components/TransakWidget';
import UnlockedContent from '@/components/UnlockedContent';
import CasperPayButton from '@/components/CasperPayButton';

export default function PublicLinkPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const id = params.id;

  const [link, setLink] = useState<PicoLink | null>(null);
  const [creatorWallet, setCreatorWallet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isIAB, setIsIAB] = useState(false);
  const [browserName, setBrowserName] = useState('');
  const [step, setStep] = useState<'idle' | 'connecting' | 'paying' | 'done'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [showFundCard, setShowFundCard] = useState(false);
  const [freeUnlockEligible, setFreeUnlockEligible] = useState(false);
  const [redeemingFree, setRedeemingFree] = useState(false);

  const { address, isConnected, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const { sendCallsAsync } = useSendCalls();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Get active USDC configuration (Mainnet or Sepolia)
  const usdcConfig = getUSDCConfig(chainId);

  // Read actual USDC balance of the payer
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: usdcConfig.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const parsedBalance = balance ? Number(balance) / 10 ** usdcConfig.decimals : 0;
  const isBalanceSufficient = link ? parsedBalance >= Number(link.price) : false;

  // Auto-disconnect any non-Coinbase connector (like MetaMask or Rabby)
  // to force the Coinbase Smart Wallet (FaceID/Passkey popup) flow.
  useEffect(() => {
    if (isConnected && connector && connector.id !== 'coinbaseWallet' && connector.id !== 'coinbaseWalletSDK') {
      console.log('Disconnecting non-Coinbase connector:', connector.id);
      disconnect();
    }
  }, [isConnected, connector, disconnect]);

  useEffect(() => {
    setTimeout(() => {
      setIsIAB(isInAppBrowser());
      setBrowserName(getBrowserName());
    }, 0);

    const fetchLink = async () => {
      try {
        const result = await getPicoLinkById(id);
        if (result.success && result.link) {
          setLink(result.link as any); // Cast because of Date serialization

          // Fetch creator's wallet address
          const walletResult = await getCreatorWalletByLinkId(id);
          if (walletResult.success && walletResult.walletAddress) {
            setCreatorWallet(walletResult.walletAddress);
          }
        }
      } catch (err) {
        console.error('Error fetching Pico Link:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLink();
  }, [id]);

  // Once connected after user tapped "Pay", execute transaction ONLY if balance is sufficient.
  // Otherwise drop the user into the "add funds" state instead of opening the wallet to fail.
  useEffect(() => {
    if (isConnected && step === 'connecting') {
      if (isBalanceSufficient) {
        executePay();
      } else {
        setStep('idle');
        setIsProcessing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, step, isBalanceSufficient]);

  const executePay = async () => {
    if (!link || !creatorWallet) return;
    setStep('paying');
    setIsProcessing(true);
    setErrorMessage(null);

    // Refresh balance in background
    refetchBalance();

    try {
      // Convert price to USDC base units, then split 95/5 between creator and Pico treasury.
      const usdcAmount = parseUnits(link.price, usdcConfig.decimals);
      const { fee, creatorAmount } = splitFee(usdcAmount, Number(link.price));
      const treasuryEnabled = PICO_TREASURY_ADDRESS !== '0x0000000000000000000000000000000000000000' && fee > 0n;

      let tx: string;

      if (treasuryEnabled) {
        // Batched: one FaceID, two atomic transfers (creator + Pico fee).
        // Coinbase Smart Wallet supports EIP-5792 wallet_sendCalls natively.
        try {
          const result = await sendCallsAsync({
            calls: [
              {
                to: usdcConfig.address,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: 'transfer',
                  args: [creatorWallet as `0x${string}`, creatorAmount],
                }),
              },
              {
                to: usdcConfig.address,
                data: encodeFunctionData({
                  abi: ERC20_ABI,
                  functionName: 'transfer',
                  args: [PICO_TREASURY_ADDRESS, fee],
                }),
              },
            ],
          });
          tx = typeof result === 'string' ? result : (result as { id: string }).id;
        } catch (batchErr) {
          console.warn('Batched call failed, falling back to sequential transfers:', batchErr);
          await writeContractAsync({
            address: usdcConfig.address,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [creatorWallet as `0x${string}`, creatorAmount],
          });
          tx = await writeContractAsync({
            address: usdcConfig.address,
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [PICO_TREASURY_ADDRESS, fee],
          });
        }
      } else {
        // No treasury configured — send full amount to creator (dev mode).
        tx = await writeContractAsync({
          address: usdcConfig.address,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [creatorWallet as `0x${string}`, usdcAmount],
        });
      }

      console.log('Transaction success:', tx);

      // Record the payment in our database
      await recordPayment({
        linkId: link.id,
        txHash: tx,
        payerAddress: address || 'unknown',
        amount: link.price,
      });

      setIsPaid(true);
      setStep('done');

      // Fetch the gated content URL — only returned by the server if
      // the payment record matches the tx hash + payer address.
      try {
        const unlocked = await getUnlockedContent(
          link.id,
          tx,
          address || 'unknown',
        );
        if (unlocked.success && unlocked.contentUrl) {
          setUnlockedUrl(unlocked.contentUrl);
        }
      } catch (e) {
        console.error('Could not fetch unlocked content:', e);
      }

      // If this checkout was opened from a publisher's embed.js paywall,
      // notify the parent window so it can reveal the gated content and
      // optionally auto-close the popup after a short success display.
      try {
        if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
          window.opener.postMessage(
            { type: 'pico:unlock', linkId: link.id, txHash: tx },
            '*'
          );
          setTimeout(() => {
            try { window.close(); } catch { /* ignore */ }
          }, 2500);
        }
      } catch {
        /* postMessage failed — non-fatal, user still sees success UI */
      }
    } catch (error: unknown) {
      console.error('Payment failed:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (errorMsg.includes('User rejected') || errorMsg.includes('denied')) {
        setErrorMessage('Payment was cancelled. Tap the button to try again.');
      } else if (errorMsg.includes('insufficient') || errorMsg.includes('exceeds balance')) {
        setErrorMessage('Insufficient USDC balance. Please fund your wallet and try again.');
      } else {
        setErrorMessage('Payment failed. Please check your wallet network/balance and try again.');
      }
      setStep('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  // Success handler for the Casper rail. The server action has already
  // verified the transfer on-chain and inserted the payments row, so
  // this mirrors the tail of executePay: flip the UI, fetch the gated
  // content, and notify a publisher embed opener if there is one.
  const handleCasperPaid = async (txHash: string, payerAddress: string) => {
    if (!link) return;
    setIsPaid(true);
    setStep('done');

    try {
      const unlocked = await getUnlockedContent(link.id, txHash, payerAddress);
      if (unlocked.success && unlocked.contentUrl) {
        setUnlockedUrl(unlocked.contentUrl);
      }
    } catch (e) {
      console.error('Could not fetch unlocked content:', e);
    }

    try {
      if (typeof window !== 'undefined' && window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { type: 'pico:unlock', linkId: link.id, txHash },
          '*'
        );
        setTimeout(() => {
          try { window.close(); } catch { /* ignore */ }
        }, 2500);
      }
    } catch {
      /* postMessage failed — non-fatal, user still sees success UI */
    }
  };

  const handlePayAndUnlock = async () => {
    if (!link) return;
    setErrorMessage(null);

    // Check if creator has a wallet connected
    if (!creatorWallet) {
      setErrorMessage('This creator hasn\'t set up payments yet. Please try again later.');
      return;
    }

    // Only use Coinbase Smart Wallet
    const cbConnector = connectors.find(
      (c) => c.id === 'coinbaseWallet' || c.id === 'coinbaseWalletSDK'
    );

    if (!cbConnector) {
      setErrorMessage('Wallet provider not found. Please refresh or try another browser.');
      return;
    }

    if (!isConnected) {
      setStep('connecting');
      setIsProcessing(true);
      try {
        await connect({ connector: cbConnector });
      } catch {
        setErrorMessage('Wallet connection was cancelled. Please try again.');
        setStep('idle');
        setIsProcessing(false);
      }
      return;
    }

    // Block the loop: if balance is too low, route to fund flow instead of opening
    // the wallet only for it to reject with "insufficient funds".
    if (!isBalanceSufficient) {
      setShowFundCard(true);
      return;
    }

    await executePay();
  };

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    await refetchBalance();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Check the Pico-funded "free first unlock" eligibility once we know
  // the wallet address. Independent of balance — additive to the pay flow.
  useEffect(() => {
    if (!address) {
      setFreeUnlockEligible(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { freeFirstUnlock } = await getCreditEligibility(address, link?.id);
      if (!cancelled) setFreeUnlockEligible(freeFirstUnlock);
    })();
    return () => { cancelled = true; };
  }, [address, link?.id]);

  // Redeem the free first unlock (welcome voucher). Connects the wallet
  // first if needed, then grants access without any payment.
  const handleFreeUnlock = async () => {
    if (!link) return;
    setErrorMessage(null);

    if (!isConnected) {
      const cbConnector = connectors.find(
        (c) => c.id === 'coinbaseWallet' || c.id === 'coinbaseWalletSDK',
      );
      if (!cbConnector) {
        setErrorMessage('Wallet provider not found. Please refresh or try another browser.');
        return;
      }
      try {
        await connect({ connector: cbConnector });
      } catch {
        setErrorMessage('Wallet connection was cancelled. Please try again.');
      }
      return; // eligibility effect re-runs once connected; user taps again
    }

    if (!address) return;
    setRedeemingFree(true);
    try {
      const res = await redeemFreeUnlock({ linkId: link.id, redeemerAddress: address });
      if (res.success) {
        setIsPaid(true);
        setStep('done');
        setFreeUnlockEligible(false);
        if (res.contentUrl) setUnlockedUrl(res.contentUrl);
      } else {
        setErrorMessage(res.error || 'Could not unlock. Please try again.');
      }
    } catch {
      setErrorMessage('Could not unlock. Please try again.');
    } finally {
      setRedeemingFree(false);
    }
  };

  // Open the funding flow: Transak on mainnet, Circle faucet on testnet.
  const handlePreFund = () => {
    if (chainId === 84532) {
      window.open('https://faucet.circle.com/', '_blank');
      return;
    }
    setShowFundCard(true);
  };


  if (loading) return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Loading Pico...</div>;
  if (!link) return <div style={{ textAlign: 'center', padding: '10rem 0' }}>Link not found.</div>;

  const buttonLabel = () => {
    if (isProcessing && step === 'connecting') return 'Opening wallet...';
    if (isProcessing && step === 'paying') return 'Confirming payment...';
    if (!isConnected) return `🔒 Unlock with FaceID — $${link.price} USDC`;
    if (!isBalanceSufficient) return `💳 Add Funds to Pay $${link.price}`;
    if (isIAB) return `🔒 Secure One-Click Pay — $${link.price}`;
    return `✅ Pay $${link.price} USDC`;
  };

  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: 800 }}>Pico.</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
          Instant content unlocks — no account needed
        </p>
      </header>

      <div className="glass" style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{
          fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--accent)',
          marginBottom: '1rem', letterSpacing: '0.1em'
        }}>
          {link.type || 'DIGITAL CONTENT'}
        </div>

        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>{link.title}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {link.description}
        </p>

        <div style={{
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--card-border)',
          borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem'
        }}>
          {isPaid ? (
            <div style={{ color: 'var(--success)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎉</div>
              <h3 style={{ marginBottom: '0.5rem' }}>Payment Successful!</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                You have unlocked this content.
              </p>
              {unlockedUrl ? (
                <UnlockedContent url={unlockedUrl} linkId={link.id} linkTitle={link.title} />
              ) : (
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '12px', padding: '1rem',
                  color: 'var(--text-muted)', fontSize: '0.85rem',
                }}>
                  Fetching your content…
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                    ${link.price} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>USDC</span>
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Network: <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{usdcConfig.name}</span>
                  </div>
                </div>

                {isConnected && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      Balance: 
                      <span 
                        onClick={handleRefreshBalance} 
                        style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--accent)', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}
                        title="Click to refresh balance"
                      >
                        🔄
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: isBalanceSufficient ? 'var(--success)' : '#f87171'
                    }}>
                      {parsedBalance.toFixed(2)} USDC
                    </div>
                  </div>
                )}
              </div>

              {/* Welcome voucher — Pico-funded free first unlock. Additive:
                  appears only when eligible; the pay + Transak flows are
                  untouched and remain available below. */}
              {freeUnlockEligible && !showFundCard && (
                <div style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  background: 'rgba(16,185,129,0.06)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  borderRadius: '12px',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    🎁 Your first unlock is on us
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 0.7rem' }}>
                    Welcome to Pico — unlock this one free, no payment needed. After that, top up once and unlock anything.
                  </p>
                  <button
                    onClick={handleFreeUnlock}
                    disabled={redeemingFree}
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.85rem', fontSize: '0.9rem' }}
                  >
                    {redeemingFree
                      ? 'Unlocking…'
                      : isConnected
                        ? '🎁 Unlock free'
                        : '🎁 Unlock free with FaceID'}
                  </button>
                </div>
              )}

              {/* Inline Transak on-ramp (card / Apple Pay / Open Banking) */}
              {isConnected && !isBalanceSufficient && chainId !== 84532 && showFundCard && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <TransakWidget
                    mode="BUY"
                    walletAddress={address}
                    fiatCurrency="GBP"
                    defaultAmount={Math.max(Number(link.price), 15).toFixed(2)}
                    onClose={() => { refetchBalance(); setShowFundCard(false); }}
                    onOrderSuccess={() => { refetchBalance(); setShowFundCard(false); }}
                  />
                  <button
                    onClick={() => setShowFundCard(false)}
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.78rem', padding: '0.5rem' }}
                  >
                    ← Back
                  </button>
                </div>
              )}

              {/* No USDC? Guidance: fund via Transak, or buy cheaper on
                  Coinbase.com and reuse the balance across Pico links. */}
              {isConnected && !isBalanceSufficient && chainId !== 84532 && !showFundCard && (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'white', marginBottom: '0.5rem' }}>
                    💡 You need {link.price} USDC on Base
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '0.75rem' }}>
                    Buy USDC on <b style={{ color: 'white' }}>Coinbase.com</b> (from £2, no minimum), then send it to your Coinbase Smart Wallet below. The leftover balance works on any future Pico link — no repeat top-ups needed.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <button
                      onClick={handlePreFund}
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '0.65rem', fontSize: '0.78rem' }}
                    >
                      💳 Add funds — card, Apple Pay or bank
                    </button>
                    <a
                      href="https://www.coinbase.com/price/usd-coin"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '0.65rem', fontSize: '0.78rem', textDecoration: 'none', textAlign: 'center' }}
                    >
                      🔗 Or buy cheaper on Coinbase.com →
                    </a>
                    <button
                      onClick={handleRefreshBalance}
                      className="btn btn-secondary"
                      style={{ width: '100%', padding: '0.65rem', fontSize: '0.78rem' }}
                    >
                      {isRefreshing ? 'Checking…' : '🔄 I\'ve topped up — refresh balance'}
                    </button>
                  </div>
                  {address && (
                    <div style={{
                      marginTop: '0.6rem',
                      fontSize: '0.62rem',
                      fontFamily: 'monospace',
                      color: 'var(--text-muted)',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--card-border)',
                      borderRadius: '6px',
                      padding: '0.4rem 0.6rem',
                      wordBreak: 'break-all',
                    }}>
                      Your wallet: {address}
                    </div>
                  )}
                </div>
              )}

              {/* Testnet faucet */}
              {isConnected && !isBalanceSufficient && chainId === 84532 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ width: '100%', padding: '0.75rem', fontSize: '0.8rem', textDecoration: 'none', display: 'block', textAlign: 'center' }}
                  >
                    🔗 Get free testnet USDC from Circle Faucet
                  </a>
                </div>
              )}

              {/* Error message */}
              {errorMessage && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.8rem',
                  color: '#f87171',
                  textAlign: 'left',
                }}>
                  ⚠️ {errorMessage}
                </div>
              )}

              {/* Network Switcher for Localhost Testing */}
              {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
                <div style={{
                  background: 'rgba(59, 130, 246, 0.05)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  borderRadius: '12px',
                  padding: '0.75rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.75rem',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--accent)' }}>🛠️ Developer Test Tools (Localhost Only)</div>
                  <div>
                    Toggle network to test without real funds:
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => switchChain({ chainId: 8453 })}
                      className="btn"
                      style={{
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.7rem',
                        background: chainId === 8453 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Base Mainnet
                    </button>
                    <button
                      onClick={() => switchChain({ chainId: 84532 })}
                      className="btn"
                      style={{
                        padding: '0.3rem 0.6rem',
                        fontSize: '0.7rem',
                        background: chainId === 84532 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(59,130,246,0.3)',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Base Sepolia (Testnet)
                    </button>
                  </div>
                  {chainId === 84532 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                      Get free testnet USDC: <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Circle Faucet</a>
                    </div>
                  )}
                </div>
              )}

              {/* PRIMARY CTA — native CSPR on Casper via Casper Wallet.
                  Renders its own errors/install hints; unlock path
                  converges on handleCasperPaid → getUnlockedContent. */}
              {!showFundCard && (
                <CasperPayButton
                  linkId={link.id}
                  price={link.price}
                  onPaid={handleCasperPaid}
                />
              )}

              {/* Second rail — USDC on Base (Coinbase Smart Wallet).
                  Hidden while the fund widget is open. */}
              {!showFundCard && (
              <button
                  className="btn btn-secondary"
                  style={{ width: '100%', fontSize: '0.9rem', padding: '0.85rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={isConnected && !isBalanceSufficient ? handlePreFund : handlePayAndUnlock}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                      {buttonLabel()}
                    </>
                  ) : buttonLabel()}
                </button>
              )}

              {/* Trust badges */}
              <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>⚡ CSPR settles on the Casper Network · USDC via Coinbase Smart Wallet</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🔐 Authenticate with FaceID or fingerprint</span>
                </div>
                {isIAB && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }}></div>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Verified {browserName} Checkout</span>
                  </div>
                )}
              </div>

              {/* Gift to a friend — fan pays creator, friend redeems free */}
              {!showFundCard && (
                <GiftPurchase
                  linkId={link.id}
                  creatorWallet={creatorWallet}
                  price={link.price}
                  linkTitle={link.title}
                />
              )}
            </div>
          )}
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
          Secured by Base &amp; Casper Networks &amp; X402 Protocol
        </p>
      </div>

      <footer style={{ textAlign: 'center', marginTop: '4rem', paddingBottom: '2rem' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          &copy; 2026 Pico Micropayments
        </p>
      </footer>
    </div>
  );
}
