1. **Fix Type Safety and `any` Usage (CRITICAL)**
   - **`src/services/newsService.ts`**: Replace `catch (e: any)` with `catch (e: unknown)` and narrow the type using `e instanceof Error ? e.message : String(e)`.
   - **`src/services/newsService.ts`**: Replace `.map((item: any) => ...)` with `.map((item: Record<string, unknown>) => ...)` or explicit unknown narrowing for `newsItems` parsing.
   - **`src/services/tradeService.ts`**: Fix `catch (e: any)` logic and type casting like `data: any = {}` or `<any>` in `signedRequest` to `unknown` or `Record<string, unknown>`.

2. **Harden Error Message Parsing and Prevent HTML Leakage (CRITICAL / WARNING)**
   - **`src/services/tradeService.ts`**: Update the `catch` blocks that handle `BitunixApiError`. Check if `rawMessage` contains HTML (e.g., `.toLowerCase().includes('<html')`). If it does, map the error to a localized key like `apiErrors.invalidResponse` to prevent proxy error pages from bleeding into the UI.

3. **Fix Memory Leak & Teardown Logic (CRITICAL)**
   - **`src/services/marketWatcher.ts`**: Update `destroy()` to clear the `channels` Set (e.g. `this.channels.clear()`) and `this.exhaustedHistory` correctly. Ensure no bounded eviction clears indiscriminately but selectively (e.g., `.entries()`).

4. **Security: Fix Untrusted Markdown Rendering (CRITICAL)**
   - **`src/lib/windows/implementations/MarkdownView.svelte`**: Replace `{@html renderTrustedMarkdown(win.content)}` with `<div use:markdown={win.content}></div>`. Import the action from `src/actions/markdown.ts`.

5. **Fix i18n Missing Keys (WARNING)**
   - Ensure the required error keys (like `tradeErrors.fetchFailed` and `apiErrors.*`) exist in both `src/locales/locales/en.json` and `src/locales/schema.d.ts`. Add `fetchFailed` and `closeAllFailed` if missing.

6. **Tests (CRITICAL)**
   - Create or update a test case (e.g. `src/services/tradeService_errors.test.ts`) that simulates a proxy returning HTML to ensure the HTML is not exposed in the error message.
   - Create or update `src/services/marketWatcher_hardening.test.ts` to assert that `destroy()` properly clears the sets.
   - Execute `npm run test` targeting modified test files to verify stability.

7. **Pre-commit Steps**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
