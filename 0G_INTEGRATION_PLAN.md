# Chronicles of Zoal → 0G Integration Plan

> Goal: make the game **AI‑native on 0G** so it passes the hackathon's
> Submission Criteria #1 — *"0G has to do real work in your app. If it runs
> the same without it, that's a bolt‑on."*

---

## ✅ BUILD STATUS (implemented)

All three phases are coded and verified to build/boot:

- **Phase 0 — proxy** (`server/`): Express app, `npm install` succeeds, boots and
  serves `/health`, `/api/ember`, `/api/save`, `/api/load`. Degrades gracefully
  when unconfigured (verified: returns fallback lines, reports capabilities).
- **Phase 1 — AI Ember** (0G Compute): `src/ai/AIDirector.js` + `#ember-whisper`
  HUD voice, wired into realm‑enter (briefing), boss wake (taunt), death, and
  ember extraction. Client production build passes.
- **Phase 2 — saves** (0G **Chain**): `src/core/SaveSystem.js` writes every save to
  the 0G L1 as transaction calldata (`txHash`) and pulls by anonymous `playerId`;
  localStorage stays as instant/offline cache. **Verified live** — save+load
  round-trip confirmed on Galileo (tx visible on chainscan).

### Run it
```bash
# terminal 1 — the game
npm run dev
# terminal 2 — the 0G proxy (after server/.env is filled in; see §5)
cd server && npm install && cp .env.example .env   # fill in values
npm run proxy            # or from server/: npm run dev
```

### Resolved during live testing (Galileo testnet, funded key)
1. **Compute model id** — the OpenAI-compatible default `llama-3.3-70b-instruct`
   is **not** served; the router returned `403 model not allowed`. Switched to
   `deepseek-v4-flash` (list your key's models via `GET /v1/models`). The Ember
   now returns real inference (`source:"compute"`).
2. **Saves pivoted from 0G Storage → 0G Chain.** `@0glabs/0g-ts-sdk@0.3.3` (npm
   marks it "no longer supported", and it's the latest) reverts on `submit`
   against the current Galileo flow contract — `require(false)` at every fee
   tested. Rather than fight a stale SDK, saves are now written directly to the
   0G L1 as transaction calldata (standard EVM, guaranteed to work, and more
   literally "on-chain"). `server/lib/storage.js` is kept but unwired in case the
   SDK is fixed later.

---

## 1. The gap (why we currently fail)

The game is a pure client‑side Three.js FPS dungeon crawler. There is **zero**
on‑chain / AI / 0G code:

- `package.json` deps: only `three`, `@dimforge/rapier3d-compat`, `howler`,
  `simplex-noise`. No `ethers`, no 0G SDK, no AI client.
- Persistence is `src/core/SaveSystem.js` → browser `localStorage`
  (`zoal.save.v1`). Fully local.
- No wallet, no contract, no inference call anywhere.

So today, 0G does **no work**. That is the only thing standing between this
project and the criteria.

---

## 2. Decisions (locked with the user)

| Topic | Decision |
|---|---|
| **0G Compute** | AI "Ember" companion/dungeon‑master. **Core / headline.** |
| **0G Storage** | Save progress decentralized, retrieved by `rootHash`. **Core.** |
| **0G Chain** | Anchor saves / mint Embers as verifiable records. **Stretch.** |
| **Cost to players** | **Totally free.** Testnet tokens are free from the faucet; a developer‑funded testnet account behind a small proxy pays. **Players never connect a wallet or pay.** |
| **Player identity** | Anonymous UUID in `localStorage` (no login). |
| **Submission hosting** | Proxy deployed to a free host so judges can play without the dev running it locally. |

---

## 3. Architecture (the "free, no‑wallet" model)

```
Browser (Vite/Three.js client)        Tiny Node proxy (holds ONE dev testnet key)      0G Network
──────────────────────────────        ──────────────────────────────────────────      ──────────
src/ai/AIDirector.js  ─POST /api/ember─▶  prompt + gameState  ──────────────────────▶  0G Compute (router-api.0g.ai/v1)
src/core/SaveSystem.js ─POST /api/save─▶  upload save JSON (MemData) ───────────────▶  0G Storage → returns rootHash
                       ─GET  /api/load─▶  download by rootHash ◀──────────────────────  0G Storage
   (anonymous playerId UUID in localStorage links a player to their latest rootHash)
```

The private key lives **only** in the proxy's `.env` — never in the shipped
client. Players just play.

### 0G Galileo testnet config

- Chain ID **16602** · RPC `https://evmrpc-testnet.0g.ai` · token **0G**
- Faucet `https://faucet.0g.ai` (limit ~0.1 0G/day/wallet — top up daily)
- Explorer `https://chainscan-galileo.0g.ai`
- Storage explorer `https://storagescan-galileo.0g.ai`
- Compute deposit + API key at `pc.0g.ai`
- Compute router (OpenAI‑compatible): `https://router-api.0g.ai/v1`
- Storage SDK: `@0gfoundation/0g-storage-ts-sdk` (peer dep `ethers`)

---

## 4. Build phases

### Phase 0 — Setup
- Scaffold `/server` (Express). Deps: `express`, `cors`, `dotenv`, `ethers`,
  `openai`, `@0gfoundation/0g-storage-ts-sdk`.
- Add `server/.env` (key, RPC, router URL) and add it to `.gitignore`.
- Add a `dev:server` npm script; document running client + proxy together.

### Phase 1 — 0G Compute "Ember"  *(passes the criteria on its own)*
- `server`: `POST /api/ember` → call 0G Compute with an Ember persona system
  prompt + the player's live `gameState` (embers secured, kills, completed
  realms). Return generated text.
- `src/ai/AIDirector.js` (new) → client wrapper with small helpers:
  `briefRealm(realmKey)`, `bossTaunt(bossId)`, `reactToDeath()`,
  `reactToEmber(realmIndex)`.
- Hook points: realm‑enter briefing in `src/core/SceneManager.js`; boss taunts
  + death/kill reactions via `src/enemies/BossBase.js`,
  `gameState.recordKill` / `secureEmber`. Surface text in the existing HUD.
- ✅ After this the game is genuinely AI‑native and 0G does real work.

### Phase 2 — 0G Storage saves  *("save progress onchain")*
- `server`: `POST /api/save` (upload JSON via `MemData` → return `rootHash`),
  `GET /api/load?root=…` (download).
- Rework `src/core/SaveSystem.js`: push the existing `PERSIST` payload to 0G
  Storage; keep `localStorage` as fast cache / offline fallback. Anonymous
  `playerId` UUID links player → latest `rootHash`.
- ✅ Progress now lives decentralized; demoable on storagescan.

### Phase 3 — 0G Chain anchor  *(stretch)*
- Small Solidity contract: `setSave(playerId, rootHash)` and optional
  soulbound Ember mint per secured ember. Verifiable on chainscan. Reuse the
  in‑progress `src/world/LootSystem.js` / `src/data/upgrades.js`.

### Phase 4 — Demo & write‑up
- README section showing exactly how 0G does real work (Compute / Storage /
  Chain) with live links. This is what judges score against criteria #1.

---

## 5. ⚠️ MANUAL STEPS (only the user can do these)

Claude Code **cannot** do the following — they need a human with a browser and
the project's secrets. Do these before/around Phase 0–1.

1. **Create a throwaway testnet wallet.**
   Use MetaMask (or any EVM wallet) → create a NEW account dedicated to this.
   Copy its **private key**. Never reuse a wallet that holds real funds.

2. **Get free testnet tokens.**
   Go to `https://faucet.0g.ai`, paste the wallet address, claim. (Limit ~0.1
   0G/day — claim once now, again tomorrow if needed.)

3. **Set up 0G Compute access.**
   Go to `https://pc.0g.ai`, connect the wallet, **deposit a small amount** of
   testnet 0G for inference, and grab the **API key** (if the router flow asks
   for one).

4. **Fill in `server/.env`** (Claude will create the template; you paste the
   secrets):
   ```
   ZG_PRIVATE_KEY=0x....           # from step 1
   ZG_RPC_URL=https://evmrpc-testnet.0g.ai
   ZG_COMPUTE_API_KEY=...          # from step 3 (if required)
   ZG_COMPUTE_BASE_URL=https://router-api.0g.ai/v1
   PORT=8787
   ```

5. **(Submission) Deploy the proxy** to a free host (Render / Railway /
   Fly.io). Set the same env vars there. Put the deployed URL in the client
   config so judges can play without you. *(Claude can prep the deploy config;
   you click through the host's signup + deploy.)*

6. **(Phase 3 only) Confirm contract deploy.** Claude can write + deploy the
   Solidity, but you approve any prompts and verify it on
   `https://chainscan-galileo.0g.ai`.

> Everything else — proxy code, AIDirector, SaveSystem rework, game hooks,
> contract code — Claude Code does.

---

## 6. ▶️ PROMPT FOR CLAUDE CODE

Paste the block below into Claude Code to execute the plan. Do Phase 0+1 first,
verify, then continue.

```text
Read 0G_INTEGRATION_PLAN.md in the repo root and implement it. Context: this is
a Vite + Three.js game (Chronicles of Zoal) with no backend and no on-chain
code. We are integrating 0G to satisfy the hackathon "AI-native on 0G" criteria.
Players must NOT pay or connect a wallet — a dev-funded 0G testnet account behind
a small Node proxy pays, using free faucet tokens.

Do this in order, pausing after Phase 1 so I can test:

PHASE 0 — Setup
- Create a `server/` Express app. Add deps: express, cors, dotenv, ethers,
  openai, @0gfoundation/0g-storage-ts-sdk.
- Create `server/.env.example` with: ZG_PRIVATE_KEY, ZG_RPC_URL
  (https://evmrpc-testnet.0g.ai), ZG_COMPUTE_API_KEY, ZG_COMPUTE_BASE_URL
  (https://router-api.0g.ai/v1), PORT (8787). Add server/.env to .gitignore.
- Add npm scripts to run the proxy, and a short README note on running client +
  proxy together. Add a client-side config value for the proxy base URL.

PHASE 1 — 0G Compute "Ember" (AI-native core)
- server: POST /api/ember -> call 0G Compute (OpenAI-compatible, base URL from
  env) with an "Ember" dungeon-master persona system prompt plus the player's
  gameState (embers, kills, completedRealms) passed in the request body. Return
  the generated text. Handle errors gracefully (fallback line if 0G is down).
- Create src/ai/AIDirector.js: a client wrapper that POSTs to /api/ember with
  helpers briefRealm(realmKey), bossTaunt(bossId), reactToDeath(),
  reactToEmber(realmIndex). It should read the live gameState from
  src/data/gameState.js and include it in the request.
- Wire hooks: realm-enter briefing in src/core/SceneManager.js; boss taunt +
  death/kill reactions via src/enemies/BossBase.js and the secureEmber /
  recordKill paths. Surface the returned text in the existing HUD (match the
  current UI style in index.html / src/style.css). Keep it non-blocking
  (async, never freeze the game loop).

PHASE 2 — 0G Storage saves (after I confirm Phase 1 works)
- server: POST /api/save uploads the save JSON via 0G Storage MemData and returns
  rootHash; GET /api/load?root=... downloads it. Sign with ZG_PRIVATE_KEY +
  ethers using ZG_RPC_URL.
- Rework src/core/SaveSystem.js to push the existing PERSIST payload to 0G
  Storage and keep the returned rootHash; keep localStorage as cache/fallback.
  Generate an anonymous playerId UUID in localStorage and use it to track the
  latest rootHash.

PHASE 3 — 0G Chain anchor (stretch, only if I ask)
- Minimal Solidity contract setSave(playerId, rootHash) (+ optional soulbound
  Ember mint). Deploy script for 0G Galileo (chainId 16602). Wire the proxy to
  write the anchor after a successful save.

Constraints:
- Never put the private key or any secret in client code or commit it.
- Don't break the existing game; all 0G calls are async and degrade gracefully.
- Match existing code style (ES modules, the project's comment density).
- After Phase 1 and Phase 2, give me exact local run + test steps and the
  storagescan/chainscan links to verify 0G is doing real work.

I will handle manually: creating the testnet wallet, claiming faucet tokens,
depositing for Compute at pc.0g.ai, filling server/.env, and deploying the proxy.
```
