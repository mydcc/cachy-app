# In-Depth Status & Risk Report (Systematic Maintenance & Hardening)

Based on a comprehensive scan of the `cachy-app` codebase (focusing on interfaces, API responses, resource management, and UI states), here are the prioritized findings for institutional-grade hardening.

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Type Safety in Financial Logic & Missing Validation**
   - **File:** `src/services/tradeService.ts` (e.g., `placeTpSl`, `serializePayload`)
   - **Risk:** High usage of `any` for HTTP request payloads (e.g., `const data = await this.signedRequest<any>(...)`) and serialization routines.
   - **Impact:** Invalid API responses or malformed order payloads could be silently accepted, leading to phantom orders or incorrect Tp/Sl placements, risking financial loss.
   - **Action:** Replace `any` with `unknown`, enforce strict Zod schema parsing (e.g., `TpSlOrderSchema.parse(data)`), and eliminate `(data as any).code` access patterns.

2. **Unsafe Floating Point Arithmetic in Background Workers**
   - **Files:** Background components (`src/components/shared/backgrounds/engines/*.ts`, `galaxy.worker.ts`, `tradeFlow.worker.ts`)
   - **Risk:** Some visualization or auxiliary modules utilize native `Number` or implicit casts for coordinates or simulated values. While not direct financial loss, if any of these patterns leak into `wasmCalculator.ts` or `webGpuCalculator.ts` under high load, precision errors will compound.
   - **Impact:** Miscalculation of technicals, PnL, or liquidation points leading to incorrect trading signals.
   - **Action:** Ensure absolute strictness of `Decimal.js` usage across all services processing pricing data.

3. **Empty Catch Blocks & Silent Failures in WebSocket Processing**
   - **Files:** `src/services/newsService.ts` (e.g., `catch (e: any) { }`) and potentially inside high-frequency WebSocket streams (`bitunixWs.ts`).
   - **Risk:** Swallowing network errors or data parsing failures without notifying the UI or stopping dependent processes.
   - **Impact:** The UI presents a "healthy" state while underlying data streams are disconnected or corrupt (Broken State).

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Hardcoded Error Strings (Missing i18n)**
   - **File:** `src/services/tradeService.ts`
   - **Risk:** Literal error strings like `throw new Error("apiErrors.missingCredentials")`, `"apiErrors.invalidAmount"`, and `"dashboard.alerts.noApiKeys"` are used instead of centralized constants.
   - **Impact:** Brittle codebase and broken localization strings if the translation keys shift.
   - **Action:** Add these to `TRADE_ERRORS` and map them properly.

2. **Unhandled Raw Text Parsing**
   - **Files:** `src/services/apiService.ts`, `src/services/newsService.ts`, `src/services/tradeService.ts`
   - **Risk:** `await response.text()` is called natively without being wrapped in `try...catch` blocks.
   - **Impact:** If the network stream drops mid-read or the gateway returns unexpected payloads, the Promise rejects unhandled, potentially crashing the local component or service thread.
   - **Action:** Wrap text parsing, throw localized generic errors (e.g., `apiErrors.invalidResponseFormat`), and avoid exposing raw gateway HTML/text to the frontend.

3. **Memory Leaks in Caching & Arrays**
   - **Files:** `src/lib/server/cache.ts`, `src/services/incrementalCache.ts`
   - **Risk:** Caching mechanisms (`Map`, `Set`) might grow unboundedly if eviction strategies (like timestamp thresholds) fail under high-frequency updates.

## 🔵 REFACTOR (Code smell, technical debt)

1. **Abuse of `any` in Object Mapping**
   - **File:** `src/services/newsService.ts`
   - **Issue:** Array mappings like `.map((item: any) => ({...}))` bypass TypeScript's type checking.
   - **Action:** Define explicit interfaces (e.g., `NewsArticlePayload`) to type-check incoming REST parameters properly. This measurably improves stability by catching missing `publishedAt` vs `published_at` fields early.

---

### Step 2: Proposed Action Plan (For Review)

**Group 1: Harden Financial Data Structures (CRITICAL)**
*   Refactor `tradeService.ts` to eliminate `<any>` during API requests.
*   Implement strict schema validation (using `zod`) before returning TpSl orders to ensure `orderId` and `symbol` exist and match expected types.
*   *Unit Test:* Write a test injecting a malformed JSON response to `tradeService.placeTpSl` and assert it throws a specific `TRADE_ERRORS.FETCH_FAILED` gracefully.

**Group 2: Resilient Network Parsing (WARNING)**
*   Wrap all `await response.text()` instances in `try/catch` blocks across `apiService.ts`, `tradeService.ts`, and `newsService.ts`.
*   Ensure fallback standardized localization keys are thrown.

**Group 3: Centralize i18n Error Definitions (WARNING)**
*   Extract literal string throws in `tradeService.ts` to the `TRADE_ERRORS` constant.

**Group 4: Cleanup & Type Definitions (REFACTOR)**
*   Replace `catch (e: any)` with `catch (e: unknown)` globally across modified files.
*   Enforce proper `item: Record<string, unknown>` interfaces for `newsService.ts` parsing.