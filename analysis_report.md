
# Systemic Maintenance & Hardening Report

## 🔴 CRITICAL
- **Type Safety** in `src/services/tradeService.ts` and `src/services/newsService.ts`: Usage of "any" type found in catch blocks and generic API response mappings, which bypasses type checking and risks runtime exceptions if properties are missing.
- **Data Integrity** in `src/services/marketWatcher.ts`: Potential lack of Decimal.js usage for calculations.

## 🟡 WARNING
- **Memory Leak** in `src/services/bitunixWs.ts`: Complex heartbeat logic uses `setInterval` for `pingTimerPublic` and `pingTimerPrivate`. While there are `clearInterval` calls, extreme care must be taken that edge cases don't orphan these timers during rapid reconnects.

## 🔵 REFACTOR
- **Hardcoded Strings**: While basic analysis flagged `{@html}` blocks in `.svelte` files as security risks, manual inspection revealed these are safe static SVG icons. However, there might be missed i18n keys that require manual auditing.
