'use client';

// ─── Client-side Casper deploy building + wallet bridge ─────
// Runs in the browser only. Builds an unsigned native-transfer deploy
// with casper-js-sdk, hands it to the Casper Wallet extension for
// signing, and returns the signed deploy as JSON for the server
// action to validate and submit (the browser never talks to the node).

import { CLPublicKey, DeployUtil } from 'casper-js-sdk';
import type { CasperNetworkName } from './config';
import { TRANSFER_PAYMENT_MOTES } from './config';

// Minimal typing for the Casper Wallet extension's injected provider.
// https://www.casperwallet.io/develop
interface CasperWalletProviderInstance {
  requestConnection(): Promise<boolean>;
  isConnected(): Promise<boolean>;
  getActivePublicKey(): Promise<string>;
  sign(
    deployJson: string,
    signingPublicKeyHex: string,
  ): Promise<{ cancelled: boolean; signatureHex?: string; signature?: Uint8Array }>;
  disconnectFromSite(): Promise<boolean>;
}

declare global {
  interface Window {
    CasperWalletProvider?: (options?: { timeout?: number }) => CasperWalletProviderInstance;
  }
}

export const isCasperWalletInstalled = (): boolean =>
  typeof window !== 'undefined' && typeof window.CasperWalletProvider === 'function';

export const getCasperWallet = (): CasperWalletProviderInstance => {
  if (!isCasperWalletInstalled()) {
    throw new Error(
      'Casper Wallet extension not found. Install it from casperwallet.io and refresh.',
    );
  }
  return window.CasperWalletProvider!({ timeout: 30 * 60 * 1000 });
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * Builds an unsigned native CSPR transfer deploy from the fan's wallet
 * to the creator. `transferId` is a u64 memo — we derive it from the
 * link so payments are attributable on-chain even outside Pico's DB.
 */
export const buildTransferDeploy = (params: {
  senderPublicKeyHex: string;
  targetPublicKeyHex: string;
  amountMotes: bigint;
  chainName: CasperNetworkName;
  transferId: number;
}): DeployUtil.Deploy => {
  const sender = CLPublicKey.fromHex(params.senderPublicKeyHex);
  const target = CLPublicKey.fromHex(params.targetPublicKeyHex);

  const deployParams = new DeployUtil.DeployParams(
    sender,
    params.chainName,
    1, // gas price tolerance
    30 * 60 * 1000, // 30 min TTL
  );

  const session = DeployUtil.ExecutableDeployItem.newTransfer(
    params.amountMotes.toString(),
    target,
    undefined, // sourcePurse — main purse
    params.transferId,
  );

  const payment = DeployUtil.standardPayment(TRANSFER_PAYMENT_MOTES.toString());

  return DeployUtil.makeDeploy(deployParams, session, payment);
};

/**
 * Full client-side signing round trip: connect the wallet if needed,
 * build the deploy, request a signature, attach it, and return the
 * signed deploy JSON (shape: { deploy: {...} }) plus the sender key.
 */
export const signTransferWithCasperWallet = async (params: {
  targetPublicKeyHex: string;
  amountMotes: bigint;
  chainName: CasperNetworkName;
  transferId: number;
}): Promise<{ signedDeployJson: object; senderPublicKeyHex: string; deployHash: string }> => {
  const wallet = getCasperWallet();

  const connected = await wallet.isConnected().catch(() => false);
  if (!connected) {
    const ok = await wallet.requestConnection();
    if (!ok) throw new Error('Wallet connection was rejected.');
  }

  const senderPublicKeyHex = await wallet.getActivePublicKey();

  const deploy = buildTransferDeploy({
    senderPublicKeyHex,
    targetPublicKeyHex: params.targetPublicKeyHex,
    amountMotes: params.amountMotes,
    chainName: params.chainName,
    transferId: params.transferId,
  });

  const deployJson = DeployUtil.deployToJson(deploy);
  const result = await wallet.sign(JSON.stringify(deployJson), senderPublicKeyHex);
  if (result.cancelled || !result.signatureHex) {
    throw new Error('Signature request was cancelled.');
  }

  const signedDeploy = DeployUtil.setSignature(
    deploy,
    hexToBytes(result.signatureHex),
    CLPublicKey.fromHex(senderPublicKeyHex),
  );

  return {
    signedDeployJson: DeployUtil.deployToJson(signedDeploy),
    senderPublicKeyHex,
    deployHash: bytesToHex(signedDeploy.hash),
  };
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
