import 'server-only';

// ─── Server-side Casper node access + deploy verification ───
// The browser builds and signs deploys but never submits them; every
// deploy passes through here so Pico can validate the target account
// and amount BEFORE relaying to the node, and confirm on-chain
// execution AFTER — the payments table only ever gets rows for
// transfers the node actually executed successfully.

import { CLPublicKey, DeployUtil } from 'casper-js-sdk';
import { getCasperConfig } from './config';

interface RpcEnvelope<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

async function casperRpc<T>(method: string, params: unknown): Promise<T> {
  const { rpcUrl } = getCasperConfig();
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Casper RPC ${method} failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as RpcEnvelope<T>;
  if (json.error) {
    throw new Error(`Casper RPC ${method} error: ${json.error.message}`);
  }
  if (json.result === undefined) {
    throw new Error(`Casper RPC ${method}: empty result`);
  }
  return json.result;
}

// ─── Transfer introspection ─────────────────────────────────

export interface TransferDetails {
  deployHash: string;
  senderPublicKeyHex: string;
  targetHex: string; // public key hex OR account-hash hex, lowercased
  amountMotes: bigint;
  chainName: string;
}

/**
 * Parses a signed deploy JSON ({ deploy: {...} }) and extracts the
 * native-transfer details. Throws if the deploy is not a transfer.
 * deployFromJson re-derives and checks the body/deploy hashes, so the
 * values here are covered by the sender's signature (which the node
 * verifies at submission — an altered deploy can't be executed).
 */
export function parseTransferDeploy(signedDeployJson: unknown): {
  deploy: DeployUtil.Deploy;
  details: TransferDetails;
} {
  const result = DeployUtil.deployFromJson(signedDeployJson as { deploy: unknown });
  if (result.err) {
    throw new Error(`Invalid deploy JSON: ${result.val}`);
  }
  const deploy = result.unwrap();

  if (!deploy.session.isTransfer()) {
    throw new Error('Deploy is not a native transfer.');
  }

  const transfer = deploy.session.asTransfer();
  if (!transfer) throw new Error('Malformed transfer session.');

  const amountArg = transfer.getArgByName('amount');
  const targetArg = transfer.getArgByName('target');
  if (!amountArg || !targetArg) {
    throw new Error('Transfer missing amount/target args.');
  }

  const amountMotes = BigInt(amountArg.value().toString());

  // target is a CLPublicKey on modern SDKs, but older clients encode
  // the recipient as a 32-byte account hash — normalise both to hex.
  let targetHex: string;
  const targetValue = targetArg as unknown as {
    toHex?: () => string;
    value: () => unknown;
  };
  if (typeof targetValue.toHex === 'function') {
    targetHex = targetValue.toHex().toLowerCase();
  } else {
    const raw = targetValue.value();
    targetHex = bytesToHex(raw as Uint8Array).toLowerCase();
  }

  return {
    deploy,
    details: {
      deployHash: bytesToHex(deploy.hash),
      senderPublicKeyHex: deploy.header.account.toHex().toLowerCase(),
      targetHex,
      amountMotes,
      chainName: deploy.header.chainName,
    },
  };
}

/**
 * Checks a transfer's recipient against the creator's stored public
 * key, accepting either public-key-hex or account-hash form.
 */
export function targetMatchesCreator(targetHex: string, creatorPublicKeyHex: string): boolean {
  const creatorKey = creatorPublicKeyHex.toLowerCase();
  if (targetHex === creatorKey) return true;
  try {
    const accountHashHex = bytesToHex(
      CLPublicKey.fromHex(creatorPublicKeyHex).toAccountHash(),
    ).toLowerCase();
    return targetHex === accountHashHex;
  } catch {
    return false;
  }
}

// ─── Node interaction ───────────────────────────────────────

export async function submitDeploy(signedDeployJson: unknown): Promise<string> {
  const payload = signedDeployJson as { deploy: unknown };
  const result = await casperRpc<{ deploy_hash: string }>('account_put_deploy', {
    deploy: payload.deploy,
  });
  return result.deploy_hash.toLowerCase();
}

export interface DeployExecution {
  found: boolean;
  executed: boolean;
  success: boolean;
  errorMessage: string | null;
  /** Raw deploy JSON as returned by the node (for re-verification) */
  deployJson: unknown | null;
}

/**
 * Fetches a deploy and reports its execution state. Handles both the
 * Casper 1.x `execution_results` array and the 2.x `execution_info`
 * envelope (with Version1/Version2 result variants) so the same code
 * works against testnet and mainnet across protocol upgrades.
 */
export async function getDeployExecution(deployHash: string): Promise<DeployExecution> {
  let result: Record<string, unknown>;
  try {
    result = await casperRpc<Record<string, unknown>>('info_get_deploy', {
      deploy_hash: deployHash,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    // "deploy not known" style errors mean not found (yet)
    if (/no such|not found|-32602|fetch|unknown/i.test(message)) {
      return { found: false, executed: false, success: false, errorMessage: null, deployJson: null };
    }
    throw error;
  }

  const deployJson = result.deploy ?? null;

  // Casper 2.x shape
  const execInfo = result.execution_info as
    | { execution_result?: Record<string, unknown> }
    | null
    | undefined;
  if (execInfo?.execution_result) {
    const v2 = execInfo.execution_result.Version2 as { error_message?: string | null } | undefined;
    if (v2) {
      const err = v2.error_message ?? null;
      return { found: true, executed: true, success: !err, errorMessage: err, deployJson };
    }
    const v1 = execInfo.execution_result.Version1 as
      | { Success?: unknown; Failure?: { error_message?: string } }
      | undefined;
    if (v1) {
      const failed = !!v1.Failure;
      return {
        found: true,
        executed: true,
        success: !failed,
        errorMessage: failed ? v1.Failure?.error_message ?? 'execution failed' : null,
        deployJson,
      };
    }
  }

  // Casper 1.x shape
  const execResults = result.execution_results as
    | Array<{ result?: { Success?: unknown; Failure?: { error_message?: string } } }>
    | undefined;
  if (execResults && execResults.length > 0) {
    const r = execResults[0]?.result;
    const failed = !!r?.Failure;
    return {
      found: true,
      executed: true,
      success: !failed,
      errorMessage: failed ? r?.Failure?.error_message ?? 'execution failed' : null,
      deployJson,
    };
  }

  // Known to the node but not yet in a block
  return { found: true, executed: false, success: false, errorMessage: null, deployJson };
}

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
