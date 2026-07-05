#!/usr/bin/env node
// Creates the agent's Casper keypair (ed25519, PEM on disk, chmod 600)
// and prints the funding instructions. The keys directory is
// gitignored — the secret never leaves this machine.

const { generateKeys } = require('./casper-client');

try {
  const { publicKeyHex, path } = generateKeys();
  console.log('✅ Agent keypair created');
  console.log('');
  console.log(`   Secret key : ${path}  (gitignored, keep it safe)`);
  console.log(`   Public key : ${publicKeyHex}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Fund this account with free testnet CSPR (1000 CSPR, one time):');
  console.log('     https://testnet.cspr.live/tools/faucet');
  console.log(`     — sign in / paste the public key above as the target.`);
  console.log(`  2. Check it landed: https://testnet.cspr.live/account/${publicKeyHex}`);
  console.log('  3. Run the buyer: npm run agent -- --goal "your research goal" --budget 50');
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
