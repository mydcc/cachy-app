# Cachy Technical Whitepaper
**Version:** 0.96.0
**Date:** February 2025

---

## Executive Summary

Cachy is a high-performance, privacy-centric crypto trading companion designed to bridge the gap between professional trading terminals and user-friendly portfolio trackers. Unlike traditional cloud-based platforms that store sensitive user data (API keys, trade history) on centralized servers, Cachy adopts a **Local-First** architecture. This ensures that the user retains absolute control over their data while benefiting from institutional-grade analytics, real-time risk management, and seamless exchange integration.

The platform is built on a modern, reactive tech stack (SvelteKit, TailwindCSS, WebSocket) to deliver a "desktop-class" experience in the browser. It prioritizes **Capital Protection ("Money First")**, **User Experience ("User First")**, and **Data Sovereignty ("Community First")**.

This document serves as a comprehensive technical manual for developers, investors, and stakeholders, detailing the system architecture, mathematical core, security protocols, and future scalability roadmap.

---

## Table of Contents

1. [Product Philosophy & Core Values](#1-product-philosophy--core-values)
2. [System Architecture](#2-system-architecture)
3. [Core Logic & Mathematics ("The Heart")](#3-core-logic--mathematics-the-heart)
4. [The Trade Lifecycle ("The Nervous System")](#4-the-trade-lifecycle-the-nervous-system)
5. [External Integrations & Data Feeds](#5-external-integrations--data-feeds)
6. [Security & Privacy Model](#6-security--privacy-model)
7. [Scalability & Future Roadmap](#7-scalability--future-roadmap)
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
Most terminals focus on *execution* (buying/selling). Cachy focuses on *preservation*.
- **Risk-Centric Input**: Users do not enter "Amount to Buy". They enter "Risk Amount ($)". The system mathematically reverse-engineers the correct position size based on the Stop Loss distance.
- **Visualized Exposure**: Risk/Reward ratios are calculated dynamically. If a trade violates the user's risk profile (e.g., >3% risk), the UI visually warns the user (Red/Danger states).
- **Fee Transparency**: Funding rates and trading fees are not hidden footnotes; they are integrated into the Net PnL calculations to show the *true* cost of a trade.

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
- **Backend (Serverless/Node)**: A lightweight API Proxy layer hosted within SvelteKit (`src/routes/api/`). Its primary purpose is to sign requests for exchanges (Bitunix/Binance) securely without exposing API Secrets to the client, and to handle CORS issues.

### Technology Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Framework** | **SvelteKit** | Provides SSR/CSR hybrid, file-based routing, and superior performance compared to React/Next.js due to lack of Virtual DOM. |
| **Language** | **TypeScript** | Strict typing is non-negotiable for financial applications to prevent floating-point errors and `undefined` states. |
| **Styling** | **TailwindCSS** | Utility-first CSS allows for rapid UI iteration and consistent theming (Dark/Light/VIP modes). |
| **State** | **Svelte Stores** | Native, lightweight state management that scales well for real-time frequency data. |
| **Math** | **Decimal.js** | IEEE 754 floating-point arithmetic (standard JS numbers) is unsafe for finance (e.g., `0.1 + 0.2 !== 0.3`). Decimal.js ensures arbitrary precision. |
| **Charts** | **Chart.js** | Canvas-based rendering for high-performance visualizations (Equity Curves, Scatter Plots) capable of handling thousands of data points. |
| **Testing** | **Vitest** | Blazing fast unit testing framework that shares configuration with Vite. |

### Client-Side State Management (The Store Pattern)

Cachy abandons the complex Redux/Context boilerplate in favor of Svelte's reactive Stores (`writable`, `derived`). The state is divided into domain-specific modules in `src/stores/`:

1.  **`accountStore.ts`**: The "Single Source of Truth" for the user's wallet.
    -   *Tracks*: Open Positions, Active Orders, Wallet Balances.
    -   *Update Mechanism*: Receives atomic updates from WebSockets (`updatePositionFromWs`).
2.  **`marketStore.ts`**: High-frequency market data.
    -   *Tracks*: Prices, Funding Rates, Order Book Depth.
    -   *Optimization*: Uses a dictionary map `Record<string, MarketData>` for O(1) access complexity when updating prices.
3.  **`tradeStore.ts`**: The "Drafting Board".
    -   *Tracks*: User inputs for a *potential* trade (Entry, SL, TP) before execution.
    -   *Persistence*: Automatically syncs to `localStorage` so users don't lose work on refresh.
4.  **`journalStore.ts`**: The Historical Record.
    -   *Tracks*: Array of `JournalEntry` objects (closed trades).
    -   *Analytics*: Serves as the raw dataset for the `calculator.ts` analytics engine.

### Backend-for-Frontend (BFF) & Proxy Layer

Located in `src/routes/api/`, this layer acts as a security gateway.

**The Problem**: Exchange APIs (Bitunix) require requests to be signed with an `API_SECRET`. If we make these requests from the browser, we must expose the Secret to the user's DevTools.

**The Solution**:
1.  Client sends request to `GET /api/sync/orders`.
2.  Client includes `API_KEY` and `API_SECRET` in custom headers (transported via HTTPS).
3.  Server (Node.js context) receives headers.
4.  Server constructs the payload, generates the SHA256 signature using the Secret.
5.  Server calls Bitunix API.
6.  Server returns the JSON result to Client.

*Note: While secrets travel from Client to Server, the Server is stateless and does not log or store them.*

---

## 3. Core Logic & Mathematics ("The Heart")

The mathematical heart of Cachy resides in `src/lib/calculator.ts`. This library is responsible for ensuring that every dollar shown on screen is accurate to the penny, regardless of leverage or fee structures.

### Precision Finance (Decimal.js Integration)
In traditional JavaScript, `0.1 + 0.2` equals `0.30000000000000004`. This "floating point drift" is unacceptable in finance. Cachy uses the `Decimal.js` library to treat numbers as arbitrary-precision objects.

**The Pipeline**:
```typescript
// Every input is converted immediately
const risk = new Decimal(values.accountSize).times(values.riskPercentage).div(100);
// Operations are chained methods
const positionSize = risk.div(entry.minus(sl).abs());
```

### The Risk Engine: A Concrete Example

Most trading interfaces work forwards: *Buy 1 BTC -> What is my risk?*
Cachy works backwards: *I want to risk $100 -> How much BTC should I buy?*

**Scenario**:
- **Account Size**: $10,000
- **Risk per Trade**: 1% ($100)
- **Entry Price**: $50,000
- **Stop Loss**: $49,000 (2% distance)

**Calculation Steps**:
1.  **Determine Distance**:
    $$ \Delta = | 50,000 - 49,000 | = 1,000 $$
2.  **Calculate Quantity (Size)**:
    $$ Qty = \frac{Risk}{\Delta} = \frac{100}{1,000} = 0.1 \text{ BTC} $$
3.  **Validation**:
    If price hits $49,000, loss is $0.1 \times 1,000 = \$100$. **The math holds.**
4.  **Leverage Check**:
    Value of position is $0.1 \times 50,000 = \$5,000$.
    If user has 10x leverage, Margin Required = $500.
    *The system validates that $500 < Available Balance.*

### Deep Dive Analytics: Trader Psychology

Cachy analyzes the `journalStore` to find behavioral patterns.

#### 1. Chronobiological Analysis (Timing)
*Goal: Do you trade better before lunch?*
The system iterates through every closed trade and buckets the PnL by Hour of Day (0-23) and Day of Week (0-6).
- **Implementation**:
  ```typescript
  hourlyNetPnl[date.getHours()].plus(trade.pnl);
  ```
- **Result**: A heat map showing "Danger Zones" (e.g., Friday Afternoons) where the trader historically loses money.

#### 2. Impulsivity Index (Duration)
*Goal: Are you "revenge trading"?*
The system plots Trade Duration vs. PnL.
- **Logic**: If a trader has a cluster of losses with duration < 2 minutes immediately following a large loss, this is flagged as impulsive behavior.

---

## 4. The Trade Lifecycle ("The Nervous System")

To understand how Cachy functions, we trace the lifecycle of a single trade from **Ideation** to **History**.

### Phase 1: Ideation (The Input Layer)
*Component: `TradeSetupInputs.svelte`*
1.  **User Input**: User types "BTC".
2.  **Reactive Fetch**: The component debounces the input (500ms) and calls `app.fetchAllAnalysisData()`.
3.  **Parallel Execution**:
    - **WebSocket**: Connects to `ticker` channel for real-time price.
    - **REST API**: Fetches last 1440 candles (1 day) to calculate ATR (Average True Range).
4.  **Auto-Fill**: The system uses the ATR to suggest a "safe" Stop Loss price (e.g., $Entry - 1.5 \times ATR$).

### Phase 2: Execution (The Proxy Layer)
*Component: `TradeSetupInputs.svelte` -> `apiService.ts`*
1.  **User Action**: Clicks "Long".
2.  **Payload Construction**: The App bundles Entry, SL, TP, and Size into a standardized JSON.
3.  **Proxy Call**: `POST /api/orders`.
4.  **Signing**: The Node.js server signs the request with the user's API Secret.
5.  **Exchange Confirmation**: Bitunix returns an Order ID.

### Phase 3: Monitoring (The Store Layer)
*Component: `PositionsSidebar.svelte`*
1.  **Socket Event**: Bitunix sends a `ORDER_UPDATE` via WebSocket.
2.  **Store Update**: `accountStore` receives the event. It sees status `FILLED`.
3.  **Atomic State Change**:
    - The "Pending Order" is removed from `openOrders`.
    - A new "Position" is created in `positions`.
4.  **UI Render**: The Sidebar instantly animates the new position into view.

### Phase 4: Closing & Journaling (The Sync Layer)
*Component: `app.ts` (Sync Logic)*
1.  **Closure**: User clicks "Close" or SL is hit.
2.  **History Fetch**: The app polls `get_history_positions`.
3.  **The "Safe Swap"**:
    - The system detects a Position ID in History that matches an active ID in `accountStore`.
    - It "Hydrates" the trade with final data (Realized PnL, Fees, Funding).
    - It moves the object from `accountStore` (Active) to `journalStore` (History).
    - It persists the new Journal Entry to `localStorage`.

---

## 5. External Integrations & Data Feeds

Cachy aims to be exchange-agnostic but currently optimizes for **Bitunix** (primary) and **Binance** (secondary).

### Exchange Connectivity

Connectivity is handled via the `src/services/apiService.ts` abstraction layer. This allows the UI to request `fetchTicker('BTCUSDT')` without knowing *which* exchange provides the data.

**Normalization Strategy**:
- Exchanges format data differently (e.g., Bitunix uses `lastPrice`, Binance uses `price`).
- The Service layer normalizes all responses into a standard `Ticker24h` or `Kline` interface before passing data to the UI.
- *Specific Handling*: Bitunix Futures symbols often end in `.P` or `USDTP`. The normalizer strictly strips these suffixes to maintain clean UI symbols (e.g., `BTCUSDT`).

### Hybrid Data Strategy: REST Polling vs. WebSocket Streams

To balance **Responsiveness** vs. **Rate Limits**, Cachy uses a hybrid approach:

1.  **Initial Load (REST)**:
    - Fetches full Order History (Pagination supported).
    - Fetches 1440 minutes of Kline history (for RSI/ATR calculation).
2.  **Real-Time (WebSocket)**:
    - **Public Channels**: `ticker`, `depth`, `trade`. Used for charting and price updates.
    - **Private Channels**: `order`, `position`, `wallet`. Used to update the User Dashboard.
    - *Heartbeat Logic*: A "Watchdog" timer in `BitunixWebSocketService` kills and restarts the connection if no "Pong" is received within 20 seconds, ensuring 99.9% uptime.

### The "Safe Swap" Synchronization Protocol

A critical challenge in syncing local state with remote API state is handling updates without "flickering" or data loss.

**The Logic (`src/services/app.ts`)**:
1.  **Fetch New Data**: The app retrieves the full list of open positions from the API.
2.  **Diffing**: It compares the new list against the `accountStore`.
3.  **Atomic Swap**:
    - If a position exists in Store but NOT in API -> It was closed. Move to Journal.
    - If a position exists in API but NOT in Store -> It was opened remotely. Add to Store.
    - If in BOTH -> Update PnL/Margin metrics.
    - *Crucial*: This happens in a `try/catch` block. If the API fetch fails, the local state is **preserved** (not wiped), preventing the "Zero Balance" scare common in other apps.

---

## 6. Security & Privacy Model

Cachy operates on a **"Trust No One"** architecture.

### Local-First Data Storage
- **Mechanism**: Data is stored in `localStorage` using the keys `cachy_trade_store` (drafts), `tradeJournal` (history), and `cryptoCalculatorSettings` (config).
- **Benefit**: Even if the Cachy hosting server is compromised or taken offline, the user's data remains safe on their device.
- **Portability**: Users can export their entire database as a JSON/CSV file via the "Backup" feature in Settings.

### API Key Handling & Proxy Security
Cachy acts as a pass-through entity.
- **Client Side**: API Keys are stored in the browser. They are *never* sent to Cachy's server for storage.
- **Transit**: Keys are sent only in the HTTP Headers of specific API requests.
- **Server Side**: The Node.js proxy receives the request, signs it using the Secret, forwards it to Bitunix, and immediately discards the credentials from memory. No logs are kept.

### No-Database Architecture
By removing the database:
1.  **Attack Vector Elimination**: SQL Injection and Database Leaks are impossible.
2.  **GDPR/CCPA Compliance**: We do not process user data, so compliance is automatic by design.

---

## 7. Scalability & Future Roadmap

While the current Local-First model is robust for individual traders, the roadmap includes scaling to support teams and institutional requirements.

### Phase 1: From Local-First to Sync-Enabled (Optional Cloud)
*Objective: Allow users to sync data between Desktop and Mobile.*
- **Plan**: Implement an *optional* End-to-End Encrypted (E2EE) cloud relay.
- **Tech**: Use a CRDT (Conflict-free Replicated Data Type) library like Yjs or Automerge. The server would store encrypted blobs without having the keys to decrypt them.

### Phase 2: Mobile Native Adaptation
*Objective: Push to App Store/Play Store.*
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
1.  **Build**: `npm run build` (Compiles SvelteKit to `build/`)
2.  **Run**: `node build/index.js` or via PM2: `pm2 start server.js --name "cachy-app"`
3.  **Reverse Proxy**: Nginx is recommended to handle SSL termination and forward traffic to Port 3000.

---

**End of Document**
