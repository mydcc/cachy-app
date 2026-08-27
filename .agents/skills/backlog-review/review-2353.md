Code Review for f07c9ee

**Verdict:** Do not merge — the branch's effective merge result deletes 67 files from develop and rewrites 115 more, almost all of it unrelated to the stated scope. The one intended change (`precompress: true`) is fine, but it is buried in a branch whose history has badly diverged from develop.

I verified this against GitHub's own merge commit for this PR (`refs/pull/2353/merge`), not just the three-dot diff: applying it to `origin/develop` produces 187 changed files → **67 deleted, 5 added, 115 modified** (excluding the `package.json`/`package-lock.json` conflicts, which currently make the PR `CONFLICTING` anyway).

## Findings

**1. Blocking — merge deletes 67 files from develop, all out of scope.**
The deletion list includes, among others:
- Backlog/docs: `docs/backlog/bugs/BUG-0307..BUG-0317`, `FEAT-0303/0304/0306/0316/0319/0320/0321`, `IDEA-0305/0318`, ADRs `0012` and `0013`, `.claude/skills/lightweight-charts/SKILL.md`
- Workflows: `.github/workflows/auto-update-prs.yml`, `.github/workflows/deploy-staging.yml`
- UI: `SettingsContent`/`ChartTab.svelte`-related settings, `IndicatorPaneHeader.svelte`, `TradeFlowBackground` engines, `AssistantView`, `CandleChartView`
- Core code: `src/services/exchange/subscriptionLedger.ts`, `src/services/exchange/adapterConformance.{harness,test}.ts`, `src/lib/chart/indicatorLayer.ts`, `seriesMap.ts`, `src/utils/chartDisplay.ts`, `src/lib/server/aiEndpoint.ts`, `src/utils/crypto/exchangeSigning.ts` (with tests), the `src/utils/server/venues/*` modules (`bitunix.ts`, `bitget.ts`, `orderErrors.ts`, `upstreamRetry.ts`), wasm-parity benchmark
Plus 5 "additions" (a re-introduced `workerPool.ts`/`WasmTechnicalsCalculator.ts`/`wasmTechnicals.ts` + a `.wasm`) and 115 modified files across services, exchange adapters, API routes, and the whole `technicals-wasm` crate.

Root cause looks mechanical: the branch was built on an older snapshot of `develop` whose history has since diverged, so the repeated `merge develop` commits did not reconcile the deletions. Regardless of cause, the merge result is a wholesale revert of recent develop work. The branch needs to be **recreated from current `develop`** carrying only the intended change, not merged as-is.

**2. Blocking — core exchange/security code is among the deletions.**
`src/utils/crypto/exchangeSigning.ts` (request signing for Bitunix/Bitget) and the venue adapter modules are covered by the audit workflow and the Local-First/exchange boundaries; silently removing them alongside everything else is exactly the kind of change that must never ride along in a "security headers" PR.

**3. Regression — `pull-requests: write` permission removed from sync workflows.**
`sync-backlog.yml` and `sync-backlog-full.yml` on the branch keep `contents: write` but drop `pull-requests: write`, present on develop (added for BUG-0307). Merging would silently break the issue auto-linker (`sync-github-issues.ts` PATCH), regressing BUG-0307.

**4. Stale PR description.**
Only 1 of the 4 claimed changes actually ships. Verified against `origin/develop`:
- "Re-enables SSR in `+layout.server.ts`" — not in the diff; `export const ssr = false` is still there (matches develop).
- "Adds CSP header logic in `hooks.server.ts`" — `hooks.server.ts` is unchanged vs develop. The CSP headers already live in `server.js` on develop.
- "Removes hardcoded `unsafe-inline`" — not in the diff; `style-src: ["self", "unsafe-inline"]` remains in both `server.js` and `svelte.config.js` (matches develop).
- "Enables `precompress: true`" — this, and only this, is present.

Please update the title/body to reflect reality (or recreate the branch so the description is true).

**5. The one real change is correct.**
`adapter({ precompress: true })` is safe and effective: adapter-node (^5.x) generates `.br`/`.gz` at build time, sirv serves brotli-first, and `Content-Encoding` is set so the Express `compression()` middleware won't double-compress. Genuine Lighthouse gain; the only cost is larger build output. This part is fine to keep.

**Non-Negotiable Rules:** N/A for the one intentional config line. However, the accidental deletions hit `area: exchange` / `area: security` files, which is why this needs a rebuild rather than a merge.

**CI:** only `Closing References` fails (missing `Fixes #<issue>`) and the PR is marked `CONFLICTING` — both already surfaced by GitHub/CI, not repeated here.

👤 Note: this PR touches `area: exchange` + `area: security` (deletions of request-signing and venue adapters). Human review recommended before merge — and honestly, a fresh branch from current `develop` with just the `precompress` line would make that review trivial.

Thanks for the thorough earlier detective work in this thread — the `style-src` catch saved the merge a real incident. The remaining problem is at the git level rather than the config level. 🎯