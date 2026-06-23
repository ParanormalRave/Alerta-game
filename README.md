# The Chronicles of Zoal — Ember Awakening

> *"The world itself is the health bar."*

A browser-based FPS dungeon crawler / hack-and-slash built in Three.js. You play as a **World Weaver** — one of the last beings capable of reshaping reality. Explore shattered realms, fight corrupted creatures, collect **Worldshards**, and physically re-weave a broken world back together.

**Built for Zero Cup Hackathon · 2026**

🎮 **[Play Now](https://alerta-game.vercel.app/)**

---

## 🌍 The Story

Long ago, a cataclysm called **The Shattering** tore the world apart into floating islands and broken continents. Over three days, you explore three shattered realms, uncovering what really caused it — and recovering the Worldshards needed to heal it.

Every Worldshard you place doesn't just restore the world. It **weakens the final boss**.  
Rush through and fight it at full strength. Explore fully, and you fight a wounded god.

---

## ⚔️ Gameplay

- **Genre:** FPS dungeon crawler / hack-and-slash
- **Engine:** Three.js (browser-based, no install required)
- **Playtime:** ~4–5 hours

### Core Loop
```
Explore Realm → Fight Enemies → Reach Checkpoint → Read Lore Fragment
→ Find Worldshard → Place at Weaving Altar (world heals + boss weakens)
→ Survive the Night (enemies drop Ember Shards) → Next Realm → Boss Fight
```

### The Three Realms
| Realm | Name | Difficulty |
|---|---|---|
| Realm I | Cinderwood — *The Ashen Forest* | Easy |
| Realm II | The Hollow Reach | Medium |
| Realm III | The Last Spire | Hard |

### Boss Scaling System
The final boss scales based on how many Worldshards you placed:

| Shards Placed | Boss Power |
|---|---|
| 0 / 5 | 100% — god-tier, punishing |
| 3 / 5 | 70% |
| 5 / 5 | 50% — still a real fight |

---

## ⛓️ Blockchain Integration (0G Network)

Player progress is persisted on-chain via **[0G Network](https://0g.ai/)** — decentralized, device-agnostic, and tamper-proof. **Players don't need a wallet.** A dev-funded testnet key in the proxy server covers all on-chain writes so the experience is frictionless.

### What's Stored On-Chain
- Worldshards collected and placed
- Realm progress and checkpoint state
- Ember Shard (crafting currency) count
- Boss power tier at time of final fight

### Architecture
```
Browser (Three.js game)
       │
       │  REST  (save / load / ember AI)
       ▼
zoal-0g-proxy  (Node.js / Express)
       │
       ├── 0G Chain     →  save state anchored on-chain (ethers + 0g-ts-sdk)
       └── 0G Compute   →  AI-driven in-game narration via the Ember
```

> State is committed at **checkpoints and altar placements**, not on every action — keeping writes infrequent and cost-efficient.

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Game Engine | [Three.js](https://threejs.org/) r160 |
| Physics | [Rapier3D](https://rapier.rs/) (WASM) |
| Audio | [Howler.js](https://howlerjs.com/) |
| Procedural Noise | simplex-noise |
| Build Tool | Vite 5 |
| Proxy Server | Node.js 18+ / Express |
| Blockchain SDK | [@0glabs/0g-ts-sdk](https://github.com/0glabs/0g-ts-sdk) + ethers v6 |
| AI Narration | 0G Compute (OpenAI-compatible) |
| Deployment | Vercel (frontend) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>=18`
- npm

### 1. Clone & install

```bash
git clone https://github.com/ParanormalRave/Alerta-game.git
cd Alerta-game
npm install
```

### 2. Configure the proxy server

```bash
cd server
npm install
cp .env.example .env   # fill in your 0G testnet key
```

```env
# server/.env
ZG_PRIVATE_KEY=          # dev-funded 0G testnet wallet private key
ZG_RPC_URL=              # 0G Galileo RPC endpoint
ZG_FLOW_CONTRACT=        # 0G Flow contract address
OPENAI_BASE_URL=         # 0G Compute endpoint (OpenAI-compatible)
OPENAI_API_KEY=          # 0G Compute API key
ALLOWED_ORIGINS=http://localhost:5173
```

### 3. Run locally

```bash
# Terminal 1 — proxy server
npm run proxy

# Terminal 2 — game dev server
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🎮 Controls

| Key | Action |
|---|---|
| `WASD` | Move |
| `MOUSE` | Look |
| `CLICK` | Attack / Interact |
| `E` | Use / Pickup |
| `SPACE` | Leap |
| `SHIFT` | Run |
| `1–8` | Switch Weapon |
| `Q` | Last Weapon |
| `R` | Reload |
| `M` | Map / Survey |
| `H` | Toggle Controls Help |
| `ESC` | Free Cursor |

---

## 🗺️ Project Structure

```
Alerta-game/
├── src/
│   ├── core/           # Engine bootstrap, render loop
│   ├── style.css       # Global styles & HUD
│   └── main.js         # Entry point
├── server/
│   ├── lib/
│   │   ├── chain.js    # 0G Chain save/load logic
│   │   ├── storage.js  # 0G Storage SDK (parked — SDK sync pending)
│   │   └── ember.js    # 0G Compute / AI narration
│   └── index.js        # Express proxy server
├── public/             # Static assets (logo, loading screen)
├── index.html
├── vite.config.js
└── package.json
```

---

## 🤝 Contributing

This project was built during a hackathon — PRs and issues welcome as it continues to grow post-jam.

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

---

*Built with 🔥 by [ParanormalRave](https://github.com/ParanormalRave) · [paranormalrave.vercel.app](https://paranormalrave.vercel.app)*
