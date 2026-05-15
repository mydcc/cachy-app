# In-Depth Analysis Report & Action Plan

## Step 1: Status & Risk Report

### 🔴 CRITICAL (Financial loss, crash, or security vulnerability)

**1. Type Safety Risks (Bypassing strictly typed logic)**
Several files utilize the `any` type in ways that defeat TypeScript checks. This includes high-risk areas handling API signatures or core mathematical execution.
*Example Files:*
- `src/components/settings/tabs/VisualsTab.svelte`
- `src/actions/burn.ts`
- `src/components/inputs/PortfolioInputs.svelte`
*Risk:* Passing functionally invalid objects/parameters into calculation or rendering threads, causing silent failures.

**2. Floating Point Precision Risks in Financial Math**
Files use native `Number()` or `parseFloat()` directly on variables likely containing financial quantities (`price`, `qty`), bypassing `Decimal.js`.
*Example Files:*
- `src/components/inputs/PortfolioInputs.svelte`
- `src/components/inputs/TradeSetupInputs.svelte`
*Risk:* 0.1 + 0.2 precision errors when validating trade sizes or input values before API submission, leading to rejected orders or incorrect position sizing.

**3. Memory Management / Resource Leaks**
Various timer implementations across the application utilize `setInterval` without tracking the handle to call `clearInterval`.
*Example Files:*
- Identified in `MarketOverview.svelte` and some debugging tools during source scans.
*Risk:* If these components are repeatedly mounted/unmounted, background loops will accumulate indefinitely, draining browser resources and causing crashes.

### 🟡 WARNING (Performance issue, UX error, missing i18n)

**1. Hardcoded Errors & Missing i18n**
Numerous API server endpoints (`+server.ts`) throw hardcoded `throw new Error("...")` strings instead of utilizing standardized error code maps or i18n keys.
*Example Files:*
- `src/routes/api/orders/+server.ts`
- `src/routes/api/sync/+server.ts`
- `src/routes/api/klines/+server.ts`
*Risk:* The user sees raw technical error strings rather than localized, actionable text, breaking UX.

**2. Broken States (Empty Catch Blocks)**
Some network requests/processing loops catch errors but implement an empty block `catch (e) { }`, swallowing the failure entirely.
*Example Files:*
- `src/routes/api/klines/+server.ts`
*Risk:* If an API fails to load Kline data, the UI might display stale data or an empty chart instead of notifying the user of a network interruption.

**3. Storage Vulnerability**
UI components try to access `localStorage` directly without `try/catch` blocks.
*Example Files:*
- `src/components/shared/AcademyModal.svelte`
- `src/routes/+page.svelte`
*Risk:* If the user's browser restricts storage or is in certain incognito modes, the app will crash outright on initialization.

### 🔵 REFACTOR (Stability/maintainability technical debt)

**1. Unsafe `catch (e: any)` Error Narrowing**
Extensive use of `catch (e: any)` prevents type-safe error message extraction across both frontend and backend files.
*Example Files:*
- `src/components/shared/JournalContent.svelte`
- `src/routes/api/jules/+server.ts`
*Justification:* Refactoring to `catch (e: unknown)` measurably improves stability by forcing safe string conversions via `e instanceof Error`, preventing undefined behavior if the thrown object isn't a standard `Error`.

---

## Step 2: Action Plan

1. **Phase 1: Fix Floating Point Risks (CRITICAL)**
   - **Target**: `src/components/inputs/PortfolioInputs.svelte` & `TradeSetupInputs.svelte`
   - **Action**: Locate `parseFloat` / `Number` conversions on quantity/price inputs and convert them strictly to `new Decimal(val).toNumber()` where numeric primitives are strictly required by third-party charts, or keep them as `Decimal` for calculations.
   - **Tests**: Write specific unit tests enforcing that parsing "0.1" and "0.2" sizes yields exact calculations.

2. **Phase 2: Eliminate Memory Leaks (CRITICAL)**
   - **Target**: Components utilizing `setInterval`.
   - **Action**: Store interval IDs and explicitly call `clearInterval` in Svelte `onDestroy` hooks.
   - **Tests**: Verify cleanup manually or via DOM unmount testing.

3. **Phase 3: Refactor Catch Blocks to `unknown` (REFACTOR)**
   - **Target**: All identified `catch (e: any)` occurrences in `src/routes/api/` and `src/components/`.
   - **Action**: Replace with `catch (e: unknown)` and implement strict type narrowing `e instanceof Error ? e.message : String(e)`.
   - **Justification**: Measurably prevents silent crashes if a non-error object is thrown.

4. **Phase 4: Standardize API i18n Exceptions (WARNING)**
   - **Target**: Hardcoded string errors in `src/routes/api/`.
   - **Action**: Replace plain text errors with localized constants that the frontend can safely map to i18n keys.

5. **Phase 5: Pre-Commit Checks**
   - **Action**: Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

6. **Phase 6: Submission**
   - Submit the branch to finalize these institutional-grade hardening passes.
