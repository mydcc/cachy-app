# Cachy Codebase Analysis & Hardening Report

This report provides an in-depth code analysis of the `cachy-app` repository with a strict focus on institutional-grade financial security, data integrity, resource management, and UI/UX accessibility.

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Floating Point Vulnerabilities via `toNumber()` Conversions**
   - **Location:** `src/lib/calculators/charts.ts`, `src/lib/calculators/stats.ts`, and `src/components/inputs/TradeSetupInputs.svelte`
   - **Risk:** The codebase makes heavy use of `new Decimal()` for precision logic, which is excellent. However, there are over 40 occurrences where `Decimal.toNumber()` or `parseFloat()` is executed downstream when rendering charts or computing aggregate portfolio stats. This introduces JS native IEEE 754 float imprecision right back into the calculation loop, posing a risk of financial calculation mismatch on high-precision altcoins or massive lot sizes.
   - **Recommendation:** Only convert to `.toString()` or primitive numbers strictly at the DOM boundary (UI rendering), and ensure intermediate aggregates strictly maintain `Decimal` objects.

2. **Unsafe `any` Types in API Deserialization**
   - **Location:** `src/services/apiService.ts` (e.g., `let errData: any = {}`), `src/services/tradeService.ts` (`cancelTpSlOrder(order: any)`)
   - **Risk:** Using `any` bypasses TypeScript's safety nets. If API definitions change silently or malicious/malformed payloads are injected, Svelte will attempt to read undefined properties, causing fatal runtime exceptions or placing ghost orders.
   - **Recommendation:** Replace `any` with `Record<string, unknown>` and explicitly type API responses with Zod schemas.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Aggressive Cache Clears (Memory & Thundering Herd Risk)**
   - **Location:** `src/services/marketWatcher.ts` (`exhaustedHistory.clear()`), `src/services/bitunixWs.ts` (`throttleMap.clear()`), `src/stores/market.svelte.ts`.
   - **Risk:** Unbounded Maps and Sets are currently protected by a hard threshold check (e.g., `size > 1000`) followed by an immediate `.clear()`. This deletes *all* state abruptly, losing rate-limiting tracking and active locks, potentially causing a "thundering herd" of concurrent network requests right after the clear.
   - **Recommendation:** Implement bounded eviction strategies (e.g., sorting and slicing the oldest 500 entries) rather than completely clearing the maps.

2. **Hardcoded Strings & Missing i18n Keys**
   - **Location:** `src/stores/chat.svelte.ts` (`throw new Error("Please wait 2 seconds between messages.");`). Missing schema definitions for API errors like `apiErrors.invalidResponseFormat` and `apiErrors.invalidJson`.
   - **Risk:** Broken user experience for non-English users and missing translation warnings in production.
   - **Recommendation:** Abstract string literals into the Svelte `$_()` i18n dictionary.

3. **Hot Path Thrashing in UI Calculations**
   - **Location:** `src/stores/market.svelte.ts`
   - **Risk:** Using `setInterval` loops for market cache syncing and telemetry without properly cleaning up Svelte `$effect` roots when components unmount can lead to excessive background CPU usage. Svelte effects are deeply nested in singleton instantiation.
   - **Recommendation:** Move background polling entirely to WebWorkers or ensure strict `clearInterval` hooks inside standard lifecycle `onDestroy`.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Sanitization of Trusted Markdown**
   - **Location:** `src/utils/markdownUtils.ts` and `src/components/shared/ChartPatternsView.svelte`.
   - **Risk:** Usage of `renderTrustedMarkdown` paired with `{@html ...}` tags. While currently safe if the content is completely internal, it sets a dangerous precedent.
   - **Recommendation:** Enforce `DOMPurify.sanitize()` uniformly via a central helper, replacing `renderTrustedMarkdown` completely to harden against future dynamic content injections.

---

# Step 2: Implementation Action Plan

### Domain 1: Hardening Types & Resolving API Fragility (CRITICAL)
- **Task:** Eliminate generic `any` casting in `apiService.ts` and `tradeService.ts`.
- **Target:** Change `cancelTpSlOrder(order: any)` to `cancelTpSlOrder(order: TpSlOrder)`. Apply `Record<string, unknown>` to JSON mapping loops and error response destructurings.
- **Test Case:** *Write a unit test simulating a malformed WebSocket payload missing a `price` key to ensure `apiService` handles it gracefully rather than throwing a type error.*

### Domain 2: Preventing Memory Culling Leaks (WARNING)
- **Task:** Rewrite the unbounded `.clear()` operations.
- **Target:** In `bitunixWs.ts` and `marketWatcher.ts`, replace `map.clear()` with an array slicing mechanism that sorts by timestamp, preserving the most recent 500 records.

### Domain 3: Completing i18n & Error Handling (WARNING)
- **Task:** Move hardcoded texts to language JSONs.
- **Target:** Extract `"Please wait 2 seconds between messages."` into `de.json` and `en.json` under `chat.rateLimit`. Add missing `apiErrors.*` variants to the `schema.d.ts` definitions.
