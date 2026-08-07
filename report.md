# In-Depth Analysis & Risk Report for cachy-app

Following the request to perform an in-depth code analysis to assess the status quo, identify vulnerabilities, and raise the code base to an "institutional grade" level, here is the prioritized list of findings.

## 🔴 CRITICAL

*   **Memory Leaks in WebSocket Services (`src/services/bitunixWs.ts`, `src/services/bitgetWs.ts`)**:
    *   **Finding**: The WebSocket implementations (e.g., `bitunixWs.ts`) create multiple `setInterval` timers for ping watchdogs (`pingTimerPublic`, `pingTimerPrivate`, `globalMonitorInterval`). While there are some `clearInterval` calls during teardown, the `setInterval` calls are sometimes unassigned to variables or re-assigned without clearing the previous timer in hot paths like reconnects. This creates "zombie" timers, leading directly to memory leaks, unbound CPU usage, and erratic WebSocket behaviour over time. Given the high-frequency nature of the platform, this is unacceptable.
*   **Missing Type Safety and Duck-typing in Data Mapping (`src/services/mdaService.ts`)**:
    *   **Finding**: The Market Data Adapter service (`mdaService.ts`) uses `raw: any` for parsing critical exchange data (`normalizeTicker`, `normalizeKlines`). The comment explicitly states it duck-types across APIs. Without strict parsing (e.g., checking for `null`, `undefined`, or structural changes using Zod or explicit interface validation), unexpected API payloads will crash the data stream or introduce silent state corruption.
*   **Precision Loss in Calculations (`src/stores/market.svelte.ts`, `src/lib/calculators/stats.ts`, etc.)**:
    *   **Finding**: Despite the whitepaper's mandate to use `Decimal.js` for financial arithmetic, there are widespread invocations of `.toNumber()` and `parseFloat()` throughout the codebase (over 50 occurrences), particularly inside calculations, market state updates, and aggregations (e.g., `backing.opens[i] = k.open.toNumber();`). This downcasts arbitrary-precision Decimals back to standard JavaScript IEEE 754 floats, re-introducing the exact floating-point drift vulnerabilities the project aims to prevent.

## 🟡 WARNING

*   **Unsafe DOM Manipulation and XSS Vulnerabilities (`{@html ...}`)**:
    *   **Finding**: There are dozens of instances of Svelte's `{@html ...}` directive across the UI components (e.g., `src/components/shared/MarketOverview.svelte`, `src/lib/windows/implementations/DialogView.svelte`). While some are sanitized, many directly render `win.message` or icon strings without guaranteed wrapping in `DOMPurify.sanitize()`. This introduces a high risk of Cross-Site Scripting (XSS) if any upstream data or user input is rendered through these paths.
*   **Incomplete i18n Translations**:
    *   **Finding**: Preliminary scans indicate potential hardcoded error strings and messages in services and UI elements that bypass the translation layer (`$_`), hindering full accessibility and localization.
*   **Error Handling in "Broken States"**:
    *   **Finding**: The system lacks robust visual fallback states. If an API call fails or a WebSocket connection is interrupted, the frontend state might not gracefully handle indeterminate states without throwing uncaught exceptions or leaving optimistic UI hanging.

## 🔵 REFACTOR

*   **Duck-typing to Strict Schema Validation**:
    *   **Finding**: The `any` types in `mdaService` should be replaced with strictly typed schemas (like Zod) or typed inputs. While this is critical (listed above), the refactoring effort itself spans multiple adapters and mapping functions. Measurable impact: Prevents silent runtime crashes and guarantees data integrity entering the system.

---

### Step 2: Implementation & Action Plan (Proposed)

*   **Group 1: WebSocket Hardening (CRITICAL)**: Refactor `bitunixWs.ts` and `bitgetWs.ts` to ensure all `setInterval` references are tracked and explicitly cleared using `clearInterval` before establishing new connections or destroying instances. Create a unit test specifically checking for timer leaks on reconnect.
*   **Group 2: Strict Data Mapping (CRITICAL)**: Replace `any` types in `mdaService.ts` with `Record<string, unknown>`. Implement runtime checks to strictly validate object structure and nullability before mapping to `NormalizedTicker` and `NormalizedKline`. Add unit tests proving corrupted objects are rejected.
*   **Group 3: Eradicate Native Floats (CRITICAL)**: Audit and remove unsafe `.toNumber()` downcasts in critical state stores like `market.svelte.ts` and `tradeCalculator.svelte.ts` where Decimals are converted to floats. Ensure Decimals propagate all the way through calculations.
*   **Group 4: Sanitize XSS Vectors (WARNING)**: Audit all `{@html ...}` usages in Svelte files. Ensure that any dynamic content (like `win.message` in dialogs) is wrapped with `DOMPurify.sanitize()` using the existing `sanitizer.ts` utility.
