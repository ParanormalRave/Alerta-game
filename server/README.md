# Zoal 0G proxy

A tiny Express server that lets **Chronicles of Zoal** use 0G without players
ever holding a wallet or paying anything. It holds **one** dev-funded 0G
**testnet** account (free faucet tokens) and exposes three routes the game calls:

| Route | 0G service | What it does |
|---|---|---|
| `POST /api/ember` | **0G Compute** | The AI "Ember" speaks — real LLM inference. |
| `POST /api/save` | **0G Chain** | Writes the save to the L1, returns its `txHash`. |
| `GET /api/load` | **0G Chain** | Pulls a save by `txHash` or `playerId`. |
| `GET /health` | — | Reports which services are configured. |

The game **degrades gracefully**: if this proxy is down or unconfigured, the
Ember falls back to curated lines and saves stay in `localStorage`. 0G only does
*real work* once the env below is filled in.

> Saves are written to **0G Chain** as transaction calldata (saves are tiny). The
> 0G **Storage** path (`lib/storage.js`) is parked — the published SDK
> (`@0glabs/0g-ts-sdk` 0.3.3) is out of sync with the current Galileo flow
> contract (`submit` reverts regardless of fee).

## Run it

```bash
cd server
npm install
cp .env.example .env      # then fill in the values (see below)
npm run dev               # http://localhost:8787
```

Run the game client in another terminal from the repo root (`npm run dev`).

## Configure (manual, one-time)

1. **Create a throwaway testnet wallet** (e.g. MetaMask → new account). Copy its
   private key into `ZG_PRIVATE_KEY`. Never reuse a wallet with real funds.
2. **Fund it** at https://faucet.0g.ai (≈0.1 0G/day — claim once, again tomorrow
   if needed).
3. **0G Compute**: get an API key + deposit a little testnet 0G at
   https://pc.0g.ai → `ZG_COMPUTE_API_KEY`. Confirm the model id at pc.0g.ai and
   set `ZG_COMPUTE_MODEL` if the default isn't offered.
4. Leave `ZG_RPC_URL`, `ZG_COMPUTE_BASE_URL`, `ZG_STORAGE_INDEXER` as-is unless
   the docs change.

Check `GET http://localhost:8787/health` — `compute` and `storage` should be
`true`.

## Verify 0G is doing real work

- **Compute**: `/api/ember` responses include `"source":"compute"` (vs
  `"fallback"`) when inference actually ran on 0G.
- **Saves**: `/api/save` logs a `txHash`; view it on
  https://chainscan-galileo.0g.ai.

## Deploy (for the submission)

Deploy to any Node host (Render / Railway / Fly.io). Set the same env vars there,
add your site's origin to `ALLOWED_ORIGINS`, and point the client at it with
`VITE_ZG_PROXY_URL=https://your-proxy.example.com`.
