1. *Phase 1: Read-only Analysis & Reporting*
   - Execute codebase exploration and vulnerability scanning using custom Python scripts.
   - Output findings to `report.md` containing CRITICAL, WARNING, and REFACTOR categorizations.
   - Use `read_file` to verify the generated report content.

2. *Phase 2: Fix Financial Precision Issues (CRITICAL)*
   - Justification: "Does this measurably improve stability or performance?" Yes, prevents financial inaccuracies.
   - Use `replace_with_git_merge_diff` to change `parseFloat` and `Number` conversions to safe `Decimal` initializations (e.g., `new Decimal(value).toNumber()`) in `src/types/orderSchemas.ts` and relevant server routes.

3. *Phase 3: Fix Error Handling & Type Safety (CRITICAL)*
   - Justification: "Does this measurably improve stability or performance?" Yes, prevents unhandled exceptions from bypassed type safety.
   - Modify `catch (e: any)` blocks to `catch (e: unknown)` and perform safe error extraction (`e instanceof Error ? e.message : String(e)`) in `src/services/newsService.ts` and `src/routes/api/sync/+server.ts`.

4. *Phase 4: Fix Memory Leaks (Timers & Stores) (CRITICAL)*
   - Justification: "Does this measurably improve stability or performance?" Yes, prevents UI crashes and memory bloating over time.
   - Identify unclosed intervals in components/tests and implement explicit `clearInterval`/`clearTimeout` logic inside an `onDestroy` block or teardown method. Ensure Svelte stores with unbounded arrays are pruned.

5. *Phase 5: Fix XSS Vulnerabilities (CRITICAL)*
   - Justification: "Does this measurably improve stability or performance?" Yes, prevents malicious script execution from unsanitized DOM insertion.
   - Replace direct `@html` or `innerHTML` usage with the safe DOMPurify action (`use:markdown`) in `src/lib/components/ContentRenderer.svelte`.

6. *Phase 6: Update i18n & Missing Translations (WARNING)*
   - Justification: "Does this measurably improve stability or performance?" Yes, improves UI consistency and accessibility.
   - Replace hardcoded UI strings with proper translation key lookups and add them to the localization files (`en.json`, `de.json`) and `schema.d.ts`.

7. *Phase 7: Comprehensive Verification*
   - Run type checks and unit tests to ensure no regressions were introduced.
   - Provide concrete test assertions for any fixed bugs before finalization.

8. *Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.*

9. *Submit*
   - Commit changes and push branch.