_<feedback@cachy.app>_

bc1qgrm2kvs27rfkpwtgp5u7w0rlzkgwrxqtls2q4f

---

# Changelog

### Table of Contents

1. [Version 0.94.2](#v0.94.2)
2. [Version 0.94.1](#v0.94.1)
3. [Version 0.94.0](#v0.94.0)
4. [Version 0.93.0](#v0.93.0)
5. [Version 0.92.2](#v0.92.2)
6. [Version 0.92.1](#v0.92.1)
7. [Version 0.92.0](#v0.92.0)

---

## <a name="v0.94.2"></a>Version 0.94.2 (January 2026)

- **Context-Aware AI**: The AI Assistant now has access to real-time market context:
    - **News Integration**: Fetches sentiment from CryptoPanic and NewsAPI via a secure proxy.
    - **CoinMarketCap**: Accesses fundamental data (Market Cap, Volume) for better analysis.
    - **Trade History**: Can review your recent trades to provide behavioral coaching.
- **Gemini 2.5**: Added support for Google's latest Gemini 2.5 Flash model for faster and more accurate responses.
- **Localization**: Fixed missing translation keys for backup password prompts and integration settings.
- **Performance**: Removed blocking WASM initialization for technical indicators, switching to a lightweight JS implementation.
- **Architecture:** **Global Subscription Management**: Introduced the `MarketWatcher` service to centralize all WebSocket subscriptions.
- **System:** **Reference Counting**: Intelligent tracking of data requests to prevent connection drops when multiple panels are open simultaneously.
- **Robustness:** **Symbol Normalization**: Consistent handling of symbol suffixes (`.P`, `:USDT`) for stable data mapping between API and UI.
- **Fix:** **Technicals Stability**: Resolved freezing issues when rapidly switching between trading pairs in the Technicals Panel.
- **New:** **"Debug Mode" Setting**: Opt-in detailed system logs in the browser console for improved troubleshooting.
- **Improvement:** **Real-time Indicators**: Directly connected RSI and technical calculations to the internal market store for faster updates.

## <a name="v0.94.1"></a>Version 0.94.1 (January 2026)

- **New:** **Jules API**: Intelligent AI-driven error analysis and reporting system for instant diagnostics.
- **New:** **Technicals Panel**: Advanced charting overlay with RSI, MACD, Stochastic, and Auto-Pivots.
- **Upgrade:** **More Accurate Indicator Calculations**: Migrated to `talib-web` (WebAssembly) for exact alignment with TradingView. All technical indicators (RSI, Stochastic, CCI, ADX, MACD, Momentum, EMA) now use the same algorithms as professional trading platforms.
- **New:** **Chat / Side Panel**: Collapsible side panel for private notes or global chat (requires experimental API).
- **Architecture:** Enhanced "Jules Service" for secure system snapshots and telemetry without compromising privacy.

---

## <a name="v0.94.0"></a>Version 0.94.0 (January 2026)

- **New:** Websocket integration for Bitunix (Real-time prices, depth, ticker).
- **New:** Performance Tracking (Pro): Advanced charts and Deep Dive analytics in the Journal.
- **New:** Market Overview & Sidebar: Improved layout with real-time data and Favorites.
- **New:** Enable "Side Panel" in Settings -> Sidebar. Choose between "Private Notes" (local storage only) or "Global Chat" mode.
- **Improvements:** General stability updates and UI adjustments.

---

## <a name="v0.93.0"></a>Version 0.93.0 (December 21, 2025)

- **New:** "Show Sidebars" setting: Toggle visibility of the sidebar (favorites) and Market Overview to save screen space on desktop and mobile.
- **Improvement:** Enhanced mobile layout with integrated positions view.
- **Fix:** Fixed Bitunix "Pending Positions" calculation issues (handling of 'side' parameter).
- **System:** Improved internal data structure for settings and API keys.
- **New:** Backup & Restore feature: Create backups of your data (settings, journal, presets) and restore them when needed.
- **Improvement:** Risk per Trade input now supports up to 2 decimal places.
- **Improvement:** General stability improvements.
- **New:** Favorites feature: Save up to 4 symbols by clicking the star icon in the Market Overview. Favorites are displayed in the sidebar (desktop) or below the main card (mobile).
- **New:** Auto-fetch account balance on startup (enable in settings, requires API keys).
- **New:** Auto-update price input field (optional).
- **Fix:** Fixed deployment issues (502 errors) and improved stability.

---

## <a name="v0.92.2"></a>Version 0.92.2 (December 11, 2025)

- **New:** "Market Overview" displays 24h data (Price, Volume, Change) for the current symbol.
- **New:** Expanded settings: Select API provider (Bitunix/Binance) and market data update interval (1s, 1m, 10m).

---

## <a name="v0.92.1"></a>Version 0.92.1 (September 04, 2025)

- **New:** Automatic ATR fetch from Binance API with selectable timeframe (5m, 15m, 1h, 4h, 1d). The fetched value can be manually adjusted.
- **New:** Advanced locking functions: The risk amount in currency can now be locked to calculate position size and risk percentage.
- **New:** Keyboard shortcuts (`Alt+L/S/R/J`) added for faster operation.
- **New:** Modals can now be closed with the `Escape` key or by clicking the background.

---

## <a name="v0.92.0"></a>Version 0.92.0 (August 22, 2025)

- **Improvement:** Symbol input field now accepts letters and numbers.
- **Fixed:** Tooltip border is now theme-dependent and the double border issue has been fixed.
- **Improvement:** "Add Trade to Journal" and "Show Instructions" buttons are now theme-dependent.
