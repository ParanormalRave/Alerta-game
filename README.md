# The Chronicles of Zoal — Ember Awakening

> *"The world itself is the health bar."*

A browser-based isometric action RPG where you play as a **World Weaver** — one of the last beings capable of reshaping reality by placing magical blocks. Explore shattered realms, fight corrupted creatures, collect **Worldshards**, and physically re-weave a broken world back together.

**Built for [Hackathon Name] · [Year]**

🎮 **[Play Now](https://alerta-game.vercel.app/)**

---

## 🌍 The Story

Long ago, a cataclysm called **The Shattering** tore the world apart into floating islands and broken continents. Over three days, you explore three shattered realms, uncovering what really caused it — and recovering the Worldshards needed to heal it.

Every Worldshard you place doesn't just restore the world. It **weakens the final boss**.  
Rush through and fight it at full strength. Explore fully, and you fight a wounded god.

---

## ⚔️ Gameplay

- **Genre:** Isometric Action-RPG *(Minecraft Dungeons-style)*
- **Playtime:** ~4–5 hours
- **Controls:** WASD to move, Mouse to look, Click to attack

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

Player actions and game state are persisted on-chain using **[0G Storage](https://0g.ai/)** — decentralized, device-agnostic, and tamper-proof. No traditional backend. No save files that die with your browser.

### What's Stored On-Chain
- Worldshards collected and placed
- Realm progress and checkpoint state
- Ember Shard (crafting currency) count
- Boss power tier at time of final fight

### Why 0G?
0G Storage works standalone — no chain migration needed. It plugs directly into the existing browser-based game, replacing `localStorage` with decentralized storage at a fraction of the cost of alternatives. Player state follows the wallet, not the device.

> State is committed at **checkpoints and altar placements**, not on every action — keeping writes infrequent and gas-efficient.

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Game Engine | *(e.g. Three.js / Phaser / Babylon.js)* |
| Frontend | *(e.g. Vanilla JS / React / Vite)* |
| Deployment | Vercel |
| Blockchain Storage | 0G Network (0G Storage SDK) |
| Wallet | *(e.g. MetaMask / WalletConnect)* |

---

## 🚀 Getting Started

### Prerequisites
- Node.js `>=18`
- A Web3 wallet (MetaMask recommended)

### Local Development

```bash
# Clone the repo
git clone https://github.com/<your-username>/alerta-game.git
cd alerta-game

# Install dependencies
npm install   # or bun install

# Start dev server
npm run dev   # or bun dev
```

Open `http://localhost:3000` (or whichever port your bundler uses) in your browser.

### Environment Variables

```env
# .env.example
VITE_0G_STORAGE_RPC=
VITE_0G_CHAIN_ID=
VITE_WALLET_CONNECT_PROJECT_ID=
```

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
| `R` | Reload |
| `M` | Map / Survey |
| `H` | Toggle Controls |
| `ESC` | Free Cursor |

---

## 🗺️ Project Structure

```
alerta-game/
├── src/
│   ├── game/           # Core game logic (engine, entities, combat)
│   ├── blockchain/     # 0G Storage integration, wallet connection
│   ├── ui/             # HUD, menus, lore popups
│   └── assets/         # Models, textures, audio
├── public/
└── README.md
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
