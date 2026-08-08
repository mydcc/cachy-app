# Cachy App - Systematic Maintenance & Hardening Report

## 🔴 CRITICAL

1. **Data Integrity & Mapping - TradeService JSON Serialization Error**:
   - *Issue*: `TradeService` might not correctly enforce strictly typing or deep serialization protection for cyclic/excessively deep structures (e.g. `TradeService Serialization Depth limit exceeded` warnings exist).
   - *Impact*: Memory spikes, crashes on logging or mapping API responses.

2. **Data Integrity & Decimal Enforcement**:
   - *Issue*: Some areas might still be parsing or treating Decimals natively, e.g. using `Number()` or native floats instead of purely retaining `Decimal` objects throughout the app pipeline.
   - *Impact*: Floating point precision loss which violates strict financial institutional-grade standards.

## 🟡 WARNING

3. **Resource Management - Memory Leaks in Stores & Intervals**:
   - *Issue*: Many components and stores use `setInterval` or `setTimeout` (like `MarketWatcher`, `storageUtils`, `performanceMonitor`, `ui.svelte.ts`, `indicator.svelte.ts`). While some clear them on destroy, we need to guarantee that all references are strictly cleared.
   - *Impact*: Background memory leak and processing overhead in the UI thread.

4. **UI/UX & Missing i18n Keys**:
   - *Issue*: Hardcoded strings exist, e.g. error texts in UI. Some fallback texts in components don't correctly resolve through `4. **UI/UX & Missing i18n Keys**:()` translation files.
   - *Impact*: UX issue for non-English users.

## 🔵 REFACTOR

5. **Code Smell - Hot Paths Processing**:
   - *Issue*: Polling mechanics and calculation strategies (like `MarketWatcher.performPollingCycle`) are invoked very frequently.
   - *Impact*: Slight CPU overhead.

## Step 2: Action Plan (Proposed Implementation)

### Phase 1: Hardening TradeService & Data Serialization (🔴 CRITICAL)
- Add precise `safeJsonParse` enforcement for any incoming WebSocket or REST data in TradeService and MarketWatcher, casting properly with strict `Record<string, unknown>` validations to avoid blind `any` downcasts.
- Concrete Unit Test: Inject circular or 50+ level nested JSON objects and assert safe failure without crashing.

### Phase 2: Enforce Strict Decimal Use (🔴 CRITICAL)
- Scan `activeTechnicalsManager.svelte.ts` and `app.ts` to eradicate remaining `Number(...)` usages for prices/amounts.
- Ensure all `tradeState` and `marketState` bindings accept `Decimal`.
- Concrete Unit Test: Pass `'12.34567890123456789'` through the calculation pipeline and verify the exact string is retained on the other end.

### Phase 3: Cleanup Timers & Zombie Websockets (🟡 WARNING)
- Consolidate and defensively wrap all `setTimeout`/`setInterval` usage within Svelte stores (`indicator`, `favorites`, `market`) with deterministic `destroy()` hooks. Ensure these hooks are always registered to component teardowns.
- Justification: Directly improves app stability over prolonged usage (>2 hours), eliminating a major class of OOM errors.

### Phase 4: i18n Completeness (🟡 WARNING)
- Provide missing i18n translation texts in `en.json` and `de.json`.
- Validate UI error boundaries cleanly map to translation keys instead of printing raw system errors, unless `BitunixApiError` explicitly provides the raw key.
