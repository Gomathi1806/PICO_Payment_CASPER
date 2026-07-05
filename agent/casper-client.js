// ─── Shared Casper client for the Pico agents ───────────────
// Standalone CommonJS (runs with plain `node`, no build step) so the
// buyer CLI and the MCP server can sign and submit transfers without
// touching the Next.js app — the agents are just another customer of
// the public HTTP 402 endpoints.

const fs = require('fs');
const path = require('path');
const { CLPublicKey, DeployUtil, Keys } = require('casper-js-sdk');

const RPC_BY_NETWORK = {
  'casper-test': 'https://node.testnet.casper.network/rpc',
  casper: 'https://node.mainnet.casper.network/rpc',
};

const EXPLORER_BY_NETWORK = {
  'casper-test': 'https://testnet.cspr.live',
  casper: 'https://cspr.live',
};

const TRANSFER_GAS_MOTES = 100000000n; // 0.1 CSPR
const MOTES_PER_CSPR = 1000000000n;

function rpcUrlFor(network) {
  return process.env.CASPER_RPC_URL || RPC_BY_NETWORK[network] || RPC_BY_NETWORK['casper-test'];
}

function explorerFor(network) {
  return EXPLORER_BY_NETWORK[network] || EXPLORER_BY_NETWORK['casper-test'];
}

async function rpc(network, method, params) {
  const res = await fetch(rpcUrlFor(network), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${method}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message} ${json.error.data ?? ''}`);
  return json.result;
}

// ─── Keys ───────────────────────────────────────────────────

const DEFAULT_KEY_PATH = path.join(__dirname, 'keys', 'agent-secret.pem');

function keyPath() {
  return process.env.CASPER_AGENT_KEY_PATH || DEFAULT_KEY_PATH;
}

function loadKeys() {
  const p = keyPath();
  if (!fs.existsSync(p)) {
    throw new Error(
      `No agent key at ${p}. Run \`npm run agent:keygen\` first, then fund the printed account at the faucet.`,
    );
  }
  return Keys.Ed25519.loadKeyPairFromPrivateFile(p);
}

function generateKeys() {
  const p = keyPath();
  if (fs.existsSync(p)) {
    throw new Error(`Refusing to overwrite existing key at ${p}. Delete it first if you really mean to.`);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const kp = Keys.Ed25519.new();
  fs.writeFileSync(p, kp.exportPrivateKeyInPem(), { mode: 0o600 });
  return { publicKeyHex: kp.publicKey.toHex(), path: p };
}

// ─── Wallet ─────────────────────────────────────────────────

async function getBalanceMotes(network, publicKeyHex) {
  try {
    const result = await rpc(network, 'query_balance', {
      purse_identifier: { main_purse_under_public_key: publicKeyHex },
    });
    return BigInt(result.balance);
  } catch (e) {
    // A never-funded account has no purse yet — that's a zero balance,
    // not an error; callers show the faucet hint.
    if (/purse.*not found|Purse not found/i.test(e.message)) return 0n;
    throw e;
  }
}

function motesToCspr(motes) {
  const whole = motes / MOTES_PER_CSPR;
  const frac = (motes % MOTES_PER_CSPR).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// ─── Pay ────────────────────────────────────────────────────

/**
 * Signs and broadcasts a native transfer matching a Pico 402 quote:
 * { payTo, amountMotes, transferId, network }. Returns the deploy hash.
 */
async function payQuote(keys, quote) {
  const { payTo, amountMotes, transferId, network } = quote;

  const deployParams = new DeployUtil.DeployParams(keys.publicKey, network, 1, 30 * 60 * 1000);
  const session = DeployUtil.ExecutableDeployItem.newTransfer(
    amountMotes,
    CLPublicKey.fromHex(payTo),
    undefined,
    transferId,
  );
  const payment = DeployUtil.standardPayment(TRANSFER_GAS_MOTES.toString());
  const deploy = DeployUtil.signDeploy(DeployUtil.makeDeploy(deployParams, session, payment), keys);

  const json = DeployUtil.deployToJson(deploy);
  const result = await rpc(network, 'account_put_deploy', { deploy: json.deploy });
  return result.deploy_hash.toLowerCase();
}

/**
 * Polls a Pico payment endpoint with the deploy hash until the server
 * verifies the transfer on-chain and releases the content (or fails).
 */
async function redeemContent(baseUrl, paymentEndpoint, deployHash, { timeoutMs = 240000, intervalMs = 6000 } = {}) {
  const url = new URL(paymentEndpoint, baseUrl).toString();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(url, { headers: { 'X-Casper-Deploy-Hash': deployHash } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 200) return body;
    if (res.status === 402 && (body.pending || /not found|not executed|retry/i.test(body.error ?? ''))) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }
    throw new Error(body.error || `Unexpected status ${res.status}`);
  }
  throw new Error('Timed out waiting for on-chain confirmation.');
}

/** Fetches a 402 quote from a Pico payment endpoint. */
async function getQuote(baseUrl, paymentEndpoint) {
  const url = new URL(paymentEndpoint, baseUrl).toString();
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (res.status === 200) return { alreadyUnlocked: true, content: body };
  if (res.status !== 402 || !body.accepts?.[0]) {
    throw new Error(body.error || `Expected 402 quote, got ${res.status}`);
  }
  const a = body.accepts[0];
  return {
    alreadyUnlocked: false,
    quote: {
      payTo: a.payTo,
      amountMotes: a.amountMotes,
      amountCspr: a.amountCspr,
      priceUsd: a.priceUsd,
      transferId: a.transferId,
      network: a.network,
      description: a.description,
    },
  };
}

async function discover(baseUrl) {
  const res = await fetch(new URL('/api/casper/discover', baseUrl).toString());
  if (!res.ok) throw new Error(`Discovery failed: HTTP ${res.status}`);
  return res.json();
}

module.exports = {
  discover,
  explorerFor,
  generateKeys,
  getBalanceMotes,
  getQuote,
  keyPath,
  loadKeys,
  motesToCspr,
  payQuote,
  redeemContent,
  MOTES_PER_CSPR,
  TRANSFER_GAS_MOTES,
};
