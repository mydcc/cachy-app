# Institutional Grade Code Analysis & Action Plan Report

## Step 1: In-Depth Analysis & Findings

### 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)
1. **Unbounded Memory Collections (Memory Leaks)**
   - `src/services/bitunixWs.ts`: `syntheticSubs` and `pendingSubscriptions` Maps are unbounded.
   - `src/services/technicalsService.ts`: `pendingResolves` and `pendingRejects` Maps lack eviction logic.
   - `src/services/cryptoService.ts`: `sessionKeyCache` Map lacks size limits.
   - *Risk*: Risk of out-of-memory (OOM) crashes in long-running sessions, disrupting trading.
2. **Unsafe Error Handling & Type Bypasses**
   - `src/services/dataRepairService.ts`: Widespread use of `catch (e: any)`, bypassing TypeScript's safety mechanisms and risking runtime exceptions if the error lacks expected properties.
   - `src/services/aggregatorService.ts` & `src/services/workerPool.ts`: Implicit `any` used for resolve/reject handlers.
   - *Risk*: Hidden runtime crashes in data pipelines and promise resolutions.
3. **Data Integrity & Decimal Casting**
   - `src/stores/market.svelte.ts`: High frequency of `val instanceof Decimal ? val.toNumber() : Number(val);` in UI stores. Downcasting `Decimal` to float risks floating-point precision loss during active trading calculations.
   - *Risk*: Financial inaccuracies in price calculations and order quantities.
4. **Direct DOM Manipulation**
   - `src/components/shared/JournalContent.svelte` and `src/services/hotkeyService.ts`: Use of `document.getElementById(...)`.
   - *Risk*: Unsafe in Svelte's reactive lifecycle, can lead to detached DOM nodes or null references.

### 🟡 WARNING (Performance issue, UX error, missing i18n)
1. **Missing i18n Keys (Hardcoded Strings)**
   - `src/services/webGpuCalculator.ts`, `src/services/workerPool.ts`, and `src/services/cloudService.ts`: Throwing hardcoded string errors (e.g., `throw new Error('WebGPU not supported')`).
   - *Risk*: Broken user experience for non-English speakers when error messages surface in UI.
2. **Timer Identifiers Typed as `any` or `number`**
   - General Node/browser timer safety issues across files, lacking strictly typed `ReturnType<typeof setInterval>`.
   - *Risk*: Cross-environment (SSR vs Browser) leaks and failures.
3. **UI Thread Blocking (Hot Paths)**
   - `src/components/shared/FXOverlay.svelte` and background workers: Unbounded `requestAnimationFrame` loops.
   - *Risk*: Battery drain and performance degradation if loops do not pause when off-screen.

### 🔵 REFACTOR (Code smell, technical debt)
1. **Type Definitions in Workloads**
   - `src/services/engineBenchmark.ts`: Accepts `klines: any[]` rather than strictly typed `KlineRaw[]`.
   - *Risk*: Future regressions in benchmarking metrics.

---

## Step 2: Action Plan

### Group 1: Memory Management & Leak Prevention (CRITICAL)
**Goal:** Prevent OOM crashes in high-frequency data streams.
- **Tasks:**
  - Implement a bounded eviction strategy for `syntheticSubs` and `pendingSubscriptions` in `bitunixWs.ts`. Evict safely via `.entries()`, avoiding `.keys().next().value`.
  - Introduce max capacity and TTL (Time To Live) for `pendingResolves` in `technicalsService.ts`.
- **Test Case:** Write a unit test in `bitunixWs.leak.test.ts` to push 10,000 synthetic subscriptions and assert that the internal `Map` size does not exceed the defined bounds.
- **Justification:** *Does this measurably improve stability or performance?* Yes, this prevents unbounded memory growth during continuous market streaming, ensuring platform stability.

### Group 2: Strict Type Safety & Decimal Integrity (CRITICAL)
**Goal:** Eliminate precision loss and unsafe exception handling.
- **Tasks:**
  - Refactor all `catch (e: any)` in `dataRepairService.ts` to `catch (e: unknown)`, extracting messages via `e instanceof Error ? e.message : String(e)`.
  - Replace `any` types in `workerPool.ts` and `aggregatorService.ts` with `unknown` or `Record<string, unknown>`.
  - Audit and remove `.toNumber()` conversions in `market.svelte.ts` unless strictly required for `TypedArray` rendering. Use `Decimal.js` for all financial logic.
- **Test Case:** Write a unit test simulating a malformed error object (e.g., `throw null` or `throw "string"`) in `dataRepairService.ts` to ensure it gracefully handles `unknown` formats without crashing.
- **Justification:** *Does this measurably improve stability or performance?* Yes, it guarantees institutional-grade data integrity and eliminates hidden runtime crashes.

### Group 3: i18n Standardization (WARNING)
**Goal:** Make error handling actionable and localized.
- **Tasks:**
  - Replace raw string errors in `webGpuCalculator.ts` and `cloudService.ts` with centralized error constants mapped to `src/locales/` keys.
- **Test Case:** Update existing API error unit tests to assert the thrown error exactly matches the mapped constant.
- **Justification:** *Does this measurably improve stability or performance?* Yes, it improves UX stability and maintainability by preventing raw debug errors from reaching the end user.

### Group 4: Safe DOM & Render Optimization (WARNING)
**Goal:** Align with Svelte architecture and prevent frame drops.
- **Tasks:**
  - Replace `document.getElementById` with Svelte `bind:this` references or isolated component actions.
  - Implement `IntersectionObserver` to pause `requestAnimationFrame` in `FXOverlay.svelte` when out of viewport.
- **Justification:** *Does this measurably improve stability or performance?* Yes, it measurably improves UI thread performance (FPS) and component lifecycle safety.
