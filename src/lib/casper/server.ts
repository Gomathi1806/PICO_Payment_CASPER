import 'server-only';

// ─── Server-side Casper node access + deploy verification ───
// The browser builds and signs deploys but never submits them; every
// deploy passes through here so Pico can validate the target account
// and amount BEFORE relaying to the node, and confirm on-chain
// execution AFTER — the payments table only ever gets rows for
// transfers the node actually executed successfully.

import { CLPublicKey, DeployUtil } from 'casper-js-sdk';
import { getCasperConfig, ROUTER_PAYMENT_MOTES } from './config';

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
// ─── Router-call introspection ──────────────────────────────

export interface RouterCallDetails {
  deployHash: string;
  senderPublicKeyHex: string;
  /** Package hash the deploy targets (lowercased hex) */
  packageHashHex: string;
  entryPoint: string;
  /** Creator account hash the deploy will pay, from the router's `creator` arg */
  creatorAccountHashHex: string;
  /** u64 memo from the router's `link_id` arg — matches native rail's transferId */
  linkId: bigint;
  /** Payment attached to the deploy (paid the transfer + gas) */
  paymentMotes: bigint;
  chainName: string;
}

/**
 * Parses a signed router-call deploy JSON and extracts what the
 * server needs to authorize the unlock. The deploy's own hash is
 * validated by deployFromJson, and the sender's signature covers the
 * body — so once the checks below pass, the router *will* execute
 * exactly this pay(creator, link_id) call with this payment attached.
 */
export function parseRouterDeploy(signedDeployJson: unknown): {
  deploy: DeployUtil.Deploy;
  details: RouterCallDetails;
} {
  const result = DeployUtil.deployFromJson(signedDeployJson as { deploy: unknown });
  if (result.err) throw new Error(`Invalid deploy JSON: ${result.val}`);
  const deploy = result.unwrap();

  if (!deploy.session.isStoredVersionContractByHash()) {
    throw new Error('Deploy is not a versioned stored-contract call.');
  }
  const stored = deploy.session.storedVersionedContractByHash;
  if (!stored) throw new Error('Malformed stored-contract session.');

  const packageHashHex = bytesToHex(stored.hash).toLowerCase();
  const entryPoint = stored.entryPoint;

  const creatorArg = stored.args.args.get('creator');
  const linkIdArg = stored.args.args.get('link_id');
  if (!creatorArg || !linkIdArg) {
    throw new Error('Router call missing creator/link_id args.');
  }

  const creatorRaw = creatorArg as unknown as { value: () => { data: Uint8Array } };
  // CLKey wrapping a CLAccountHash: .value() returns the CLAccountHash whose .data is 32 bytes
  const accountHashBytes = creatorRaw.value().data;
  if (!accountHashBytes || accountHashBytes.length !== 32) {
    throw new Error('Router creator arg is not a 32-byte account hash.');
  }
  const creatorAccountHashHex = bytesToHex(accountHashBytes).toLowerCase();

  const linkId = BigInt(linkIdArg.value().toString());

  // Payment: session gas + attached_value. Native transfer's payment
  // is *just* gas; a router call's payment is gas + the unlock price.
  const paymentSession = deploy.payment;
  if (!paymentSession.isModuleBytes()) {
    throw new Error('Deploy payment is not a standard module-bytes payment.');
  }
  const paymentAmountArg = paymentSession.getArgByName('amount');
  if (!paymentAmountArg) throw new Error('Payment missing amount arg.');
  const paymentMotes = BigInt(paymentAmountArg.value().toString());

  return {
    deploy,
    details: {
      deployHash: bytesToHex(deploy.hash),
      senderPublicKeyHex: deploy.header.account.toHex().toLowerCase(),
      packageHashHex,
      entryPoint,
      creatorAccountHashHex,
      linkId,
      paymentMotes,
      chainName: deploy.header.chainName,
    },
  };
}

/**
 * The router call attaches (unlock price + router gas ceiling) as the
 * standard payment. Reverse that so we can compare the *unlock price*
 * against the link's price the same way we do for native transfers.
 */
export function routerUnlockAmountMotes(paymentMotes: bigint): bigint {
  return paymentMotes > ROUTER_PAYMENT_MOTES
    ? paymentMotes - ROUTER_PAYMENT_MOTES
    : 0n;
}

/** Matches a router `creator` arg (account hash) against the stored public key. */
export function routerCreatorMatches(
  creatorAccountHashHex: string,
  creatorPublicKeyHex: string,
): boolean {
  try {
    const expected = bytesToHex(
      CLPublicKey.fromHex(creatorPublicKeyHex).toAccountHash(),
    ).toLowerCase();
    return creatorAccountHashHex === expected;
  } catch {
    return false;
  }
}

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
