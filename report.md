# In-depth Analysis & Report: Institutional-Grade Hardening of cachy-app

## Overview
This report details findings from a read-only analysis of the cachy-app codebase, identifying areas of risk related to financial security, data integrity, performance, user experience, and accessibility. The goal is to raise the codebase to an "institutional grade" standard.

## Findings

### 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.
1. **Inconsistent Decimal Handling (`Number()` vs `Decimal`):**
   - *Risk:* Financial loss due to floating-point precision errors and parsing failures.
   - *Finding:* In several locations across the app (e.g., `src/stores/ai.svelte.ts`, `src/services/mdaService.ts`, `src/services/julesService.ts`), native `Number()` is used for parsing numeric values, prices, and quantities.
   - *Recommendation:* Replace all `Number()` parsing for financial values with `Decimal`. Strict checks must be applied.

2. **Thundering Herd / Unbounded Concurrency:**
   - *Risk:* API Rate limits exceeded (429), gateway bans, missed critical market updates.
   - *Finding:* The `TradeService` does not deduplicate requests to fetch positions (`fetchOpenPositionsFromApi`). This can cause simultaneous identical requests to flood the API.
   - *Recommendation:* Implement Promise coalescing / deduplication to limit concurrency for the same operations.

3. **Error Handling & Data Extraction (`mdaService.ts`):**
   - *Risk:* Unhandled exceptions if raw data is malformed.
   - *Finding:* Bypassing TypeScript checks or lacking `.passthrough()` verification before passing values down to Decimal constructors.

### 🟡 WARNING: Performance issue, UX error, missing i18n.
1. **Missing i18n Keys:**
   - *Risk:* Poor user experience, broken UI strings.
   - *Finding:* Hardcoded strings in components, failing to use Svelte i18n stores (`_`).

2. **WebSocket & Timer Leaks:**
   - *Risk:* Ghost connections and zombie timers after component unmount.
   - *Finding:* Missing or incomplete `onDestroy` and `import.meta.hot.dispose` lifecycle bounds for intervals in singletons.

3. **Performance in Hot Loops:**
   - *Risk:* UI stuttering, high CPU usage.
   - *Finding:* Unbounded Map caching, and unoptimized array loops (e.g., in UI re-renders or data aggregation paths).

### 🔵 REFACTOR: Code smell, technical debt.
1. **Test Environment Hardening:**
   - *Risk:* Flaky test suites.
   - *Finding:* `console.error` leakage in tests and incomplete SvelteKit environment mocking.
