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
    - User First: The "Speed of Thought" Interface
    - Money First: Risk Management as a First-Class Citizen
    - Community First: The Privacy Manifesto
2. [System Architecture](#2-system-architecture)
    - High-Level Overview
    - Technology Stack
    - Client-Side State Management (The Store Pattern)
    - Backend-for-Frontend (BFF) & Proxy Layer
    - Data Flow & Reactivity
3. [Core Logic & Mathematics ("The Secret Sauce")](#3-core-logic--mathematics-the-secret-sauce)
    - Precision Finance (`Decimal.js` Integration)
    - Dynamic Risk & Position Sizing Engine
    - PnL Normalization & Fee Structures
    - Deep Dive Analytics: Algorithms for Trader Psychology
4. [External Integrations & Data Feeds](#4-external-integrations--data-feeds)
    - Exchange Connectivity (Bitunix, Binance)
    - Hybrid Data Strategy: REST Polling vs. WebSocket Streams
    - The "Safe Swap" Synchronization Protocol
5. [Security & Privacy Model](#5-security--privacy-model)
    - Local-First Data Storage
    - API Key Handling & Proxy Security
    - No-Database Architecture
6. [Scalability & Future Roadmap](#6-scalability--future-roadmap)
    - From Local-First to Sync-Enabled (Optional Cloud)
    - Mobile Native Adaptation
    - Institutional Features
7. [Developer Guide](#7-developer-guide)
    - Setup & Installation
    - Testing Strategy
    - Deployment Pipeline

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

### Data Flow & Reactivity

The system uses a **Hybrid Push/Pull** model:

1.  **Initialization (Pull)**: On load, the app REST-polls `GET /api/sync/positions` to get the baseline state.
2.  **Live Updates (Push)**: The app connects to `wss://fapi.bitunix.com`.
3.  **Reactivity**:
    ```mermaid
    graph LR
    WS[WebSocket Stream] -->|JSON Payload| Service[BitunixWebSocketService]
    Service -->|Dispatch| Store[accountStore]
    Store -->|Reactive Update ($)| UI[PositionsSidebar / Dashboard]
    UI -->|User Action| API[API Proxy]
    API -->|REST| Exchange[Bitunix Exchange]
    ```

---

## 3. Core Logic & Mathematics ("The Secret Sauce")

The heart of Cachy is `src/lib/calculator.ts`. This library transforms raw data into actionable intelligence.

### Precision Finance (Decimal.js Integration)

JavaScript uses 64-bit floating-point numbers (IEEE 754), which leads to notorious errors (e.g., `0.1 + 0.2 = 0.30000000000000004`). In crypto trading, where asset prices can have 8 decimal places (e.g., PEPE at $0.00000123) and leverage can amplify tiny errors into significant PnL discrepancies, standard math is unacceptable.

Cachy implements **Decimal.js** for all financial calculations.

**Example Implementation:**
```typescript
// src/lib/calculator.ts
const entryFee = orderVolume.times(values.fees.div(100));
const netLoss = riskAmount.plus(entryFee).plus(slExitFee);
```
*Every arithmetic operation (addition, multiplication, division) is a method call on a Decimal object, ensuring arbitrary precision is maintained throughout the pipeline.*

### Dynamic Risk & Position Sizing Engine

Cachy reverses the traditional trading input flow. Instead of asking "How much BTC do you want to buy?", it asks "How much $ do you want to risk?".

**The Algorithm**:
1.  **Calculate Risk Per Unit**: Distance between Entry Price and Stop Loss Price.
    $$ \Delta_{price} = | P_{entry} - P_{stoploss} | $$
2.  **Determine Position Size**:
    $$ Qty = \frac{R_{dollars}}{\Delta_{price}} $$
3.  **Calculate Required Margin**:
    $$ Margin = \frac{Qty \times P_{entry}}{Leverage} $$

This ensures that if the Stop Loss is hit, the loss is *exactly* the user's pre-defined risk amount (plus fees), regardless of the asset's volatility.

### Deep Dive Analytics: Algorithms for Trader Psychology

Cachy goes beyond simple "Win Rate" metrics to analyze *how* a user trades. These metrics are generated client-side in `calculator.ts` by iterating over the `journalStore`.

#### 1. Timing Analysis (Chronobiology of Trading)
*Goal: Identify if a trader performs better in the Morning vs. Night.*
- **Method**: The system buckets all trades into 24 one-hour slots and 7 day-of-week slots.
- **Data Points**:
  - `hourlyNetPnl`: Accumulates PnL for each hour (0-23).
  - `dayGrossProfit/Loss`: Separates wins and losses to see if specific days are "high variance".
- **Insight**: "You lose 80% of your money on Fridays."

#### 2. Duration Scatter Logic (Patience vs. Impulsivity)
*Goal: Visualize the relationship between holding time and profitability.*
- **Algorithm**:
  - Timestamp `Start` = `entryDate` (Synced) or `date` (Manual).
  - Timestamp `End` = `exitDate` (Manual) or `date` (Synced Close Time).
  - $$ Duration = End - Start $$
  - Plot points $(x, y)$ where $x = Duration$, $y = PnL$.
- **Insight**: A cluster of losses in the <5 minute range indicates impulsive "revenge trading".

#### 3. R-Multiple Distribution
*Goal: Normalize performance across different account sizes.*
- **Concept**: PnL in dollars is irrelevant if account size changes. PnL in "R" (Risk Units) is universal.
- **Calculation**:
  $$ R = \frac{PnL_{realized}}{Risk_{initial}} $$
- **The "Holy Grail" Metric**: The system calculates `expectancy` (average R per trade). If Expectancy > 0, the strategy is mathematically profitable in the long run.

---

## 4. External Integrations & Data Feeds

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

## 5. Security & Privacy Model

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

## 6. Scalability & Future Roadmap

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

## 7. Developer Guide

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
