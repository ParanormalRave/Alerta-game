import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { speak, emberConfigured } from './lib/ember.js';
// Saves are anchored on 0G Chain (the L1). See lib/storage.js for the 0G Storage
// path — parked because the published SDK (0.3.3) is out of sync with the current
// Galileo flow contract.
import { uploadSave, downloadSave, refFor, chainConfigured } from './lib/chain.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
// '*' = allow any origin (public demo API; we send no cookies/credentials).
app.use(cors({ origin: origins.includes('*') ? true : origins }));

// ---- health / capability probe (the client uses this to know what's live) ----
app.get('/health', (_req, res) => {
  res.json({ ok: true, compute: emberConfigured(), storage: chainConfigured() });
});

// ---- 0G Compute: the Ember speaks ----
app.post('/api/ember', async (req, res) => {
  const { event = 'briefing', context = {} } = req.body || {};
  try {
    const out = await speak(event, context);
    res.json(out);
  } catch (err) {
    console.error('[ember] error', err);
    res.status(200).json({ lines: ['The dark is patient. You must not be.'], source: 'fallback' });
  }
});

// ---- 0G Storage: save / load progress ----
app.post('/api/save', async (req, res) => {
  const { playerId, data } = req.body || {};
  if (!playerId || !data) return res.status(400).json({ error: 'playerId and data required' });
  try {
    const out = await uploadSave(playerId, data);
    console.log(`[save] ${playerId} -> ${out.txHash}`);
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error('[save] error', err?.message || err);
    res.status(502).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get('/api/load', async (req, res) => {
  try {
    const ref = req.query.ref || req.query.root || (req.query.playerId ? await refFor(req.query.playerId) : null);
    if (!ref) return res.json({ ok: true, found: false });
    const blob = await downloadSave(ref);
    res.json({ ok: true, found: true, txHash: ref, ...blob });
  } catch (err) {
    console.error('[load] error', err?.message || err);
    res.status(502).json({ ok: false, error: String(err?.message || err) });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`\n  ⬡ Zoal 0G proxy on http://localhost:${port}`);
  console.log(`    compute (AI Ember): ${emberConfigured() ? 'configured' : 'NOT configured — using fallback lines'}`);
  console.log(`    saves on 0G Chain:  ${chainConfigured() ? 'configured' : 'NOT configured — local-only saves'}`);
  console.log(`    allowed origins:    ${origins.join(', ')}\n`);
});
