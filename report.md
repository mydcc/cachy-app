# Code Analysis & Vulnerability Report (Institutional Grade)

## 🔴 CRITICAL (Financial loss, crash, security, memory leaks)

### 1. parseFloat/Number Usage (Precision Loss)
Using native floats instead of `Decimal` risks financial inaccuracies during parsing or calculations.
- **src/routes/api/sync/+server.ts**: Line 35
- **src/routes/api/sync/orders/+server.ts**: Line 184
- **src/routes/api/positions/+server.ts**: Lines 188, 219
- **src/lib/windows/implementations/SymbolPickerView.svelte**: Lines 95, 100, 111, 123, 124
- **src/lib/windows/implementations/CandleChartView.svelte**: Lines 344-347, 370
- **src/lib/actions/inputEnhancements.ts**: Line 127
- **src/types/orderSchemas.ts**: Line 108

### 2. `catch (e: any)` Usage (Type Safety Bypass)
Catch blocks must use `unknown` and be safely narrowed.
- **src/routes/api/sync/+server.ts**
- **src/routes/api/sync/positions-pending/+server.ts**
- **src/routes/api/sync/positions-history/+server.ts**
- **src/routes/api/sync/order-detail/+server.ts**
- **src/routes/api/positions/+server.ts**
- **src/lib/windows/implementations/AssistantView.svelte**
- **src/lib/server/chatStore.ts**
- **src/services/newsService.ts**

### 3. Memory Leaks (Unclosed intervals/timeouts)
Timers are set but not reliably cleared, causing unbounded growth in Svelte/Vitest.
- **src/lib/windows/implementations/SymbolPickerView.svelte**
- **src/lib/windows/implementations/AssistantView.svelte**
- **src/tests/closeAllPositions.bench.ts**
- **src/tests/security/storage_hardening.test.ts**
- **src/tests/performance/dataRepairService_benchmark.test.ts**
- **src/tests/performance/startup_benchmark.test.ts**
- **src/tests/performance/market_watcher_concurrency.test.ts**

### 4. Unsafe DOM Manipulation (`innerHTML` / `@html`)
Direct DOM injection must be sanitized (e.g. DOMPurify).
- **src/lib/components/ContentRenderer.svelte**
- **src/lib/windows/implementations/SymbolPickerView.svelte**
- **src/lib/windows/implementations/MarkdownView.svelte**
- **src/lib/windows/implementations/DialogView.svelte**

## 🟡 WARNING (Performance, UX, i18n, Stores)

### 1. Missing i18n (Hardcoded strings in Svelte)
- **EngineDebugPanel.svelte**: 'WASM', 'SIMD', 'GPU'
- **IndicatorSettings.svelte**: 'Signals', 'Volatility', 'Calculation Engine'
- **TechnicalsPanel.svelte**: 'VP (POC)', 'VA High/Low', 'Parabolic SAR'
- **TradingTab.svelte**: 'MAKER', 'TAKER'
- **MarketDashboardModal.svelte**: 'Live'

### 2. Unbounded Array `.push()` in Stores
Several stores use `.push()` without limits, leading to potential memory leaks.
- Needs thorough check on `stores` directory.

## 🔵 REFACTOR (Stability, Maintainability)

### 1. `any` Typings
Avoid `any` wherever possible to prevent logic bugs. Numerous occurrences throughout services, stores, and tests (e.g. `tradeService.ts`, `marketWatcher.ts`, `newsService.ts`). Type definitions and API schemas need strict enforcement.

