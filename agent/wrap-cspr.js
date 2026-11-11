#!/usr/bin/env node
// ─── Wrap native CSPR into WCSPR for the agent wallet ───────
// The standard-x402 rail (agent/x402-buyer.mjs) pays in WCSPR, a
// CEP-18 token, so the agent needs a WCSPR balance as well as CSPR.
// WCSPR is an Odra contract whose `deposit` entry point is payable:
// it mints WCSPR equal to the CSPR attached. A payable call from an
// account has to go through Odra's proxy caller, a session wasm that
// moves the CSPR into a cargo purse and calls the contract.
//
//   node agent/wrap-cspr.js --amount 60          # wrap 60 CSPR
//
// Env:
//   CASPER_AGENT_KEY_PATH   PEM from `npm run agent:keygen`
//   ODRA_PROXY_CALLER_WASM  path to proxy_caller_with_return.wasm
//                           (default: the copy in the Odra 2.9.0 crate)
//   CASPER_WCSPR_PACKAGE_HASH_TESTNET  override the WCSPR package hash

const fs = require('fs');
const os = require('os');
const path = require('path');
const { CLValueBuilder, DeployUtil, RuntimeArgs } = require('casper-js-sdk');
const { loadKeys, getBalanceMotes, motesToCspr, explorerFor, MOTES_PER_CSPR } = require('./casper-client.js');

const NETWORK = 'casper-test';
const RPC_URL = process.env.CASPER_RPC_URL || 'https://node.testnet.casper.network/rpc';
const WCSPR_PACKAGE_HASH =
  process.env.CASPER_WCSPR_PACKAGE_HASH_TESTNET ||
  '3d80df21ba4ee4d66a2a1f60c32570dd5685e4b279f6538162a5fd1314847c1e';
const PROXY_WASM =
  process.env.ODRA_PROXY_CALLER_WASM ||
  path.join(
    os.homedir(),
    '.cargo/registry/src/index.crates.io-1949cf8c6b5b557f',
    'odra-casper-rpc-client-2.9.0/resources/proxy_caller_with_return.wasm',
  );
const GAS_MOTES = 10n * MOTES_PER_CSPR; // payment limit for the session wasm

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message} ${json.error.data ?? ''}`);
  return json.result;
}

(async () => {
  const i = process.argv.indexOf('--amount');
  const amountCspr = i > -1 ? Number(process.argv[i + 1]) : NaN;
  if (!Number.isFinite(amountCspr) || amountCspr <= 0) {
    console.error('Usage: node agent/wrap-cspr.js --amount <CSPR>');
    process.exit(1);
  }
  const motes = BigInt(Math.round(amountCspr * 1e9));

  const keys = loadKeys();
  const me = keys.publicKey.toHex();
  const balance = await getBalanceMotes(NETWORK, me);
  console.log(`account : ${me}`);
  console.log(`balance : ${motesToCspr(balance)} CSPR`);
  if (balance < motes + GAS_MOTES) {
    console.error(`Not enough CSPR to wrap ${amountCspr} plus up to ${motesToCspr(GAS_MOTES)} gas.`);
    process.exit(1);
  }

  // Odra proxy-caller arguments (odra-core consts): the target package,
  // the entry point, its serialized RuntimeArgs (empty → a zero u32),
  // and the CSPR to attach. `amount` is what the session may spend
  // from the main purse.
  const args = RuntimeArgs.fromMap({
    package_hash: CLValueBuilder.byteArray(Uint8Array.from(Buffer.from(WCSPR_PACKAGE_HASH, 'hex'))),
    entry_point: CLValueBuilder.string('deposit'),
    args: CLValueBuilder.list([0, 0, 0, 0].map((b) => CLValueBuilder.u8(b))),
    attached_value: CLValueBuilder.u512(motes.toString()),
    amount: CLValueBuilder.u512(motes.toString()),
  });

  const wasm = Uint8Array.from(fs.readFileSync(PROXY_WASM));
  const deploy = DeployUtil.signDeploy(
    DeployUtil.makeDeploy(
      new DeployUtil.DeployParams(keys.publicKey, NETWORK, 1, 30 * 60 * 1000),
      DeployUtil.ExecutableDeployItem.newModuleBytes(wasm, args),
      DeployUtil.standardPayment(GAS_MOTES.toString()),
    ),
    keys,
  );

  const { deploy_hash } = await rpc('account_put_deploy', { deploy: DeployUtil.deployToJson(deploy).deploy });
  console.log(`sent    : ${explorerFor(NETWORK)}/deploy/${deploy_hash}`);

  for (let n = 0; n < 40; n++) {
    await new Promise((r) => setTimeout(r, 5000));
    const info = await rpc('info_get_deploy', { deploy_hash }).catch(() => null);
    const exec = info?.execution_info?.execution_result ?? info?.execution_results?.[0]?.result;
    if (!exec) continue;
    const v2 = exec.Version2;
    const error = v2 ? v2.error_message : exec.Failure?.error_message;
    if (error) {
      console.error(`FAILED  : ${error}`);
      process.exit(1);
    }
    console.log(`wrapped : ${amountCspr} CSPR → WCSPR${v2 ? ` (gas consumed ${motesToCspr(BigInt(v2.consumed))} CSPR)` : ''}`);
    console.log(`balance : ${motesToCspr(await getBalanceMotes(NETWORK, me))} CSPR`);
    return;
  }
  console.error('Timed out waiting for execution; check the explorer link above.');
  process.exit(1);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
