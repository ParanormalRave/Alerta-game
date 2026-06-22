import { ethers } from 'ethers';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * 0G Chain — decentralized saves, written straight to the L1.
 *
 * Each save is a real transaction on 0G Chain whose calldata carries the save
 * blob (saves are tiny, ~150 bytes). It's verifiable on the explorer and reads
 * back by transaction hash. We keep a small local index (playerId -> txHash) so
 * a returning player can pull their latest save by id.
 *
 * The dev wallet (ZG_PRIVATE_KEY) sends/pays, so players never need a wallet.
 * Everything is wrapped so a down/misconfigured chain degrades gracefully —
 * the client always still has localStorage.
 */

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const CHAINSCAN = 'https://chainscan-galileo.0g.ai';
const INDEX_FILE = path.join(process.cwd(), 'data', 'saves-index.json');

let signer = null;
let provider = null;

export function chainConfigured() {
  return !!process.env.ZG_PRIVATE_KEY;
}

function init() {
  if (signer) return true;
  if (!chainConfigured()) return false;
  provider = new ethers.JsonRpcProvider(RPC_URL);
  signer = new ethers.Wallet(process.env.ZG_PRIVATE_KEY, provider);
  return true;
}

async function readIndex() {
  try { return JSON.parse(await fs.readFile(INDEX_FILE, 'utf8')); }
  catch { return {}; }
}
async function writeIndex(idx) {
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2));
}

/**
 * Write a save to 0G Chain as transaction calldata.
 * @returns {Promise<{txHash:string, explorer:string}>}
 */
export async function uploadSave(playerId, saveObj) {
  if (!init()) throw new Error('0G Chain not configured (set ZG_PRIVATE_KEY)');

  const payload = JSON.stringify({ playerId, ts: Date.now(), data: saveObj });
  const data = '0x' + Buffer.from(payload, 'utf8').toString('hex');

  // self-transaction: the calldata is the save; value 0.
  const tx = await signer.sendTransaction({ to: signer.address, value: 0n, data });
  await tx.wait(1).catch(() => {}); // best-effort confirm so the explorer shows it

  const idx = await readIndex();
  idx[playerId] = { txHash: tx.hash, ts: Date.now() };
  await writeIndex(idx);

  return { txHash: tx.hash, explorer: `${CHAINSCAN}/tx/${tx.hash}` };
}

/** Latest transaction hash recorded for a player. */
export async function refFor(playerId) {
  const idx = await readIndex();
  return idx[playerId]?.txHash || null;
}

/**
 * Read a save back from 0G Chain by transaction hash.
 * @returns {Promise<{data:any, ts:number, playerId:string}>}
 */
export async function downloadSave(txHash) {
  if (!init()) throw new Error('0G Chain not configured (set ZG_PRIVATE_KEY)');
  const tx = await provider.getTransaction(txHash);
  if (!tx || !tx.data || tx.data === '0x') throw new Error('no save data at that tx');
  const json = Buffer.from(tx.data.slice(2), 'hex').toString('utf8');
  return JSON.parse(json);
}
