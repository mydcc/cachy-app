
# Status & Risk Report (Institutional Grade Analysis)

## 🔴 CRITICAL: Risk of financial loss, crash, or security vulnerability.

1. **Floating Point Inaccuracies in State Stores (`src/stores/market.svelte.ts`)**
   - **Location:** Line 507 (`parseFloat(val)`), Line 508 (`Number(val)`), Lines 661-676 (`.toNumber()`)
   - **Risk:** Native float conversion can introduce tiny deviations (e.g., `0.1 + 0.2 = 0.30000000000000004`) during high-frequency buffer updating. As per the strict financial standard rule: "Never use native JavaScript number floats," this poses a direct risk of corrupting limit order/liquidation calculation logic that depends on pure Decimals.
   - **Recommendation:** Refactor the buffer array storage strictly to safely coerce to `new Decimal(val).toNumber()` if TypedArrays are absolutely necessary for WebGL/WASM interop, or strictly enforce `Decimal.isFinite()` on the upstream.

2. **Unbounded Arrays / Memory Leaks in Stores (`src/stores/market.svelte.ts`, `src/stores/account.svelte.ts`)**
   - **Location:** `history.push`, `merged.push`, `this.positions.push`, `this.openOrders.push`, `pending.push`
   - **Risk:** Arrays handling incoming market data and user state grow unbounded during long-lived sessions, eventually leading to out-of-memory browser crashes (especially during high volatility events where 100+ updates/sec arrive).
   - **Recommendation:** Implement bounded capacity evictions (e.g., retaining only the latest N orders/klines, slicing arrays) instead of raw `.push()`.

## 🟡 WARNING: Performance issue, UX error, missing i18n.

1. **Missing i18n / Hardcoded Error Text Fallbacks (`src/services/tradeService.ts`)**
   - **Location:** Lines handling `BitunixApiError` and raw string mappings for `msg`.
   - **Risk:** Unlocalized raw exception texts or backend JSON dumps may bleed into user-facing UI, confusing the user and breaking accessibility standards.
   - **Recommendation:** Ensure all dynamically generated strings pass through a safe mapping dictionary (like `apiErrors.generic`) rather than surfacing raw variables.

2. **Suboptimal Loop Allocation in Polling/Updates (`src/services/marketWatcher.ts`, `src/services/tradeService.ts`)**
   - **Location:** High frequency `.map(async () => ...)` or inner loop Promise generations.
   - **Risk:** Spawns excessive closures blocking the V8 macro-task queue.
   - **Recommendation:** Re-write performance critical tight-loops to synchronous Promise allocations using `Promise.all()`.

## 🔵 REFACTOR: Code smell, technical debt

1. **Defensive Validation on WebSocket Input**
   - **Location:** Data streams into `market.svelte.ts` via `updateSymbolData` loosely checking `val instanceof Decimal`.
   - **Refactor Justification:** Measurably improves stability. Zod schema validation must ensure no `NaN` or `Infinity` slips through before state is mutated.

