
# Status & Risk Report

## Data Integrity & Mapping
- 🔴 CRITICAL: Potential floating point inaccuracy using native number parsing for price/amount in src/components/inputs/TradeSetupInputs.svelte

## Resource Management & Performance
- 🔴 CRITICAL: Memory Leak: Uncleared `setInterval` timers discovered in:
  - `src/services/apiService.ts` (cleanupInterval) -> Although cleared in `destroy()`, check if `destroy` is always called.
  - `src/services/omsService.ts` (watchdogInterval)
  - `src/services/bitunixWs.ts` (globalMonitorInterval, pingTimerPublic, pingTimerPrivate)
  - `src/services/bitgetWs.ts` (globalMonitorInterval, pingTimer)
  - `src/stores/market.svelte.ts` (cleanupIntervalId, flushIntervalId, telemetryIntervalId) -> The types are `any` which is unsafe.
  - `src/stores/chat.svelte.ts` (poll)

- 🔴 CRITICAL: Potential unbounded memory growth in Stores (e.g., `marketState.data`). We need to implement proper LRU or size capping. The current implementation uses `Array.push()` inside WebSocket message handlers which may lead to memory leaks over time.

## UI/UX & Accessibility
- 🟡 WARNING: Hardcoded strings and missing i18n keys detected. Error messages in services often use raw strings (e.g. `new Error("Invalid parameters")`) instead of standard i18n codes.
- 🟡 WARNING: Re-renders in UI thread. Some `$state` or `$derived` calculations in Svelte stores (e.g. `market.svelte.ts`) trigger unnecessary reactivity due to object reference mutations.

## Security & Validation
- 🔴 CRITICAL: Type Safety. Several critical interfaces in `tradeService.ts` (e.g., `TpSlOrder`) and `market.svelte.ts` use `any` or lack strict Zod validation before interacting with the API. This can lead to unhandled runtime exceptions.
- 🔵 REFACTOR: Error messages exposing raw API details. We need to wrap all API errors into actionable, localized UI messages.
