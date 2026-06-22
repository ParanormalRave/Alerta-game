import { ethers } from 'ethers';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * 0G Storage — decentralized saves.
 *
 * A save blob is uploaded to 0G Storage and addressed by its merkle `rootHash`.
 * We keep a tiny local index (playerId -> rootHash) so a returning player can
 * pull their latest save from the network by id, even on a fresh device.
 *
 * The dev wallet (ZG_PRIVATE_KEY) signs uploads, so players never need a wallet.
 * Everything is wrapped so a misconfigured/down network degrades gracefully —
 * the client always still has localStorage.
 */

const RPC_URL = process.env.ZG_RPC_URL || 'https://evmrpc-testnet.0g.ai';
const INDEXER_RPC = process.env.ZG_STORAGE_INDEXER || 'https://indexer-storage-testnet-turbo.0g.ai';
const STORAGESCAN = 'https://storagescan-galileo.0g.ai';

const INDEX_FILE = path.join(process.cwd(), 'data', 'saves-index.json');

let sdk = null;       // lazily imported so the server boots even if the dep is absent
let signer = null;
let indexer = null;

export function storageConfigured() {
  return !!process.env.ZG_PRIVATE_KEY;
}

async function init() {
  if (indexer) return true;
  if (!storageConfigured()) return false;
  // Imported lazily: keeps `npm start` working for Compute-only setups even if
  // the storage SDK isn't installed yet.
  sdk = await import('@0glabs/0g-ts-sdk');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  signer = new ethers.Wallet(process.env.ZG_PRIVATE_KEY, provider);
  indexer = new sdk.Indexer(INDEXER_RPC);
  return true;
}

/** Tolerate both `[value, err]` tuples and plain returns from the SDK. */
function unwrap(ret) {
  if (Array.isArray(ret) && ret.length === 2) {
    const [val, err] = ret;
    if (err) throw new Error(typeof err === 'string' ? err : err?.message || 'sdk error');
    return val;
  }
  return ret;
}

// ---- local playerId -> rootHash index ----
async function readIndex() {
  try { return JSON.parse(await fs.readFile(INDEX_FILE, 'utf8')); }
  catch { return {}; }
}
async function writeIndex(idx) {
  await fs.mkdir(path.dirname(INDEX_FILE), { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(idx, null, 2));
}

/**
 * Upload a save object to 0G Storage.
 * @returns {Promise<{rootHash:string, tx?:string, explorer:string}>}
 */
export async function uploadSave(playerId, saveObj) {
  if (!(await init())) throw new Error('0G Storage not configured (set ZG_PRIVATE_KEY)');

  const { MemData } = sdk;
  const bytes = new TextEncoder().encode(JSON.stringify({ playerId, ts: Date.now(), data: saveObj }));
  const file = new MemData(bytes);

  const tree = unwrap(await file.merkleTree());
  const rootHash = tree?.rootHash?.() ?? tree?.rootHash;
  if (!rootHash) throw new Error('failed to compute rootHash');

  const tx = unwrap(await indexer.upload(file, RPC_URL, signer));

  const idx = await readIndex();
  idx[playerId] = { rootHash, ts: Date.now(), tx: tx?.txHash || tx?.hash || String(tx || '') };
  await writeIndex(idx);

  return { rootHash, tx: idx[playerId].tx, explorer: `${STORAGESCAN}/tx/${rootHash}` };
}

/** Look up the latest rootHash recorded for a player. */
export async function rootFor(playerId) {
  const idx = await readIndex();
  return idx[playerId]?.rootHash || null;
}

/**
 * Download a save by rootHash and return the parsed object.
 * @returns {Promise<{data:any, ts:number, playerId:string}>}
 */
export async function downloadSave(rootHash) {
  if (!(await init())) throw new Error('0G Storage not configured (set ZG_PRIVATE_KEY)');

  const tmp = path.join(os.tmpdir(), `zoal-${randomUUID()}.json`);
  try {
    // indexer.download(rootHash, outputPath, withProof) writes the bytes to disk.
    const err = await indexer.download(rootHash, tmp, true);
    if (err && !(Array.isArray(err))) {
      // some SDK versions return an error object on failure, null on success
      if (typeof err !== 'undefined' && err !== null && err.message) throw new Error(err.message);
    }
    const raw = await fs.readFile(tmp, 'utf8');
    return JSON.parse(raw);
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}
