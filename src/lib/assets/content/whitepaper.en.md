# Cachy Technical Whitepaper

**Version:** 0.94.2
**Date:** January 2026
**Last Updated:** January 14, 2026

---

## Executive Summary

Cachy is a high-performance, privacy-centric crypto trading companion designed to bridge the gap between professional trading terminals and user-friendly portfolio trackers. Unlike traditional cloud-based platforms that store sensitive user data (API keys, trade history) on centralized servers, Cachy adopts a **Local-First** architecture. This ensures that the user retains absolute control over their data while benefiting from institutional-grade analytics, real-time risk management, and seamless exchange integration.

The platform is built on a modern, reactive tech stack (SvelteKit, TailwindCSS, WebSocket) to deliver a "desktop-class" experience in the browser. It prioritizes **Capital Protection ("Money First")**, **User Experience ("User First")**, and **Data Sovereignty ("Community First")**.

This document serves as a comprehensive technical manual for developers, investors, and stakeholders, detailing the system architecture, mathematical core, security protocols, and future scalability roadmap.

---

## Table of Contents

1. [Product Philosophy & Core Values](#1-product-philosophy-core-values)
2. [System Architecture](#2-system-architecture)
3. [Core Logic & Mathematics ("The Heart")](#3-core-logic-mathematics-the-heart)
4. [The Trade Lifecycle ("The Nervous System")](#4-the-trade-lifecycle-the-nervous-system)
5. [External Integrations & Data Feeds](#5-external-integrations-data-feeds)
6. [Security & Privacy Model](#6-security-privacy-model)
7. [Scalability & Future Roadmap](#7-scalability-future-roadmap)
8. [Developer Guide](#8-developer-guide)

---

## 1. Product Philosophy & Core Values

Cachy was not built as just another trading terminal; it was architected to solve specific pain points in the retail trader's workflow: latency, complexity, and lack of true data ownership.

### User First: The "Speed of Thought" Interface

Trading decisions happen in milliseconds. Cachy's UI is designed to reduce "Time-to-Action".

- **Zero-Latency Interaction**: By utilizing Svelte's compile-time reactivity, UI updates (e.g., toggling a chart, filtering a table) happen instantly without Virtual DOM overhead.
- **Context-Aware Inputs**: The "Trade Setup" module automatically listens to the active symbol's price via WebSocket, pre-filling entry prices and calculating Stop Losses based on real-time volatility (ATR).
- **Progressive Web App (PWA)**: The application installs natively on desktop and mobile, offering an "App-like" feel with offline capabilities and removed browser chrome.

### Money First: Risk Management as a First-Class Citizen

Most terminals focus on _execution_ (buying/selling). Cachy focuses on _preservation_.

- **Risk-Centric Input**: Users do not enter "Amount to Buy". They enter "Risk Amount ($)". The system mathematically reverse-engineers the correct position size based on the Stop Loss distance.
- **Visualized Exposure**: Risk/Reward ratios are calculated dynamically. If a trade violates the user's risk profile (e.g., >3% risk), the UI visually warns the user (Red/Danger states).
- **Fee Transparency**: Funding rates and trading fees are not hidden footnotes; they are integrated into the Net PnL calculations to show the _true_ cost of a trade.

### Community First: The Privacy Manifesto

In an era of data breaches, Cachy takes a radical stance: **We don't want your data.**

- **No User Database**: There is no "Sign Up" form. No email collection. No password database to hack.
- **Local Storage**: All settings, trade journals, and API keys are stored encrypted or raw (user choice) in the browser's `localStorage`.
- **Transparent Code**: The codebase is open for inspection, ensuring no "phone home" telemetry exists beyond standard non-intrusive analytics (if enabled).

---

## 2. System Architecture

### High-Level Overview

Cachy operates as a **Monolithic Frontend with a Thin Proxy Backend**.

- **Frontend**: A rich Single Page Application (SPA) powered by SvelteKit. It handles 95% of the logic, including data processing, chart rendering, and state management.
- **Backend (Serverless/Node)**: A lightweight API Proxy layer hosted within SvelteKit (`src/routes/api/`). Its primary purpose is to sign requests for exchanges (Bitunix/Binance) securely without exposing API Secrets to the client, and to handle AI-driven diagnostics.

### Technology Stack

| Layer         | Technology              | Justification                                                                                                                                       |
| ------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Framework** | **SvelteKit**           | Provides SSR/CSR hybrid, file-based routing, and superior performance compared to React/Next.js due to lack of Virtual DOM.                         |
| **Language**  | **TypeScript**          | Strict typing is non-negotiable for financial applications to prevent floating-point errors and `undefined` states.                                 |
| **Styling**   | **TailwindCSS**         | Utility-first CSS allows for rapid UI iteration and consistent theming (Dark/Light/VIP modes).                                                      |
| **State**     | **Svelte Stores**       | Native, lightweight state management that scales well for real-time frequency data.                                                                 |
| **Math**      | **Decimal.js**          | IEEE 754 floating-point arithmetic (standard JS numbers) is unsafe for finance (e.g., `0.1 + 0.2 !== 0.3`). Decimal.js ensures arbitrary precision. |
| **Charts**    | **Chart.js**            | Canvas-based rendering for high-performance visualizations (Equity Curves, Scatter Plots) capable of handling thousands of data points.             |
| **Analysis**  | **TechnicalIndicators** | Modular library for calculating complex indicators (RSI, MACD, ADX) on the client side.                                                             |
| **Testing**   | **Vitest**              | Blazing fast unit testing framework that shares configuration with Vite.                                                                            |

### Client-Side State Management (The Store Pattern)

Cachy abandons the complex Redux/Context boilerplate in favor of Svelte's reactive Stores (`writable`, `derived`). The state is divided into domain-specific modules in `src/stores/`:

1. **`accountStore.ts`**: The "Single Source of Truth" for the user's wallet.
   - _Tracks_: Open Positions, Active Orders, Wallet Balances.
   - _Update Mechanism_: Receives atomic updates from WebSockets (`updatePositionFromWs`).
2. **`marketStore.ts`**: High-frequency market data.
   - _Tracks_: Prices, Funding Rates, Order Book Depth.
   - _Optimization_: Uses a dictionary map `Record<string, MarketData>` for O(1) access complexity when updating prices.
3. **`tradeStore.ts`**: The "Drafting Board".
   - _Tracks_: User inputs for a _potential_ trade (Entry, SL, TP) before execution.
   - _Persistence_: Automatically syncs to `localStorage` so users don't lose work on refresh.
4. **`journalStore.ts`**: The Historical Record.
   - _Tracks_: Array of `JournalEntry` objects (closed trades).
   - _Analytics_: Serves as the raw dataset for the `calculator.ts` analytics engine.

### AI-Assisted Telemetry (Jules Service)

Cachy implements an intelligent diagnostic layer known as **Jules API**.

- **Purpose**: To provide real-time, context-aware error analysis without compromising user privacy.
- **Workflow**:
  1. When a critical error occurs (or upon manual report), `julesService.ts` captures a **System Snapshot**.
  2. **Sanitization**: All API Secrets and sensitive keys are redacted on the client side before transmission.
  3. **Analysis**: The snapshot is sent to the backend (`/api/jules`), which forwards the context to a Large Language Model (Gemini).
  4. **Result**: The AI analyzes the state (e.g., "WebSocket disconnected while Order was Pending") and returns a natural-language diagnosis to the user.

### Backend-for-Frontend (BFF) & Proxy Layer

Located in `src/routes/api/`, this layer acts as a security gateway.

**The Problem**: Exchange APIs (Bitunix) require requests to be signed with an `API_SECRET`. If we make these requests from the browser, we must expose the Secret to the user's DevTools.

**The Solution**:

1. Client sends request to `GET /api/sync/orders`.
2. Client includes `API_KEY` and `API_SECRET` in custom headers (transported via HTTPS).
3. Server (Node.js context) receives headers.
4. Server constructs the payload, generates the SHA256 signature using the Secret.
5. Server calls Bitunix API.
6. Server returns the JSON result to Client.

_Note: While secrets travel from Client to Server, the Server is stateless and does not log or store them._

---

## 3. Core Logic & Mathematics ("The Heart")

The mathematical heart of Cachy resides in `src/lib/calculator.ts`. This library is responsible for ensuring that every dollar shown on screen is accurate to the penny, regardless of leverage or fee structures.

### Precision Finance (Decimal.js Integration)

In traditional JavaScript, `0.1 + 0.2` equals `0.30000000000000004`. This "floating point drift" is unacceptable in finance. Cachy uses the `Decimal.js` library to treat numbers as arbitrary-precision objects.

**The Pipeline**:

```typescript
// Every input is converted immediately
const risk = new Decimal(values.accountSize)
  .times(values.riskPercentage)
  .div(100);
// Operations are chained methods
const positionSize = risk.div(entry.minus(sl).abs());
```

### The Risk Engine: A Concrete Example

Most trading interfaces work forwards: _Buy 1 BTC -> What is my risk?_
Cachy works backwards: _I want to risk $100 -> How much BTC should I buy?_

**Scenario**:

- **Account Size**: $10,000
- **Risk per Trade**: 1% ($100)
- **Entry Price**: $50,000
- **Stop Loss**: $49,000 (2% distance)

**Calculation Steps**:

1. **Determine Distance**:
   $$ \Delta = | 50,000 - 49,000 | = 1,000 $$
2. **Calculate Quantity (Size)**:
   $$ Qty = \frac{Risk}{\Delta} = \frac{100}{1,000} = 0.1 \text{ BTC} $$
3. **Validation**:
   If price hits $49,000, loss is $0.1 \times 1,000 = \$100$. **The math holds.**
4. **Leverage Check**:
   Value of position is $0.1 \times 50,000 = \$5,000$.
   If user has 10x leverage, Margin Required = $500.
   _The system validates that $500 < Available Balance._

### Deep Dive Analytics: Trader Psychology

Cachy analyzes the `journalStore` to find behavioral patterns.

#### 1. Multi-Timeframe ATR Scanning

_Goal: What is the true market volatility right now?_
Cachy doesn't just calculate one ATR. It executes a **Parallel Scan** of the user's favorite timeframes (e.g., 5m, 15m, 1h, 4h).

- **Architecture**: It uses `Promise.all` to fetch klines for all timeframes simultaneously, calculating the ATR for each.
- **Benefit**: The user sees a "Volatility Matrix" in the Trade Setup, allowing them to choose a Stop Loss based on short-term noise (5m) or trend reversal (4h).

#### 2. Technical Analysis Engine

_Goal: Provide standard indicators without external charting libraries._
The `technicalsService.ts` leverages the **`talib-web` library** (WebAssembly port of TA-Lib) to compute:

- **Oscillators**: RSI, Stochastic, CCI, Awesome Oscillator, ADX, Momentum.
- **Trend**: SMA, EMA, MACD.
- **Pivot Points**: Calculated manually from the previous day's High/Low/Close.

**Upgrade (January 2026)**: Migrated from `technicalindicators` to `talib-web` for exact alignment with TradingView. The WebAssembly-based implementation offers maximum accuracy and uses the same algorithms as professional trading platforms. In the latest iteration, we have further optimized this by transitioning to pure TypeScript implementations where possible to remove WASM dependencies and improve load times on mobile devices.

This data is visualized in the **Technicals Panel**, a dedicated overlay for rapid market assessment.

#### 3. Context-Aware Intelligence (The AI Core)

_Goal: A trading assistant that knows the market, not just the chart._

Cachy integrates a **Context-Aware Chatbot** (powered by OpenAI or Google Gemini 2.5) that goes beyond simple text generation. It has read-access to real-time market data layers:

1.  **News Context**: Via a privacy-preserving proxy, the AI fetches top headlines from CryptoPanic and NewsAPI to understand current sentiment (Bullish/Bearish).
2.  **Fundamental Context**: It accesses CoinMarketCap (CMC) data to understand market cap dominance, volume trends, and project rankings.
3.  **Trade History Context**: The AI can analyze the user's last 20 trades to identify behavioral patterns (e.g., "You are over-trading after losses").

**Privacy Note**: All external data fetching is proxied. The AI provider never sees the user's IP address when fetching news, and API keys for news services are stored locally.

#### 4. Chronobiological Analysis (Timing)

_Goal: Do you trade better before lunch?_
The system iterates through every closed trade and buckets the PnL by Hour of Day (0-23) and Day of Week (0-6).

- **Implementation**:

  ```typescript
  hourlyNetPnl[date.getHours()].plus(trade.pnl);
  ```

- **Result**: A heat map showing "Danger Zones" (e.g., Friday Afternoons) where the trader historically loses money.

### The Journal Deep Dive System (10 Specialized Analytics Tabs)

Beyond basic analytics, Cachy provides a complete **Deep Dive Analytics System** - a Pro feature suite with 10 specialized tabs:

**1. Forecast** - Monte Carlo Simulation for probabilistic future projections based on historical R-Multiple distribution (minimum 5 trades required).

**2. Trends** - Rolling Metrics over sliding windows:

- Rolling Win Rate (last 20 trades)
- Rolling Profit Factor
- Rolling SQN (System Quality Number): `SQN = (√N × Ø R) / σ(R)` with quality levels (<1.6: poor, >2.5: excellent)

**3. Leakage** - Identifies "Profit Leaks":

- Profit Retention Waterfall (Gross PnL → Fees → Net PnL)
- Strategy Leakage (loss-making tags)
- Time Leakage (Worst Trading Hours)

**4. Timing** - Time-based patterns:

- Hourly PnL with Gross Wins/Losses
- Day of Week Analysis
- Duration vs PnL Scatter Plot
- Duration Buckets (0-15min, 15-30min, etc.)

**5. Assets** - Symbol Performance Matrix:

- Asset Bubble Chart (X: Win Rate, Y: PnL, Size: Trade Count)
- Quadrant Analysis to identify "Best Performers" vs. "Account Killers"

**6. Risk** - Risk Management Validation:

- R-Multiple Distribution Histogram
- Risk vs Realized PnL Correlation

**7. Market** - Performance by Market Conditions (Trending, Ranging, Volatile)

**8. Psychology** - Behavioral Finance:

- Streak Visualization
- Overconfidence/Tilt Detection after long series

**9. Strategies** - Tag-based Attribution:

- PnL per Tag (requires consistent tagging)
- Strategy Comparison with Win Rate, PF, Expectancy per Tag

**10. Calendar** - Temporal Heatmap with color-coded days (green: profit, red: loss)

**Implementation**: All calculations are performed in `src/lib/calculators/` (charts.ts, stats.ts) with Decimal.js for financial precision.

### Performance Dashboard (5 Core Analytics Tabs)

The Performance Dashboard provides real-time insights across 5 specialized views:

**1. Performance Tab**:

- Equity Curve (capital progression)
- Drawdown Chart (Max DD from All-Time High)
- Monthly PnL Bar Chart

**2. Quality Tab**:

- Win Rate Chart
- Trading Stats Dashboard:
  - Total Win Rate (color-coded: green ≥50%, red <50%)
  - Profit Factor (green ≥1.5, yellow ≥1.0, red <1.0)
  - Expectancy ($ per Trade)
  - Avg Win/Loss Ratio
  - Long/Short Win Rate Split

**3. Direction Tab**:

- Long vs Short PnL Comparison
- Direction Evolution (cumulative over time)
- Directional Bias Detection

**4. Discipline Tab**:

- Hourly PnL Heatmap (0-23h)
- Risk Consistency Validation
- Streak Statistics (longest Win/Loss series)

**5. Costs Tab**:

- Gross vs Net PnL Comparison
- Cumulative Fees Line Chart
- Fee Breakdown Donut (Trading vs Funding Fees)

**Technical Details**: Chart.js Canvas Rendering for performance with 1000+ data points, reactive Svelte Stores for real-time updates.

### Advanced Trading Metrics

Cachy implements institutional metrics that go beyond standard Win Rate:

**SQN (System Quality Number)**:

```
SQN = (√Number of Trades × Average R-Multiple) / σ(R-Multiple)
```

Interpretation: Statistical measure of system quality. >2.5 = excellent, <1.6 = needs revision.

**MAE (Maximum Adverse Excursion)**:

```
MAE = Max(Entry - Lowest Price during Trade)
```

Shows how far the trade went against the trader before recovery.

**MFE (Maximum Favorable Excursion)**:

```
MFE = Max(Highest Price - Entry during Trade)
```

Shows unrealized peak profit.

**Efficiency**:

```
Efficiency = (Realized PnL / MFE) × 100%
```

> 80% = excellent exit timing, <50% = exits too early.

**R-Multiple System**:
Normalizes trades relative to initial risk:

```
R = Realized PnL / Initial Risk Amount
```

Enables comparability across different account sizes.

**Implementation**: All metrics are calculated in `calculator.ts` (Stats module), visualized via Chart.js.

### Tag System & Strategy Attribution

Cachy's Tag System enables qualitative analysis:

**Tag Categories**:

- Strategies: `Breakout`, `Reversal`, `Support/Resistance`
- Mistakes: `FOMO`, `Revenge`, `TooEarly`
- Setups: `LongSetup`, `ShortSetup`, `Scalp`

**Features**:

- Multi-Tag Support per Trade
- Tag-based PnL Aggregation
- Strategy Leakage Detection (which tags systematically lose money)
- Tag Evolution Charts (PnL development per tag over time)

**Data Structure**: Tags are stored as String Array in `JournalEntry`, CSV Import/Export preserves tags.

---

## 4. The Trade Lifecycle ("The Nervous System")

To understand how Cachy functions, we trace the lifecycle of a single trade from **Ideation** to **History**.

### Phase 1: Ideation (The Input Layer)

_Component: `TradeSetupInputs.svelte`_

1. **User Input**: User types "BTC".
2. **Unified Analysis Fetch**: The component calls `app.fetchAllAnalysisData()`, which triggers a coordinated data harvest.
3. **Parallel Execution**:
   - **WebSocket**: Connects to `ticker` channel for real-time price.
   - **REST API (Price)**: Fetches the latest price snapshot.
   - **REST API (ATR)**: Fetches 1440 minutes of Kline history for the _primary_ timeframe.
   - **Multi-ATR Scan**: Simultaneously fetches klines for _secondary_ timeframes (1h, 4h) in the background.
4. **Auto-Fill**: The system uses the primary ATR to suggest a "safe" Stop Loss price (e.g., $Entry - 1.5 \times ATR$).

### Phase 2: Execution (The Proxy Layer)

_Component: `TradeSetupInputs.svelte` -> `apiService.ts`_

1. **User Action**: Clicks "Long".
2. **Payload Construction**: The App bundles Entry, SL, TP, and Size into a standardized JSON.
3. **Proxy Call**: `POST /api/orders`.
4. **Signing**: The Node.js server signs the request with the user's API Secret.
5. **Exchange Confirmation**: Bitunix returns an Order ID.

### Phase 3: Monitoring (The Store Layer)

_Component: `PositionsSidebar.svelte`_

1. **Socket Event**: Bitunix sends a `ORDER_UPDATE` via WebSocket.
2. **Store Update**: `accountStore` receives the event. It sees status `FILLED`.
3. **Atomic State Change**:
   - The "Pending Order" is removed from `openOrders`.
   - A new "Position" is created in `positions`.
4. **UI Render**: The Sidebar instantly animates the new position into view.

### Phase 4: Closing & Journaling (The Sync Layer)

_Component: `app.ts` (Sync Logic)_

1. **Closure**: User clicks "Close" or SL is hit.
2. **History Fetch**: The app polls `get_history_positions` (for closed trades) and `get_pending_positions` (for status updates).
3. **The "Safe Swap"**:
   - The system detects a Position ID in History that matches an active ID in `accountStore`.
   - It "Hydrates" the trade with final data (Realized PnL, Fees, Funding).
   - It moves the object from `accountStore` (Active) to `journalStore` (History).
   - It persists the new Journal Entry to `localStorage`.

---

## 5. External Integrations & Data Feeds

Cachy aims to be exchange-agnostic but currently optimizes for **Bitunix** (primary) and **Binance** (secondary).

### Exchange Connectivity

Connectivity is handled via the `src/services/apiService.ts` abstraction layer. This allows the UI to request `fetchTicker('BTCUSDT')` without knowing _which_ exchange provides the data.

**Normalization Strategy**:

- Exchanges format data differently (e.g., Bitunix uses `lastPrice`, Binance uses `price`).
- The Service layer normalizes all responses into a standard `Ticker24h` or `Kline` interface before passing data to the UI.
- _Specific Handling_: Bitunix Futures symbols often end in `.P` or `USDTP`. The normalizer strictly strips these suffixes to maintain clean UI symbols (e.g., `BTCUSDT`).

### Hybrid Data Strategy: REST Polling vs. WebSocket Streams

To balance **Responsiveness** vs. **Rate Limits**, Cachy uses a hybrid approach:

1. **Initial Load (REST)**:
   - Fetches full Order History (Pagination supported).
   - Fetches 1440 minutes of Kline history (for RSI/ATR calculation).
2. **Real-Time (WebSocket)**:
   - **Public Channels**: `ticker`, `depth`, `trade`. Used for charting and price updates.
   - **Private Channels**: `order`, `position`, `wallet`. Used to update the User Dashboard.
   - _Heartbeat Logic_: A "Watchdog" timer in `BitunixWebSocketService` kills and restarts the connection if no "Pong" is received within 20 seconds, ensuring 99.9% uptime.

### The "Safe Swap" Synchronization Protocol

A critical challenge in syncing local state with remote API state is handling updates without "flickering" or data loss.

**The Logic (`src/services/app.ts`)**:

1. **Fetch New Data**: The app retrieves the full list of open positions from the API.
2. **Diffing**: It compares the new list against the `accountStore`.
3. **Atomic Swap**:
   - If a position exists in Store but NOT in API -> It was closed. Move to Journal.
   - If a position exists in API but NOT in Store -> It was opened remotely. Add to Store.
   - If in BOTH -> Update PnL/Margin metrics.
   - _Crucial_: This happens in a `try/catch` block. If the API fetch fails, the local state is **preserved** (not wiped), preventing the "Zero Balance" scare common in other apps.

---

## 6. Security & Privacy Model

Cachy operates on a **"Trust No One"** architecture.

### Local-First Data Storage

- **Mechanism**: Data is stored in `localStorage` using the keys `cachy_trade_store` (drafts), `tradeJournal` (history), and `cryptoCalculatorSettings` (config).
- **Benefit**: Even if the Cachy hosting server is compromised or taken offline, the user's data remains safe on their device.
- **Portability**: Users can export their entire database as a JSON/CSV file via the "Backup" feature in Settings.

### Bilingual Data Portability (CSV Import/Export)

To support the "Community First" principle, Cachy ensures user data is never locked in.

- **Universal Export**: Users can export their Journal to CSV at any time.
- **Intelligent Import**: The `importFromCSV` service includes a bilingual translation layer. It detects German headers (e.g., `Gewinn`, `Datum`) or English headers (e.g., `Profit`, `Date`) and normalizes them into the internal data structure.
- **Media Support**: Screenshot URLs and Tags are preserved during the import/export cycle, ensuring no "soft data" is lost.

### API Key Handling & Proxy Security

Cachy acts as a pass-through entity.

- **Client Side**: API Keys are stored in the browser. They are _never_ sent to Cachy's server for storage.
- **Transit**: Keys are sent only in the HTTP Headers of specific API requests.
- **Server Side**: The Node.js proxy receives the request, signs it using the Secret, forwards it to Bitunix, and immediately discards the credentials from memory. No logs are kept.

### No-Database Architecture

By removing the database:

1. **Attack Vector Elimination**: SQL Injection and Database Leaks are impossible.
2. **GDPR/CCPA Compliance**: We do not process user data, so compliance is automatic by design.

---

## 7. Scalability & Future Roadmap

While the current Local-First model is robust for individual traders, the roadmap includes scaling to support teams and institutional requirements.

### Phase 1: From Local-First to Sync-Enabled (Optional Cloud)

_Objective: Allow users to sync data between Desktop and Mobile._

- **Plan**: Implement an _optional_ End-to-End Encrypted (E2EE) cloud relay.
- **Tech**: Use a CRDT (Conflict-free Replicated Data Type) library like Yjs or Automerge. The server would store encrypted blobs without having the keys to decrypt them.

### Phase 2: Mobile Native Adaptation

_Objective: Push to App Store/Play Store._

- **Plan**: Wrap the existing PWA in Capacitor.js.
- **Benefit**: Access to native Biometrics (FaceID) for unlocking the app and Push Notifications for price alerts.

### Phase 3: Institutional Features

- **Multi-Account Management**: Switching between Sub-Accounts.
- **Read-Only Investor View**: Generating a public "View Only" link for a specific portfolio (requires a move to a DB-backed architecture for those specific users).

---

## 8. Developer Guide

### Setup & Installation

```bash
# Clone Repository
git clone https://github.com/mydcc/cachy-app.git

# Install Dependencies
npm install

# Start Development Server (Localhost:5173)
npm run dev
```

### Testing Strategy

Cachy employs a rigorous testing suite using **Vitest**.

- **Unit Tests**: Focus on `calculator.ts` to ensure math accuracy.
  `npm run test:unit`
- **Verification**: Playwright scripts (Python) are used to verify UI flows on the live staging environment.
  `python3 verify_pagination.py`

### Deployment Pipeline

The production build is a Node.js adapter output.

1. **Build**: `npm run build` (Compiles SvelteKit to `build/`)
2. **Run**: `node build/index.js` or via PM2: `pm2 start server.js --name "cachy-app"`
3. **Reverse Proxy**: Nginx is recommended to handle SSL termination and forward traffic to Port 3000.

---

**End of Document**
