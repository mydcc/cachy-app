# In-Depth Analysis Report: cachy-app Hardening

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1.  **Type Safety & `any` in Critical Paths:**
    *   `src/services/tradeService.ts`: Intensive use of `any` for order payloads and API responses (`payload: Record<string, any>`, `serializePayload(payload: any)`, `signedRequest<any>`). This circumvents TypeScript's safety net. Invalid API responses or missing fields can lead to runtime crashes or incorrect financial logic.
    *   `src/services/omsService.ts`, `src/services/apiService.ts`: Catch blocks use `(e as any).status` and similar constructs. Should use type narrowing or custom error classes to safely access error properties.
2.  **Number vs. Decimal in Financial Calculations:**
    *   `src/services/julesService.ts` lines 88-92: Conversion from Decimal back to native numbers (`.toNumber()`) for financial values (e.g., USDT balance). This completely defeats the purpose of using Decimal and re-introduces floating-point inaccuracies.
    *   `src/services/marketWatcher.ts`: Fallback checks for `!(klines[0].open instanceof Decimal)` indicate uncertainty about data mapping. If mapping fails, native floats might leak into calculations.
3.  **Potential State Corruption / Missed Events (Memory & Data Management):**
    *   `src/services/toastService.svelte.ts`: Uses `.push()` and unmanaged `setTimeout` for toasts. Without bounds checking, this is a minor memory leak, but more importantly, unmanaged timeouts can cause state inconsistencies if a toast is dismissed early or component unmounts.
    *   `src/stores/settings.svelte.ts`: Uses `any` for timer handles (`notifyTimer`, `saveTimer`) and `encryptionPassword`.
    *   `src/services/apiService.ts`: Has `cleanupInterval` but needs to ensure it's properly bound and cleared if the service is destroyed (though it might be a singleton, good practice for HMR).

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1.  **Missing i18n (Hardcoded Strings):**
    *   Found numerous hardcoded strings in components, e.g., `src/components/settings/tabs/IndicatorSettings.svelte` ("Summary", "Oscillators", "Auto Optimize"), `src/lib/windows/implementations/SymbolPickerView.svelte` ("LOADING HISTORY", "Majors Only"), `src/lib/windows/implementations/AssistantView.svelte` ("Anwenden", "Ignorieren"). These must be migrated to the i18n system.
2.  **UI Thread Blocking / Unoptimized Rendering:**
    *   `src/services/serializationService.ts`: Uses `chunks.push(content)` and manual chunking. Needs review to ensure it's not blocking the main thread during large serialization tasks.
    *   `src/components/shared/journal/JournalTable.svelte`: Hardcoded option values instead of dynamic loops, potential for missed updates if config changes.
3.  **Error Handling UX:**
    *   Many catch blocks in `tradeService.ts` and `apiService.ts` seem to swallow or poorly format errors before showing them to the user. E.g., `errorMsg.includes("404")`. Errors should map to actionable i18n messages (e.g., "Network disconnected", "Order rejected: Insufficient margin").

## 🔵 REFACTOR (Code smell, technical debt)

1.  **Direct DOM Manipulation & A11y:**
    *   Need to verify if `.innerHTML` usage exists and is safe (searched for it, but need deeper inspection of any matches to ensure DOMPurify is used as per memory instructions).
2.  **Unmanaged Intervals/Timeouts:**
    *   `setInterval` and `setTimeout` found in `omsService.ts`, `toastService.svelte.ts`, `workerPool.ts`. Ensure these are properly cleared in `.destroy()` methods or lifecycle hooks to support HMR and prevent zombie processes.

---

# Action Plan: cachy-app Hardening

## Group 1: Critical Logic & Type Safety fixes (🔴 CRITICAL)

**Justification:** Measurably improves stability by ensuring the execution engine never receives structurally invalid data from the UI.
1.  **Refactor `tradeService.ts` Types:**
    *   Replace `any` in `signedRequest<any>` and `serializePayload(payload: any)` with explicit generic types or `unknown` combined with Zod validation/type predicates.
    *   *Unit Test requirement:* Write a test mocking `signedRequest` returning malformed data to ensure the service throws a structured error instead of crashing.
2.  **Fix Decimal Conversion Leak in `julesService.ts`:**
    *   Locate lines 88-92 in `src/services/julesService.ts`.
    *   Change `.toNumber()` back to preserving the `Decimal` type or handle the formatting string specifically for the output required, avoiding native JS Number floats.
3.  **Strict Error Type Checking in `apiService.ts` & `omsService.ts`:**
    *   Remove `(e as any).status` casting.
    *   Implement an `isApiError(error: unknown): error is ApiError` type guard to safely check for `.status` and `.code`.

## Group 2: Resource Management & Memory (🟡 WARNING & 🔵 REFACTOR)

**Justification:** Prevents platform crashes during long trading sessions and state corruptions (measurably improves stability/performance).
4.  **Harden Timer Management (Intervals/Timeouts):**
    *   `src/services/omsService.ts`: Ensure `watchdogInterval` is cleared in a `destroy()` method. Add HMR disposal block (`if (import.meta.hot) ...`).
    *   `src/stores/settings.svelte.ts`: Type `notifyTimer` and `saveTimer` as `ReturnType<typeof setTimeout> | null` (instead of `any`). Ensure clearance on destroy.
5.  **Toast Service Bounded Array:**
    *   `src/services/toastService.svelte.ts`: Implement a maximum size for the `this.toasts` array. If `.push()` exceeds `MAX_TOASTS` (e.g., 50), `.shift()` the oldest one. Ensure `setTimeout` IDs are tracked and cleared if the toast is removed early.

## Group 3: i18n & UX Improvements (🟡 WARNING)

**Justification:** Improves UX by ensuring broken states provide localized, actionable feedback to the user.
6.  **Migrate Hardcoded Strings to i18n:**
    *   Identify strings in `src/lib/windows/implementations/AssistantView.svelte` ("Anwenden", "Ignorieren").
    *   Verify target JSON locale files (`src/locales/locales/*.json`) and add keys if missing.
    *   Update Svelte components to use `get(_)('key')` or `$_('key')` appropriately.
