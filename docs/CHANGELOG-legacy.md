# Legacy Changelog (before automated releases)

These entries were maintained by hand in `README.md` before the project moved to
semantic-release. They are preserved here for historical reference and are no
longer updated.

Version numbers use the informal scheme of the time (e.g. `0.94b1` for betas).
Everything from **v0.94.3** onward is generated automatically in
[`CHANGELOG.md`](../CHANGELOG.md) from Conventional Commit messages.

---

## Version 0.94.3 (February 2026)

- **Architecture:** **Local-First Only**: Removed "Global Chat" and "Community Cloud".
- **New:** **Trading Academy**: Interactive learning modules.
- **Tech:** **Svelte 5 Migration**: Complete refactor to Runes.
- **RSS Feed Integration**: Custom RSS feeds for AI context.

---

## Version 0.94.2 (January 2026)

- **Architecture:** **Global Subscription Management**: Centralized WebSocket management with the `MarketWatcher` service.
- **System:** **Reference Counting**: Smart data request tracking to prevent connection drops.
- **Robustness:** **Symbol Normalization**: Improved handling of symbol suffixes for stable API mapping.

- **Feature:** **Technicals Panel**: Advanced chart overlay with indicators (RSI, MACD, Stoch) using `talib-web`.
- **New:** **Debug Mode**: Opt-in system logs for better diagnostics.

---

## Version 0.94b2 (February 2026)

- **New:** "Show Sidebars" setting: Toggle visibility of the sidebar (favorites) and Market Overview to save screen space on desktop and mobile.
- **Improvement:** Enhanced mobile layout with integrated positions view.
- **Fix:** Fixed Bitunix "Pending Positions" calculation issues (handling of 'side' parameter).
- **System:** Improved internal data structure for settings and API keys.

---

## Version 0.94b1 (January 2026)

- **New:** Backup & Restore feature: Create backups of your data (settings, journal, presets) and restore them when needed.
- **Improvement:** Risk per Trade input now supports up to 2 decimal places.
- **Improvement:** General stability improvements.

---

## Version 0.94 (December 21, 2025)

- **New:** Favorites feature: Save up to 4 symbols by clicking the star icon in the Market Overview. Favorites are displayed in the sidebar (desktop) or below the main card (mobile).
- **New:** Auto-fetch account balance on startup (enable in settings, requires API keys).
- **New:** Auto-update price input field (optional).
- **Fix:** Fixed deployment issues (502 errors) and improved stability.

---

## Version 0.92b2 (December 11, 2025)

- **New:** "Market Overview" displays 24h data (Price, Volume, Change) for the current symbol.
- **New:** Expanded settings: Select API provider (Bitunix/Bitget) and market data update interval (1s, 1m, 10m).

---

## Version 0.92b1 (September 04, 2025)

- **New:** Automatic ATR fetch from Bitget API with selectable timeframe (5m, 15m, 1h, 4h, 1d). The fetched value can be manually adjusted.
- **New:** Advanced locking functions: The risk amount in currency can now be locked to calculate position size and risk percentage.
- **New:** Keyboard shortcuts (`Alt+L/S/R/J`) added for faster operation.
- **New:** Modals can now be closed with the `Escape` key or by clicking the background.

---

## Version 0.92b (August 22, 2025)

- **Improvement:** Symbol input field now accepts letters and numbers.
- **Fixed:** Tooltip border is now theme-dependent and the double border issue has been fixed.
- **Improvement:** "Add Trade to Journal" and "Show Instructions" buttons are now theme-dependent.
