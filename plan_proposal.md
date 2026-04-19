# Action Plan: cachy-app Hardening

## Group 1: Critical Logic & Type Safety fixes (🔴 CRITICAL)

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

4.  **Harden Timer Management (Intervals/Timeouts):**
    *   `src/services/omsService.ts`: Ensure `watchdogInterval` is cleared in a `destroy()` method. Add HMR disposal block (`if (import.meta.hot) ...`).
    *   `src/stores/settings.svelte.ts`: Type `notifyTimer` and `saveTimer` as `ReturnType<typeof setTimeout> | null` (instead of `any`). Ensure clearance on destroy.
5.  **Toast Service Bounded Array:**
    *   `src/services/toastService.svelte.ts`: Implement a maximum size for the `this.toasts` array. If `.push()` exceeds `MAX_TOASTS` (e.g., 50), `.shift()` the oldest one. Ensure `setTimeout` IDs are tracked and cleared if the toast is removed early.

## Group 3: i18n & UX Improvements (🟡 WARNING)

6.  **Migrate Hardcoded Strings to i18n:**
    *   Identify strings in `src/lib/windows/implementations/AssistantView.svelte` ("Anwenden", "Ignorieren").
    *   Verify target JSON locale files (`src/locales/locales/*.json`) and add keys if missing.
    *   Update Svelte components to use `get(_)('key')` or `$_('key')` appropriately.

## Group 4: Pre-commit Verification

7.  **Complete pre-commit steps:**
    *   Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
