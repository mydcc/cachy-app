# Codebase Analysis Report

## 🔴 CRITICAL (Risk of financial loss, crash, or security vulnerability)

1. **Unsafe JSON Parsing**: Native `JSON.parse` is heavily used across the codebase instead of the custom `safeJsonParse` utility. This risks silent precision loss with large numeric IDs and crashes on malformed API payloads.
    - *Specific Test Case*: Create a test payload `{"id": 1234567890123456789, "amount": 12345.123456789012}`. Verify that parsing with the standard implementation truncates/corrupts these numbers, while the new implementation retains exact precision.
2. **Missing `safeJsonParse` enforcement**: Although `safeJsonParse` is explicitly mentioned in `AGENTS.md` and memory constraints, it is not consistently applied across state initialization and REST API calls.
    - *Specific Test Case*: Introduce a malformed JSON string like `{"incomplete": true,` and test if the service crashes ungracefully instead of returning a standardized error object like `{ error: 'apiErrors.invalidResponseFormat' }`.
3. **No bounded eviction on unbounded Maps/Sets**: Several internal Maps (like caches in `technicalsService.ts`, `patternDetection.ts` or `RequestManager` in `apiService.ts`) are unbounded, which can lead to Out-Of-Memory (OOM) crashes in a long-running SPA.
    - *Specific Test Case*: Insert 100,001 keys into the `RequestManager` cache. Assert that the cache size never exceeds the configured limit (e.g., 100,000) and that the oldest (or inactive) entries are safely evicted via `.entries()`.
4. **Leaking raw HTML errors**: In `tradeService.ts`, `e.rawMessage` is exposed directly without HTML sanitization, which can leak sensitive proxy error pages to the UI if an API gateway fails (e.g., Cloudflare 502 pages).
    - *Specific Test Case*: Mock an API response throwing a 502 Bad Gateway with raw HTML `<html><body>502 Bad Gateway</body></html>`. Assert that the error returned by `tradeService` maps to `apiErrors.invalidResponse` and does NOT contain `<html`.

## 🟡 WARNING (Performance issue, UX error, missing i18n)

1. **Unclosed intervals & event listeners**: Need to verify if `setInterval` references are correctly cleared using `clearInterval` in cleanup functions (`onDestroy` or `destroy()` methods). Although most stores do clear their intervals, any missing cleanup causes performance degradation.
2. **Hardcoded strings without i18n**: Potential hardcoded error messages might be bypassing the `$_` localized mapping.
3. **Optimistic UI rollback vulnerabilities**: If an API throws an indeterminate error (e.g. timeout), rolling back local optimistic state could cause double ordering.

## 🔵 REFACTOR (Technical debt)

1. **Over-reliance on `.toNumber()`**: High-frequency recalculations use `.toNumber()` which forces Decimal types into floats, breaking end-to-end Decimal precision guarantees.
2. **Use of `as any` in Catch blocks and tests**: Typing errors as `any` bypasses TypeScript and risks runtime exceptions if `e.message` does not exist.

---

### Action Plan (Implementation Proposal):

#### Group 1: JSON Parsing Hardening & Float Safety
- **Justification**: Measurably improves stability by completely eliminating data corruption due to float limitations in JS.
- Replace occurrences of `JSON.parse` with `safeJsonParse` in services and components that handle external API responses and stored state.
- Inspect usages of `.toNumber()` on `Decimal` objects in critical paths, and refactor them to maintain `Decimal` objects end-to-end where practical.

#### Group 2: Bounded Maps & Caches
- **Justification**: Measurably improves performance and prevents OOM crashes during long trading sessions.
- Implement bounded cache eviction for `technicalsService.ts`, `RequestManager` (`apiService.ts`), and `patternDetection.ts`. Use `.entries()` for safe iteration during eviction.

#### Group 3: Error Message Sanitization & Defensive Fallbacks
- **Justification**: Enhances security by preventing HTML leakage and improves UX by standardizing error states.
- Add a check in `tradeService.ts` to see if `e.rawMessage` contains HTML (e.g., `.toLowerCase().includes('<html')`) and map it to `apiErrors.invalidResponse` instead of returning the raw text.
- Ensure all catch blocks use `catch (e: unknown)` and properly type-narrow the error.

#### Group 4: Pre-Commit Checks
- Use `run_in_bash_session` to execute `npm run check && npm run test src/services/tradeService_errors.test.ts`
