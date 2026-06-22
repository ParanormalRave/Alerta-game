// Setup doctor: confirms the signing key, its derived address, and balance.
// Prints no secrets. Run: node check.js
import 'dotenv/config';
import { ethers } from 'ethers';
import { emberConfigured } from './lib/ember.js';
import { chainConfigured } from './lib/chain.js';

const pk = process.env.ZG_PRIVATE_KEY;
if (!pk) { console.error('✗ ZG_PRIVATE_KEY not set'); process.exit(1); }

const wallet = new ethers.Wallet(pk);
console.log('signing address :', wallet.address);

try {
  const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL);
  const bal = await provider.getBalance(wallet.address);
  console.log('balance         :', ethers.formatEther(bal), '0G');
  if (bal === 0n) console.log('  ⚠ zero balance — fund this address at https://faucet.0g.ai');
} catch (e) {
  console.log('balance         : (could not reach RPC:', e.message, ')');
}

console.log('compute (AI)    :', emberConfigured() ? 'configured' : 'NOT configured');
console.log('saves (0G Chain):', chainConfigured() ? 'configured' : 'NOT configured');
console.log('model           :', process.env.ZG_COMPUTE_MODEL);
