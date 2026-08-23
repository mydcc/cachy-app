# Cachy - Position Size & Risk Management

[![Version](https://img.shields.io/github/v/release/mydcc/cachy-app?style=for-the-badge&color=blue)](https://github.com/mydcc/cachy-app/releases)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-f1413d?style=for-the-badge&logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Svelte 5](https://img.shields.io/badge/Svelte_5-f1413d?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=for-the-badge)](LICENSE)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/mydcc/cachy-app)

Cachy is a comprehensive web application for crypto traders designed to precisely calculate position sizes, manage risk, and maintain a trading journal. It follows a strict **Local-First** architecture (LocalStorage), is privacy-focused, and supports real-time market data from Bitunix and Bitget.

![Cachy Dashboard](docs/dashboard-preview.png)

---

## 🚀 Features

### 🔢 Smart Trading Calculator

- **Risk Management:** Automatically calculates the optimal position size based on account size, risk (%), and stop loss.
- **Dual Locking System:** Lock either the _Position Size_ (to adjust risk) or the _Risk Amount_ (to adjust position size).
- **ATR Integration:** Automatic fetching of Average True Range (ATR) from Bitget or Bitunix for dynamic stop-loss calculations.
- **Live Prices:** Real-time price fetching for cryptocurrencies.

### 📊 Market Overview & Sidebar

- **Real-time Data:** Integration of Bitunix Websockets for ultra-fast updates.
- **Market Overview:** Real-time 24h statistics (Price, Change %, Volume, High, Low) for the selected symbol.
- **Favorites System:** Save up to 12 favorite symbols for quick access. They are displayed in the sidebar (desktop) or below the main card (mobile), with the top 4 available as quick-select tiles on the calculator.
- **Live Streaming:** Bitunix WebSockets push price, order book and ticker updates as they happen — no polling intervals to configure.

### 🎯 Multi-Target Take Profit

- **Partial Exits:** Define up to 4 take-profit targets.
- **Auto-Balancing:** Percentage distribution automatically adjusts to always total 100%.
- **Detailed Metrics:** Calculates profit, R/R (Risk/Reward), and net return per target and in total.

### 📓 Integrated Journal, Notes & Presets

- **Trade Journal:** Save your trades locally, track status (Open, Won, Lost), and notes.
- **Side Panel:** A collapsible side panel for "Private Notes" (local), the AI Assistant, and (opt-in) Global Chat.
- **CSV Import/Export:** Full control over your data – export your journal for Excel or import backups.
- **Presets:** Save frequently used setups (e.g., "Scalping Strategy") for quick access.

### ⚙️ Customization & Tech

- **Multi-API Support:** Choose between **Bitunix** (Default) and **Bitget** as your data source.
- **Websocket Integration:** Real-time data feeds for price, order book, and ticker updates (Bitunix).
- **API Integration:** Optional API keys for auto-fetching account balance and private data.
- **Privacy:** Your journal, settings, API keys, presets and notes are stored only in your browser's `localStorage` and are never sent to a Cachy server. The one optional exception is Global Chat message content — off by default, requires an explicit token, and every core function works without it. See [ADR-0001](docs/adr/0001-local-first-boundary.md).
- **Backup & Restore:** Easily backup all your settings, presets, and journal entries to a JSON file and restore them anytime.
- **Themes:** Over 20 color themes (Dark, Light, Dracula, Nord, etc.).
- **Multilingual:** German and English support.

### 🧩 Advanced Features

- **Trading Academy:** Interactive learning modules for candlestick patterns and trading strategies.
- **Technicals Panel:** Standalone panel for technical indicators (RSI, MACD, Stoch) for the active symbol.
- **Global Subscription Management:** Centralized WebSocket management for stable and efficient data streams.
- **Reference Counting:** Smart tracking of data requests to prevent connection drops.
- **Debug Mode:** Optional system logs for better diagnostics.
- **Symbol Normalization:** Improved handling of symbol suffixes for stable API mapping.
- **Mobile Optimization:** Enhanced mobile layout with toggleable Sidebar/Market Overview.
- **Security:** Trading data and credentials remain local (`localStorage`). The only server-side data is optional Global Chat message content — see the Privacy note above.
- **Global Chat (optional):** An opt-in chat backed by SpacetimeDB, reachable from the Cloud settings tab. Disabled by default and never carries journal, settings or key data.

---

## 🚀 Quick Start (self-hosting)

Both editions are self-hosted: you run Cachy yourself, and your data never
leaves your browser.

```bash
git clone https://github.com/mydcc/cachy-app.git
cd cachy-app
npm ci
cp .env.example .env   # optional: PORT, ORIGIN and reverse-proxy settings live here
npm run build
node --env-file=.env build/index.js   # or plain `node build/index.js` without a .env
```

Then open `http://localhost:3000`. There is no account and no setup secret to
configure — on first use the app mints its own access token automatically.

> 🔐 **How API authentication works.** Guarded API routes only accept
> self-issued, anonymous client tokens (obtained via rate-limited
> `POST /api/auth/token`, minted for you by the app). Authentication fails
> closed: an unknown token gets 401 on all 27 guarded routes, while the app
> itself loads normally. There is no deployment-wide secret that can be
> forgotten or leaked. See [ADR-0002](docs/adr/0002-api-authentication-fails-closed.md).

**[→ Full installation guide](docs/INSTALL.md)** — prerequisites, configuration
and a troubleshooting section for the 401 above.
For a permanent instance behind a reverse proxy, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 🛠️ Development setup

For working *on* Cachy. To just run it, use the Quick Start above.

### Prerequisites

- Node.js **v20 or newer** (see `engines` in `package.json`; `.node-version` pins 20.18.3 for tooling)
- npm
- _Optional:_ a Rust toolchain with the `wasm32-unknown-unknown` target. `npm run dev` and `npm run build` invoke `scripts/build_wasm.sh` to rebuild the `technicals-wasm` indicator module. Without Rust the script skips the build and the pre-compiled binary committed in `static/wasm/` is used, so a plain `npm install && npm run dev` works out of the box.

### Setup

1. **Clone Repository:**

   ```bash
   git clone https://github.com/mydcc/cachy-app.git
   cd cachy-app
   ```

2. **Install Dependencies:**

   ```bash
   npm install
   ```

3. **Configure the environment (optional):**

   ```bash
   cp .env.example .env
   ```

   A `.env` is **not required** for development — `npm run dev` works out of the box. The file exposes optional knobs such as `PORT`, `ORIGIN` and reverse-proxy headers (see `.env.example`). API access is authenticated with self-issued client tokens that the app mints automatically; there is no server secret to configure. See [ADR-0002](docs/adr/0002-api-authentication-fails-closed.md) for the model and its rate limits.

   > ⚠️ **Never put a secret behind a `VITE_`-prefixed variable.** Vite inlines any such variable into the client bundle, so its value is served as plain JavaScript to every visitor. AI keys are entered per user in Settings → AI and stay in that browser.

4. **Start Development Server:**

   ```bash
   npm run dev
   ```

   The app is now running at `http://localhost:5173`.

### Tests

- **Unit Tests (Vitest):**

  ```bash
  npm test
  ```

  A required CI check, and the whole suite must be green.

- **Performance benchmarks:**

  ```bash
  npm run test:perf
  ```

  Excluded from `npm test` and run in a **non-blocking** CI job. They assert
  wall-clock time and heap growth, which on a shared runner is dominated by noise
  — the scaling check compares a ~5ms measurement against a ~24ms one, so a GC
  pause moves the result more than a real regression would. Treat a red run as a
  hint to investigate, not as a gate.

- **Type check:**

  ```bash
  npm run check
  ```

- **Linting:**

  ```bash
  npm run lint
  ```

  > **Lint is a required CI check.** The error count is **0 and must stay 0** — any error fails the build. `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` are both `"error"` (roadmap item 21's backlog reached zero; there is no more warning ratchet).
  >
  > If a rule fires on something deliberate, do not silence it globally: add an inline `eslint-disable-next-line` with a `--` explanation, as done for the Svelte 5 dependency-registration reads in `tradeCalculator.svelte.ts`.

---

## 📦 Deployment

The app is a SvelteKit application and can be deployed as a Node.js server or a static site (with the appropriate adapter).

**Production Build:**

```bash
npm run build
```

**Start (Node.js):**

```bash
npm start
# or with PM2
pm2 start server.js --name "cachy-app"
```

See `DEPLOYMENT.md` for detailed instructions.

---

## 📚 Documentation

**Start at [`docs/README.md`](docs/README.md)** — it maps every document in `docs/`.

- **Installation:** [`docs/INSTALL.md`](docs/INSTALL.md) — running Cachy yourself, from clone to a working balance, including what to do when every API call answers 401.
- **User Guide:** A detailed guide on how to use the app can be found directly within the application (via the "Guide" button) or in `src/lib/assets/content/guide.en.md`.
- **Contributing, versioning & changelog:** `AGENTS.md` (tool-agnostic rules for all agents) and `CLAUDE.md` (Claude Code-specific extension) for the non-negotiable coding rules and development process, including commit conventions and the semantic-release versioning policy. [`CHANGELOG.md`](CHANGELOG.md) is generated from those commits.

---

## 📄 License

This project is published under the [GNU Affero General Public License v3.0 (AGPLv3)](LICENSE).

Copyright (C) 2026 MYDCT
