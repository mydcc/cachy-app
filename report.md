# In-Depth Code Analysis & Status Report

## Status Quo & Vulnerabilities (Step 1)

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Floating Point Precision Loss via Native Casting**:
    *   **Finding**: Code in `src/routes/api/orders/+server.ts`, `src/lib/calculators/charts.ts`, and UI components like `SymbolPickerView.svelte` use native JS `Number()` or `parseFloat()` directly on financial values (e.g., `Number(snapshot[s]?.priceChangePercent)` or `Number(lastKline.open)`).
    *   **Risk**: Critical risk for financial loss due to IEEE-754 precision issues on large quantities or micro-prices. These should explicitly construct `new Decimal(val).toNumber()` where the terminal conversion to native float is unavoidable.

2.  **Missing i18n Keys & Silent Failures (`src/services/tradeService.ts`)**:
    *   **Finding**: Code references literal strings like `throw new Error("tradeErrors.dataError")` and `trade.apiError`, but these are missing from `en.json`, `de.json`, and the `schema.d.ts`.
    *   **Risk**: The frontend i18n library will fail to resolve keys, either crashing the component or displaying raw text during critical connection or trade execution errors.
    *   **UX Impact**: Non-actionable error messages when the API fails or a position is missing.

3.  **Memory Leaks via Unmanaged Timers**:
    *   **Finding**: Stores and services like `marketWatcher.ts`, `apiService.ts`, and `omsService.ts` instantiate `setInterval` or `setTimeout` but fail to implement or correctly trigger `import.meta.hot.dispose` with rigorous `destroy()` methods.
    *   **Risk**: Zombie timers will leak memory over extended HMR sessions or navigation lifecycle changes, eventually causing a browser tab crash.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **High-Frequency Reactivity Thrashing (`src/stores/market.svelte.ts`)**:
    *   **Finding**: Svelte reactivity store polling loops (e.g., `flushIntervalId` at 250ms) are executing continuously without sufficient batching logic.
    *   **Risk**: Massive DOM thrashing when market data stream is highly active.

2.  **Hardcoded Error Enums**:
    *   **Finding**: Widespread use of hardcoded strings (e.g., `apiErrors.invalidAmount`) without corresponding constants. `TRADE_ERRORS` map itself bypasses TypeScript schema safety.

### 🔵 REFACTOR (Code smell, technical debt)

1.  **Redundant Type Validation Guards (`src/services/marketWatcher.ts`)**:
    *   **Finding**: Checks like `!(klines[0].open instanceof Decimal)` point to mistrust in upstream data normalization processes (e.g., Zod schemas missing `.transform`).
    *   **Impact**: Wasted cycles and defensive boilerplate that hides root API schema configuration issues.

---

## Action Plan (Planning Phase - Step 2)

### Group 1: Floating Point Math & Precision Hardening (CRITICAL)

**Justification:** Measurably improves stability by ensuring core API payloads and terminal sorting operations maintain strict Decimal boundaries until Svelte/HTML constraints mandate otherwise.
*   **Action**: Trace and replace native `Number()`/`parseFloat()` usage in `CandleChartView.svelte` and `SymbolPickerView.svelte` with `new Decimal(val).toNumber()`.
*   **Action**: Ensure API routes use `Decimal` for any limit/amount calculations.
*   **Unit Test to Reproduce (Before Fix)**: Expand `safeJson.test.ts` to assert loss of precision when natively parsing large quantities, ensuring `new Decimal(val)` explicitly preserves it.

### Group 2: Svelte i18n Error Reporting & Typings (CRITICAL)

**Justification:** Measurably improves stability by guaranteeing runtime translations never throw or display undefined objects to the user.
*   **Action**: Add missing `"tradeErrors.dataError"`, `"apiErrors.missingCredentials"`, `"apiErrors.invalidAmount"` to `en.json`, `de.json`, and `schema.d.ts`.
*   **Action**: Replace string throws with enums.

### Group 3: Memory Leak Elimination (CRITICAL)

**Justification:** Prevents platform crashes during long trading sessions (measurably improves stability/performance).
*   **Action**: Implement `public destroy()` on `apiService.ts`, `omsService.ts` and add SvelteKit HMR logic: `if (import.meta.hot) { import.meta.hot.dispose(() => instance.destroy()); }`.

### Execution Guidelines Adherence
*   **Defensive Programming**: We assume missing API i18n keys crash standard `svelte-i18n` render paths.
*   **No Regressions**: No UI behaviors change; only stability improvements.
*   **Financial Standards**: Using `new Decimal().toNumber()` bridges safe math to strict D3/Canvas APIs.
