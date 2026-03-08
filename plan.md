1. **[CRITICAL] Create unit test for the critical bug reproduction**
   - **File:** `src/services/tradeService.repro.test.ts`
   - **Action:** Add a test verifying the order rollback does not crash when an error without an object structure (e.g., throwing a raw string `throw "Network Down"`) is caught in `tradeService.flashClosePosition()`.

2. **Verify test reproduction**
   - **Action:** Run `npx vitest run src/services/tradeService.repro.test.ts` to verify the new test correctly reproduces and catches the error.

3. **[CRITICAL] Fix Unsafe Type Casts in `TradeService`**
   - **File:** `src/services/tradeService.ts`
   - **Action:** Replace `(e as any).code` and `(e as any).status` with a safe, typed object property check (e.g., `typeof e === 'object' && e !== null && 'code' in e`).
   - **Reason:** Prevents runtime crashes in the critical path of order rollback (FlashClose).

4. **[WARNING] Fix Memory Leak in `market.svelte.ts`**
   - **File:** `src/stores/market.svelte.ts`
   - **Action:** Clear `notifyTimer` and `statusNotifyTimer` inside the `destroy()` method.
   - **Reason:** Uncleared `setTimeout` references leak memory when the store is recreated or disposed of.

5. **Run all tests to ensure no regressions**
   - **Action:** Run `npx vitest run` to ensure all tests pass and no regressions were introduced.

6. **Complete pre commit steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. **Submit changes**
   - Once all fixes are applied and tests pass, commit and submit with a descriptive message.
