# Code Analysis & Status Report

## 🔴 CRITICAL (Financial risk, crashes, security)

### Precision Loss Risks
Native `Number()` conversion is used instead of `Decimal.js` in key locations, risking financial calculation precision loss:
- `src/stores/ai.svelte.ts` (Multiple lines: 643, 654, etc.)
- `src/stores/market.svelte.ts` (Multiple lines: 508, 661, etc.)
- `src/stores/marketStore.test.ts` / `market.test.ts` / `tradeService.repro.test.ts`
- *Action*: Replace `Number()` wrapper with `new Decimal(val).toNumber()` for fast-path conversions, or keep as Decimal for state.

### Unsafe DOM Manipulation
Extensive use of `@html` / `innerHTML` without guaranteed sanitization creates severe XSS vulnerabilities:
- `src/components/results/SummaryResults.svelte`
- `src/components/shared/JournalContent.svelte`
- `src/components/shared/MarketOverview.svelte`
- *Action*: Ensure `renderSafeMarkdown` is used from `src/actions/markdown.ts` or replace raw html insertion where possible.

### Catch Block Silence
Numerous `catch` blocks potentially swallow errors silently without standard `logger.error` wrapping.
- *Action*: Normalize try/catch blocks using standardized error maps.

## 🟡 WARNING (Performance, UX, i18n, type safety)

### Usage of 'any' in Critical Paths
- `src/services/tradeService.ts` and `newsService.ts` frequently bypass strict typing using `any`, risking runtime mapping errors.
- *Action*: Use `unknown` and Zod schema parsing.

### Missing i18n and Raw Error Messages
- TradeService and NewsService might be leaking raw API status codes to UI.

### Memory Leak Risks
- Array pushing in components like `marketWatcher` and `syncService` without clear limit boundaries.
- WebSocket subscription arrays/Sets potentially unbounded.

## 🔵 REFACTOR (Stability & Maintainability)
- Standardize timer ID typing (already mostly correct with `ReturnType<typeof setInterval>`).
- Reduce complexity in calculation updates (e.g. `market.svelte.ts`).

## Action Plan

### 1. Fix Critical Precision Loss (CRITICAL)
- **Files:** `src/stores/ai.svelte.ts`, `src/stores/market.svelte.ts`
- **Fix:** Replace all native `Number()` casting of API strings/Decimals with `new Decimal(val).toNumber()` for fast-path state. Ensure strictly `Decimal.js` is used for all core logic.
- **Unit Test Case:** Add a test in `src/stores/market.test.ts` calculating a small price difference (e.g., `0.0000000000000001`) asserting that native `Number` precision loss causes failures, but `Decimal` retains correct values.

### 2. Remediate Unsafe DOM Manipulation (CRITICAL)
- **Files:** `src/components/results/SummaryResults.svelte`, `src/components/shared/JournalContent.svelte`, `src/components/shared/MarketOverview.svelte`
- **Fix:** Remove `@html` and `innerHTML` blocks.
- **Unit Test Case:** Add an integration test loading a mocked component containing `<script>alert('XSS')</script>` via props and assert it is safely encoded rather than evaluated.

### 3. Normalize Error Handling & Catch Blocks (CRITICAL)
- **Files:** Services lacking standardized `catch(e)` logging.
- **Fix:** Refactor empty/silent `catch (e)` blocks. Wrap them to use `logger.error(TRADE_ERRORS.FETCH_FAILED, { details: String(e) })` instead of swallowing.

### 4. Enhance Type Safety & Remove 'any' (WARNING)
- **Files:** `src/services/tradeService.ts`, `newsService.ts`
- **Fix:** Replace `any` typing in `signedRequest` and response handlers with `Record<string, unknown>` or `unknown`, and strictly use Zod schemas (e.g. `TpSlOrderSchema.passthrough()`) to parse payload data securely.

### 5. Memory Leak Remediation in Arrays (WARNING)
- **Files:** `src/services/marketWatcher.ts`, `src/services/apiService.ts`
- **Fix:** Replace unbounded `.push()` on caches with bounded eviction policies (e.g. slicing recent N entries or timestamp checks).

### 6. Standardize Timer Management (REFACTOR)
- **Files:** `src/stores/chat.svelte.ts`, `src/services/omsService.ts`
- **Justification:** Ensuring all timer IDs strictly use `ReturnType<typeof setInterval>` prevents type mismatches between Node/Browser types and eliminates zombie timers during development reloading. Measurably improves stability.
