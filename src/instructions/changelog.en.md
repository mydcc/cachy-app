*feedback@cachy.app*

bc1qgrm2kvs27rfkpwtgp5u7w0rlzkgwrxqtls2q4f

***

# Changelog

### Table of Contents
1.  [Version 0.98](#v0.98)
2.  [Version 0.96](#v0.96)
3.  [Version 0.94](#v0.94)
4.  [Version 0.92b2](#v0.92b2)
5.  [Version 0.92b1](#v0.92b1)
6.  [Version 0.92b](#v0.92b)

---

## <a name="v0.98"></a>Version 0.98 (January 2026)
- **New:** **Jules API**: Intelligent AI-driven error analysis and reporting system for instant diagnostics.
- **New:** **Technicals Panel**: Advanced charting overlay with RSI, MACD, Stochastic, and Auto-Pivots.
- **Upgrade:** **More Accurate Indicator Calculations**: Migrated to `talib-web` (WebAssembly) for exact alignment with TradingView. All technical indicators (RSI, Stochastic, CCI, ADX, MACD, Momentum, EMA) now use the same algorithms as professional trading platforms.
- **New:** **Chat / Side Panel**: Collapsible side panel for private notes or global chat (requires experimental API).
- **Architecture:** Enhanced "Jules Service" for secure system snapshots and telemetry without compromising privacy.

---

## <a name="v0.96"></a>Version 0.96 (January 2026)
- **New:** Websocket integration for Bitunix (Real-time prices, depth, ticker).
- **New:** Performance Tracking (Pro): Advanced charts and Deep Dive analytics in the Journal.
- **New:** Market Overview & Sidebar: Improved layout with real-time data and Favorites.
- **New:** Enable "Side Panel" in Settings -> Sidebar. Choose between "Private Notes" (local storage only) or "Global Chat" mode.
- **Improvements:** General stability updates and UI adjustments.

---

## <a name="v0.94"></a>Version 0.94 (December 21, 2025)
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

## <a name="v0.92b2"></a>Version 0.92b2 (December 11, 2025)
- **New:** "Market Overview" displays 24h data (Price, Volume, Change) for the current symbol.
- **New:** Expanded settings: Select API provider (Bitunix/Binance) and market data update interval (1s, 1m, 10m).

---

## <a name="v0.92b1"></a>Version 0.92b1 (September 04, 2025)
- **New:** Automatic ATR fetch from Binance API with selectable timeframe (5m, 15m, 1h, 4h, 1d). The fetched value can be manually adjusted.
- **New:** Advanced locking functions: The risk amount in currency can now be locked to calculate position size and risk percentage.
- **New:** Keyboard shortcuts (`Alt+L/S/R/J`) added for faster operation.
- **New:** Modals can now be closed with the `Escape` key or by clicking the background.

---

## <a name="v0.92b"></a>Version 0.92b (August 22, 2025)
- **Improvement:** Symbol input field now accepts letters and numbers.
- **Fixed:** Tooltip border is now theme-dependent and the double border issue has been fixed.
- **Improvement:** "Add Trade to Journal" and "Show Instructions" buttons are now theme-dependent.
