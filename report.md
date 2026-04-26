# Code Analysis Report (cachy-app)

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

### 1. Floating Point Inaccuracies in Serialization/Deserialization
- **Issue**: Several places map numeric values using `Number()` or native JS parsing instead of strictly using `Decimal.js`. This violates the institutional grade standard.
- **Locations**:
    - `src/services/mdaService.ts`: `time: Number(k.time || k.t || k.ts || k.timestamp)`
    - `src/stores/ai.svelte.ts`: Extensive use of `Number(d.priceStart).toFixed(4)`, `Number(marketData.priceChangePercent)`, etc. instead of `Decimal`.
    - `src/services/bitunixWs.ts`: `t: Number(item.t ?? item.ts ?? item.time ?? Date.now())`
- **Why it matters**: In cryptocurrency trading, even microscopic rounding errors can cause failed orders, incorrect risk calculations, and cascading financial issues.

### 2. Missing `.clearTimeout()` and `.clearInterval()` in Store/Service Destruction
- **Issue**: Several singleton and stateful services set timers but lack explicit cleanup hooks (e.g. `destroy()`).
- **Locations**:
    - `src/services/toastService.svelte.ts`: `setTimeout` creates timers in `toasts.push` without capturing and cleaning up on service disposal.
    - `src/services/marketWatcher.ts`: Contains `pollingTimeout`, `startTimeout`, `staggerTimeouts` without a comprehensive `destroy()` or cleanup.
    - `src/services/newsService.ts`: Abort controllers use `setTimeout` but the timeouts themselves aren't cleared if the request finishes early, leading to potential zombie timers firing on destroyed components.
- **Why it matters**: Severe memory leaks and zombie processes updating state out-of-band in a long-running SPA trading application.

### 3. Type Safety and Unsafe Direct Map/Castings
- **Issue**: Casting API responses using `any` or generic interfaces without runtime validation (e.g., Zod) in critical data fetching.
- **Locations**:
    - `src/services/newsService.ts`: `(Array.isArray(data?.results) ? data.results : []).map((item: any) => ...)`.
    - `src/services/tradeService.ts`: `private serializePayload(payload: unknown, depth = 0, seen = new WeakSet()): any` – recursive `any` serialization.
- **Why it matters**: If an exchange API changes its schema (e.g., sending nulls instead of numbers), it will instantly crash the app or feed NaN values into the risk engine.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

### 1. Missing Internationalization (i18n)
- **Issue**: Hardcoded UI strings or log messages shown to users instead of utilizing the translation store.
- **Locations**:
    - `src/services/apiService.ts`: Hardcoded `console.error(e)` instead of user-facing toast with translated errors.
    - Hardcoded string `"Unknown"` in `ai.svelte.ts:807` rather than an i18n fallback.
- **Why it matters**: "Broken states" for non-English speakers or confusing debug strings presented as UI content.

### 2. Infinite State Growth (Memory Leaks)
- **Issue**: Growing arrays or sets without proper eviction policies.
- **Locations**:
    - `src/stores/journal.svelte.ts:112`: Uses `this.entries.shift()` when array length > 1000. As per memory guidelines: "avoid blindly truncating with `.shift()`... implement logical pruning".
    - `src/services/engineBenchmark.ts`: Continuously pushes to `allRuns`, `klines`, `times`.
- **Why it matters**: Out-of-memory crashes on long browser sessions (typical for day traders who leave tabs open 24/7).

### 3. Unsafe / Suboptimal DOM Operations
- **Issue**: Direct `appendChild` and `innerHTML` without checking cleanup state or using Svelte bindings safely.
- **Locations**:
    - `src/components/shared/CandlestickChart.svelte`: Uses `document.body.appendChild(temp)` inside JS to calculate CSS vars, causing reflows.
    - `src/components/shared/ThreeBackground.svelte`: Appends to `document.body`.
- **Why it matters**: Can lead to detached DOM nodes (memory leak) if the component unmounts unexpectedly before `removeChild` fires.

## 🔵 REFACTOR: Code smell, technical debt.

### 1. Inefficient Promise / Timeout Management
- **Issue**: Mixing manual Promisified `setTimeout` with `requestIdleCallback` fallbacks without abstraction.
- **Why it matters**: Harder to test and mock in Vitest.
```

## Step 2: Action Plan (Implementation)

### Group 1: Data Integrity & Floating Point Safety (CRITICAL)
- **Target Files**: `src/stores/ai.svelte.ts`, `src/services/mdaService.ts`, `src/services/bitunixWs.ts`
- **Actions**:
  - Replace all native `Number()` and `parseFloat()` logic processing price, order volume, and time data with strict `Decimal.js` instances.
  - Where raw primitives are required by downstream APIs (e.g. `t:` timestamps), evaluate via `new Decimal(k.t).toNumber()` or `.toInteger()` to guarantee precision safety.
- **Specific Test Cases**:
  - Unit tests to verify that large strings like `"0.0000000000001"` parse exactly and do not decay into exponential string `1e-13` before API serialization.

### Group 2: Memory Leaks & Resource Management (CRITICAL / WARNING)
- **Target Files**: `src/services/marketWatcher.ts`, `src/services/newsService.ts`, `src/services/toastService.svelte.ts`, `src/stores/journal.svelte.ts`
- **Actions**:
  - Add explicit `destroy()` methods to singleton services tracking timers (e.g., `pollingTimeout`). Clear all pending intervals/timeouts on destruction.
  - In `newsService.ts`, capture the timeout ID in a local variable when calling `setTimeout(() => controller.abort())`, and strictly `clearTimeout` when the fetch promise resolves.
  - In `journal.svelte.ts`, replace `.shift()` with bounded slice assignments: `this.entries = this.entries.slice(this.entries.length > 1000 ? 1 : 0)` or proper logical retention (e.g., pruning closed orders).

### Group 3: Type Safety & Validation (CRITICAL)
- **Target Files**: `src/services/tradeService.ts`, `src/services/newsService.ts`
- **Actions**:
  - Replace `any` casts mapping external payloads (e.g., `data.results.map((item: any) => ...)`) with explicit runtime validation using `Zod` schemas. If Zod is unavailable, define strict interfaces and implement runtime type guards.
- **Specific Test Cases**:
  - Unit tests to pass malformed objects (e.g., missing price, or price as `null`) to `tradeService.ts` and assert that it throws an actionable error rather than crashing or returning `NaN`.

### Group 4: UI/UX & Localization (WARNING)
- **Target Files**: `src/services/apiService.ts`, `src/stores/ai.svelte.ts`
- **Actions**:
  - Remove hardcoded console errors / strings and implement Svelte translation stores (e.g., `import { _ } from "../locales/i18n";`).
  - Gracefully handle "broken states": if a network request fails, render an actionable UI warning indicating degraded mode.

### Group 5: Unsafe DOM Manipulations (WARNING)
- **Target Files**: `src/components/shared/CandlestickChart.svelte`, `src/components/shared/ThreeBackground.svelte`
- **Actions**:
  - Refactor `document.body.appendChild` logic. If unavoidable (e.g., measuring CSS custom properties), ensure it executes in an isolated environment and wraps in a robust `try/finally` block to guarantee `removeChild` fires.

### Refactoring Principle Application
- Every single proposal above directly targets measurable improvements in memory usage, application stability during multi-hour trading sessions, or financial safety. Purely cosmetic code formatting or reorganization has been excluded.
