# Code Analysis Report: System Hardening & Maintenance

## 🔴 CRITICAL

### 1. Missing Decimal Enforcement (Financial Risk)
Native JavaScript number parsing (\`Number()\`, \`parseFloat()\`) is used instead of strict \`Decimal\` types for precision-critical financial data, which can lead to floating-point errors (e.g. 0.1 + 0.2 = 0.30000000000000004). This violates the "strict decimal" memory constraint.
- \`src/services/bitunixWs.ts\`
- \`src/services/csvService.ts\`
- \`src/services/mdaService.ts\`
- \`src/services/mappers.ts\`
- \`src/services/newsService.ts\` (Zod number schemas might be acceptable for scores/timestamps, but prices must be Decimals).

### 2. Unsafe Raw API Response Handling (Security & Resilience Risk)
The code uses \`response.text()\` in services interacting with APIs without strict \`try/catch\` blocks to catch parsing errors or map HTML error pages (e.g., Cloudflare 502) to standardized, localized error keys. This could crash the UI or expose infrastructure details.
- \`src/services/apiService.ts\`
- \`src/services/newsService.ts\`
- \`src/services/tradeService.ts\`

### 3. Unsafe Array Truncation (.shift) (State Loss Risk)
Direct usage of \`.shift()\` in stateful queues/buffers without logical pruning can lead to accidental data loss in persistent stores.
- \`src/services/calculationStrategy.ts\`
- \`src/stores/journal.svelte.ts\`

### 4. Unsafe Map/Set Clearing (.clear) (Memory & State Risk)
Unbounded usage of \`.clear()\` on data caches or active state maps destroys all active context rather than employing bounded eviction (e.g., pruning old entries).
- \`src/services/marketWatcher.ts\`
- \`src/services/omsService.ts\`
- \`src/services/aggregatorService.ts\`

### 5. Console.error Abuse in Services (A11y/UX Risk)
Many files use raw \`console.error\` instead of utilizing the centralized \`logger\` service, preventing the UI/UX from gracefully catching and localizing errors, and failing to suppress error output in tests.
- \`src/services/calculatorService.ts\`
- \`src/services/syncService.ts\`
- \`src/services/cryptoService.ts\`

## 🟡 WARNING

### 1. Incomplete/Loose Types (Type Safety Risk)
Widespread use of \`any\` or generic generic typing (\`Record<string, any>\`) in service layers, especially in OMS, Trade, and WS handlers, bypassing TypeScript's protections against null/undefined values.
- \`src/services/tradeService.ts\`
- \`src/services/omsService.ts\`
- \`src/services/bitunixWs.ts\`

### 2. Hardcoded Error Messages (i18n & UX Risk)
String literals thrown in error constructors instead of centralized constants/i18n keys (e.g., \`throw new Error("Invalid format")\`).
- \`src/services/tradeService.ts\`
- \`src/services/apiService.ts\`

## 🔵 REFACTOR

### 1. Timer Memory Leaks (Performance Risk)
Timers (\`setInterval\`, \`setTimeout\`) may lack strict \`ReturnType<typeof setTimeout>\` typings and explicit cleanup during component destruction/HMR.

### 2. Centralized Error Mapping
Move literal error mappings to a central dictionary to prevent string matching issues in unit tests.

## Step 2: Action Plan (Planning Phase)

### 1. Fix Decimal Precision Enforcement (CRITICAL)
- **Target Files:** \`src/services/bitunixWs.ts\`, \`src/services/csvService.ts\`, \`src/services/mdaService.ts\`
- **Justification:** Financial platform requirement. Prevents floating point math inaccuracies from directly corrupting core financial properties like \`entryPrice\`, \`targets\`, or time manipulation logic if mis-casted.
- **Action:** Read specific lines via \`grep\` to identify exact \`Number()\` and \`parseFloat()\` calls. Replace them with safe \`new Decimal(value).toNumber()\` if a primitive is needed for performance/typed-arrays, or retain \`Decimal\` objects where type schemas allow. Verify that times/timestamps are safely parsed integers.
- **Test Case:** Write a unit test simulating an API payload with precision-sensitive floats (e.g. \`0.1\` and \`0.2\`) and verify that native JS addition would fail but the parsed \`Decimal\` implementation correctly equates to \`0.3\` without floating point drift.

### 2. Implement Safe Map/Set/Array Eviction (CRITICAL)
- **Target Files:** \`src/services/marketWatcher.ts\`, \`src/services/omsService.ts\`, \`src/services/calculationStrategy.ts\`
- **Justification:** Prevents unintended mass state deletion (\`.clear()\`) and arbitrary un-synchronized queue truncation (\`.shift()\`) which leads to memory leak vs state loss tradeoffs.
- **Action:** Replace \`.clear()\` with a time-based bounded eviction strategy or threshold logic (\`if (size > MAX) delete oldest\`). Replace \`.shift()\` with logic to explicitly remove acknowledged/processed entries by ID or index, ensuring active state is never blindly removed.
- **Test Case:** For \`.clear()\`, mock an active map with multiple timestamped entries (new and old). Assert that calling the new eviction function only removes old entries and preserves the active new ones, rather than wiping everything. For \`.shift()\`, mock a queue with unacknowledged state; assert that pushing new data doesn't blindly \`shift()\` away unacknowledged state without explicit processing.

### 3. Fortify Raw Text Responses (CRITICAL)
- **Target Files:** \`src/services/apiService.ts\`, \`src/services/tradeService.ts\`, \`src/services/newsService.ts\`
- **Justification:** Avoids unhandled promise rejections or runtime UI crashes caused by trying to parse \`text()\` bodies from HTML error responses (like 502 Bad Gateway) or incomplete streams.
- **Action:** Wrap \`.text()\` in strict \`try/catch\` and throw a unified localized API error key on failure (e.g., \`apiErrors.invalidResponseFormat\`).
- **Test Case:** Mock a \`fetch\` response that simulates a Cloudflare 502 HTML page instead of JSON. Ensure the service catches the failed parsing and gracefully throws the generic \`apiErrors.invalidResponseFormat\` localization key instead of exposing raw HTML or crashing.

### 4. Remove Console Error Leaks & Standardize Logging (CRITICAL/WARNING)
- **Target Files:** \`src/services/calculatorService.ts\`, \`src/services/syncService.ts\`
- **Justification:** Centralized logging allows for robust error handling, filtering, and A11y UI feedback. \`console.error\` escapes error bounds and pollutes stdout/test runner output.
- **Action:** Replace \`console.error\` with \`logger.error(category, ...)\` imported from \`src/services/logger.ts\`.

### 5. Type Safety & i18n Hardening (WARNING)
- **Target Files:** \`src/services/tradeService.ts\`, \`src/services/apiService.ts\`
- **Justification:** Raw string literals in \`throw new Error("...")\` prevent translation and UI consistency.
- **Action:** Ensure standard constants or localized keys are thrown. Check \`any\` usages and replace with \`unknown\` or mapped Schemas (e.g. Zod).
