'use server';

// ─── Casper payment rail — server actions ───────────────────
// Mirrors the trust model of the EVM flow but goes further: instead
// of the client self-reporting a txHash (recordPayment), the Casper
// rail submits the signed deploy THROUGH the server, which validates
// the recipient + amount before relaying and only writes a payments
// row once the node reports successful on-chain execution.

import { CLPublicKey } from 'casper-js-sdk';
import { db } from '@/db';
import { payments, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  ACTIVE_CASPER_NETWORK,
  deployExplorerUrl,
  getCasperConfig,
  motesToCspr,
} from '@/lib/casper/config';
import {
  getDeployExecution,
  parseTransferDeploy,
  submitDeploy,
  targetMatchesCreator,
} from '@/lib/casper/server';
import { getCsprUsdRate, minAcceptableMotes, usdToMotes } from '@/lib/casper/price';

// ─── Quote ──────────────────────────────────────────────────

/**
 * Everything the CasperPayButton needs to build a transfer deploy:
 * the creator's Casper key, the price converted to motes at the
 * current CSPR spot rate, and the active network's chain name.
 */
export async function getCasperPaymentInfo(linkId: string) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });
    if (!link) return { success: false as const, error: 'Link not found.' };

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });
    if (!creator?.casperPublicKey) {
      return {
        success: false as const,
        error: 'This creator has not enabled Casper payments yet.',
      };
    }

    const rate = await getCsprUsdRate();
    const priceUsd = Number(link.price);
    const motes = usdToMotes(priceUsd, rate);
    const config = getCasperConfig();

    return {
      success: true as const,
      creatorCasperKey: creator.casperPublicKey,
      priceUsd: link.price,
      amountMotes: motes.toString(),
      amountCspr: motesToCspr(motes),
      rate,
      chainName: config.chainName,
      networkLabel: config.label,
      faucetUrl: config.faucetUrl,
      // u64 transfer memo derived from the link UUID so payments are
      // attributable on-chain: first 12 hex chars → 48-bit int.
      transferId: parseInt(linkId.replace(/-/g, '').slice(0, 12), 16),
    };
  } catch (error) {
    console.error('[pico/casper] quote failed:', error);
    return { success: false as const, error: 'Failed to prepare Casper payment.' };
  }
}

// ─── Submit ─────────────────────────────────────────────────

/**
 * Validates a signed transfer deploy against the link's price and the
 * creator's Casper key, then relays it to the node. Returns the deploy
 * hash immediately — confirmation is polled via confirmCasperPayment
 * so serverless timeouts never strand a payment mid-flight.
 */
export async function submitCasperPayment(linkId: string, signedDeployJson: unknown) {
  try {
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });
    if (!link) return { success: false as const, error: 'Link not found.' };

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });
    if (!creator?.casperPublicKey) {
      return { success: false as const, error: 'Creator has no Casper key.' };
    }

    const { details } = parseTransferDeploy(signedDeployJson);

    if (details.chainName !== ACTIVE_CASPER_NETWORK) {
      return {
        success: false as const,
        error: `Wrong network: deploy targets ${details.chainName}, expected ${ACTIVE_CASPER_NETWORK}.`,
      };
    }
    if (!targetMatchesCreator(details.targetHex, creator.casperPublicKey)) {
      return { success: false as const, error: 'Transfer target is not the creator.' };
    }

    const rate = await getCsprUsdRate();
    const required = minAcceptableMotes(Number(link.price), rate);
    if (details.amountMotes < required) {
      return {
        success: false as const,
        error: `Amount too low: ${motesToCspr(details.amountMotes)} CSPR sent, ${motesToCspr(required)} CSPR required.`,
      };
    }

    const deployHash = await submitDeploy(signedDeployJson);

    return {
      success: true as const,
      deployHash,
      explorerUrl: deployExplorerUrl(deployHash),
    };
  } catch (error) {
    console.error('[pico/casper] submit failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false as const, error: `Payment submission failed: ${message}` };
  }
}

// ─── Confirm ────────────────────────────────────────────────

/**
 * Polled by the client after submission. Re-fetches the deploy FROM
 * THE NODE (never trusting client input for the final grant), checks
 * execution success + recipient + amount, and records the payment.
 * Idempotent: repeat calls after success are no-ops.
 */
export async function confirmCasperPayment(linkId: string, deployHash: string) {
  try {
    const hash = deployHash.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (hash.length !== 64) {
      return { success: false as const, status: 'error' as const, error: 'Bad deploy hash.' };
    }

    // Already recorded? (poll retry or double-click)
    const existing = await db.query.payments.findFirst({
      where: (payments, { and, eq }) => and(
        eq(payments.linkId, linkId),
        eq(payments.txHash, hash),
      ),
    });
    if (existing) {
      return {
        success: true as const,
        status: 'confirmed' as const,
        payerAddress: existing.payerAddress,
      };
    }

    const execution = await getDeployExecution(hash);
    if (!execution.found || !execution.executed) {
      return { success: true as const, status: 'pending' as const };
    }
    if (!execution.success) {
      return {
        success: false as const,
        status: 'failed' as const,
        error: `On-chain execution failed: ${execution.errorMessage ?? 'unknown'}`,
      };
    }

    // Re-verify the executed deploy's contents against the link.
    const link = await db.query.picoLinks.findFirst({
      where: (picoLinks, { eq }) => eq(picoLinks.id, linkId),
    });
    if (!link) return { success: false as const, status: 'error' as const, error: 'Link not found.' };

    const creator = await db.query.users.findFirst({
      where: eq(users.id, link.creatorId),
    });
    if (!creator?.casperPublicKey) {
      return { success: false as const, status: 'error' as const, error: 'Creator has no Casper key.' };
    }

    const { details } = parseTransferDeploy({
      deploy: (execution.deployJson as { deploy?: unknown })?.deploy ?? execution.deployJson,
    });
    if (details.deployHash !== hash) {
      return { success: false as const, status: 'error' as const, error: 'Deploy hash mismatch.' };
    }
    if (!targetMatchesCreator(details.targetHex, creator.casperPublicKey)) {
      return { success: false as const, status: 'error' as const, error: 'Recipient mismatch.' };
    }

    const rate = await getCsprUsdRate();
    if (details.amountMotes < minAcceptableMotes(Number(link.price), rate)) {
      return { success: false as const, status: 'error' as const, error: 'Amount below price.' };
    }

    await db.insert(payments).values({
      linkId,
      txHash: hash,
      payerAddress: details.senderPublicKeyHex,
      amount: link.price,
      chain: ACTIVE_CASPER_NETWORK,
    });

    return {
      success: true as const,
      status: 'confirmed' as const,
      payerAddress: details.senderPublicKeyHex,
    };
  } catch (error) {
    console.error('[pico/casper] confirm failed:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false as const, status: 'error' as const, error: message };
  }
}

// ─── Creator settings ───────────────────────────────────────

/** Saves the creator's Casper payout key after validating the hex. */
export async function saveCasperPublicKey(userId: string, publicKeyHex: string) {
  try {
    const trimmed = publicKeyHex.trim();
    try {
      CLPublicKey.fromHex(trimmed);
    } catch {
      return {
        success: false as const,
        error: 'Invalid Casper public key. It should start with 01 or 02 and be hex.',
      };
    }

    await db.update(users).set({ casperPublicKey: trimmed }).where(eq(users.id, userId));
    return { success: true as const };
  } catch (error) {
    console.error('[pico/casper] key save failed:', error);
    return { success: false as const, error: 'Failed to save Casper key.' };
  }
}
