# Repository Audit — July 2026

A baseline audit taken as the project moved from two months of rapid prototyping
to a documented, versioned workflow. It records what was verified, what was
fixed, and what is still open, so the follow-up work does not have to
re-establish the same facts.

Everything below was verified against the code, not inferred from the existing
documentation — which turned out to be the point.

---

## 1. Versioning was broken end to end

This was not cosmetic. The failure chain:

1. `package.json` had **no `version` field**.
2. `vite.config.ts` injected `process.env.npm_package_version` into
   `VITE_APP_VERSION`. With no version field that variable is `undefined`, and
   `JSON.stringify(undefined)` is `undefined` — not a string.
3. The app footer (`src/routes/+page.svelte`) therefore rendered the literal
   text **`undefined`** to users, while
   `src/components/settings/SettingsContent.svelte` silently fell back to
   `0.0.0`.
4. The repository had **zero Git tags**.
5. **semantic-release was never installed or configured**, although both
   `README.md` and `CLAUDE.md` stated that versioning was automated via
   Conventional Commits.
6. The version was instead hardcoded in five drifting places: the README badge,
   `src/routes/api/health/+server.ts`, and the `whitepaper.*.md` /
   `changelog.*.md` content files.
7. The commit history does not follow Conventional Commits (`add`, `add a line`,
   `timeout-fix`, `change folder name`), so semantic-release would have derived
   no releases even if it had been installed.

### Fixed

- `package.json` now declares `name`, `version` (`1.0.0`), `license`,
  `description` and `repository`.
- `vite.config.ts` reads the version out of `package.json` directly, so it no
  longer depends on being launched through an npm script.
- `src/lib/version.ts` is the single accessor (`APP_VERSION`). The health
  endpoint, the footer, the settings panel and the tracking payload all read
  from it. No version string is hardcoded anywhere else.
- `src/lib/version.test.ts` is a regression guard: it fails if `package.json`
  loses its version field, if the version is not valid semver, or if
  `APP_VERSION` drifts from `package.json`.
- semantic-release, commitlint and the previously missing ESLint packages are
  installed. `.releaserc.json` and `commitlint.config.js` configure them.
- `.github/workflows/release.yml` releases from `main` and `develop`;
  `.github/workflows/commit-lint.yml` rejects non-conforming commits in pull
  requests.

### Versioning restarts at 1.0.0

semantic-release derives the next version from the most recent Git tag. The
repository has none — and rather than anchoring a tag to continue the
hand-maintained 0.9x line, the decision was to **restart at 1.0.0**. With no tag
present, `1.0.0` is exactly what semantic-release publishes as its first release,
so no baseline tag is needed and no manual step remains.

`package.json` declares `1.0.0`. The 0.9x history stays in
`docs/CHANGELOG-legacy.md`. Because the published number jumps series, the change
carries a `BREAKING CHANGE:` footer — anything comparing against 0.9x strings,
including the `/api/health` `version` field, has to be updated.

Two release channels are configured, matching the split `deploy.sh` already uses
via `.deploy.conf`: `main` publishes stable releases (cachy.app) and `develop`
publishes `-beta.N` prereleases (dev.cachy.app). So the first release from
`develop` will be `1.0.0-beta.1`, with stable `1.0.0` following when `develop`
merges to `main`.

One gap worth noting: the app renders its in-app changelog from
`src/lib/assets/content/changelog.{de,en}.md`, **not** from the generated
`CHANGELOG.md`, so releases will not update what users see. Both files now carry
a note pointing at the generated changelog; wiring them together is roadmap
item 11a.

## 2. Documentation contradicted the code

| Claim | Location | Reality |
| --- | --- | --- |
| `npm run lint` | `README.md` (setup + contributing) | The script did not exist, and none of the ESLint packages imported by `eslint.config.js` were installed. Any contributor following the README hit an immediate error. |
| `src/instructions/guide.en.md`, `src/instructions/changelog.en.md` | `README.md` documentation section | `src/instructions/` does not exist. The real path is `src/lib/assets/content/`. |
| "Node.js (v18+)" | `README.md` prerequisites | `engines` requires `>=20.0.0`; `.node-version` pins `20.18.3`. |
| Automated versioning via Conventional Commits | `README.md`, `CLAUDE.md` | Nothing was installed. See section 1. |
| Version `0.94.3` | README badge | Hardcoded and drifting. Now a live GitHub release badge. |

Additional defects in `README.md`, all fixed: the intro paragraph appeared
twice in two different wordings; the "Advanced Features" list was duplicated in
full in German and English; the side-panel feature was described by two
contradictory bullets; the changelog table of contents omitted 0.94.3 while the
body included it; the DeepWiki badge appeared twice.

The ~80-line hand-written changelog was moved out of the README into
`docs/CHANGELOG-legacy.md`. `CHANGELOG.md` is now generated by semantic-release.

---

## 3. Open contradiction: Local-First vs. the server chat store

`CLAUDE.md` states that all user data lives exclusively in `localStorage` and
that server persistence must not be introduced. The README and whitepaper repeat
this ("no cloud/server persistence"), and the legacy changelog claims 0.94.3
**removed** Global Chat.

The code says otherwise:

- `src/lib/server/chatStore.ts` writes chat messages to disk at
  `db/chat_messages.json` (path overridable via `CHAT_DB_PATH`), retaining up to
  1000 messages. That is server persistence, not an ephemeral cache.
- Global Chat is still present in the UI layer:
  `src/components/shared/SidePanel.svelte`,
  `src/lib/windows/implementations/ChatWindow.svelte.ts`,
  `AssistantView.svelte`, `ChatTestView.svelte`, plus the
  `sidePanel.globalChat` i18n key.
- ~~However, `chatStore` is imported **only by its own test file** — no route or
  component wires it up.~~ **Incorrect — corrected in section 12.** It is reached
  by `src/routes/api/chat-v2/+server.ts`, which the side panel drives through
  `src/stores/chat.svelte.ts`. The route authenticates both handlers.

Further investigation found a **second, current** chat backend that the first
pass missed: `src/services/cloudService.ts` connects to **SpacetimeDB** and is
wired to `src/components/settings/tabs/CloudTab.svelte`. The server module is
`server/spacetimedb/src/index.ts` with a single `send_message` reducer, and 10
generated binding files live in `src/lib/spacetimedb/`.

Decisively, the SpacetimeDB table `GlobalMessage` contains exactly three fields —
`sender`, `text`, `sentAt`. No journal entry, setting, preset, note or API key
appears in the schema or in any reducer, `connect()` refuses to run without an
explicit token, and the only entry point is a settings tab the user must open.

So the guarantee that actually matters — trading data and credentials never leave
the device — **held in the code all along**. Only the documentation was wrong, and
wrong in both directions at once: too absolute about the architecture, and
incorrect about Global Chat having been removed.

**Resolved.** Global Chat is kept as an optional, opt-in server feature.
`docs/adr/0001-local-first-boundary.md` defines Local-First as a data class
boundary rather than an absolute, and `CLAUDE.md`, the README and both
whitepapers now state that boundary. The whitepaper's previous blanket
GDPR/CCPA claim ("we do not process user data") was removed: chat messages are
personal data processed on a server, which implies a retention and deletion
policy that does not yet exist (roadmap item 15).

~~The orphaned file-based `chatStore.ts` remains untouched and is roadmap item 12 —
it has no authentication and would violate the boundary's second condition.~~
**Both claims were wrong; see section 12.** It is neither orphaned nor
unauthenticated.

---

## 4. ESLint had never been run

Once the missing packages were installed, ESLint reported **3319 problems**.
Analysis showed most were configuration faults rather than code defects:

| Cause | Count | Resolution |
| --- | --- | --- |
| Vendored / generated bundles being linted (`static/ammo/ammo.wasm.js` — Emscripten output; `static/js/newrelic.js` — minified agent, one 62 095-character line) | ~1360 | Added to `ignores`. |
| `no-undef` on TypeScript files, which cannot see ambient type names like `EventListener` or `NodeJS`, nor Svelte 5 runes | 498 | Disabled for TS per typescript-eslint guidance; runes declared as globals. `npm run check` is the real gate and passes with 0 errors. |
| `no-redeclare` on the const-object-as-enum pattern in `src/types/orderTypes.ts`, where `export const OrderSide` and `export type OrderSide` legitimately occupy separate declaration spaces | 3 | Disabled; `tsc` is the authority. |

Of the genuine findings that remained, **all 112 errors are now fixed and lint is
a required CI check** (`.github/workflows/audit.yml`). Highlights:

- **22 `no-unused-expressions` were not defects at all.** Every one was a
  deliberate Svelte 5 dependency registration — a bare read like
  `_s.accountSize;` inside `$effect`, which is what subscribes the effect to that
  rune. Removing one would silently stop the calculator recalculating when that
  input changes. They carry inline disables explaining the pattern; the rule
  stays active everywhere else.
- **Converting 27 `@ts-ignore` to `@ts-expect-error` exposed four dead
  suppressions** — directives on lines that produce no error at all, in
  `app.ts`, `cryptoService.ts` and `settings.svelte.ts` (x2). They had been
  masking nothing while hiding type checking. Removed.
- **The 10 `preserve-caught-error` sites now chain the original failure** via
  `{ cause: e }`. Thrown messages are unchanged i18n keys, so the UI is
  unaffected, but exchange and storage failures are now diagnosable.
- **10 empty `catch` blocks were all intentional** best-effort teardown
  (WebSocket send/close, JSON fallback, test cleanup). Each now carries a comment
  stating why nothing is done — which both documents the intent and satisfies
  the rule.
- **Dead initialisers were removed where TypeScript can prove the paths.** In
  `calculatePivotsFromValues` the `let p = 0` defaults were genuinely dangerous:
  a missed branch would have emitted a pivot of `0`, which looks like a real
  price level. With `strict: true`, the uninitialised declarations now fail the
  build instead.
- **The parse error at `+layout.svelte`** was resolved by moving the JSON-LD
  construction into the script block and concatenating the tag delimiters, so
  neither the Svelte compiler nor `svelte-eslint-parser` sees a literal script
  tag. Output verified byte-equivalent.
- **Test and benchmark files keep relaxed rules** for module mocking
  (`no-require-imports`, `no-import-assign`, `no-useless-catch`), and
  `safeJson.bench.ts` disables `no-loss-of-precision` because its fixtures
  deliberately exceed IEEE 754 precision — that is the thing being benchmarked.

**573 warnings remain**, dominated by `no-explicit-any` (462) and
`no-unused-vars` (111). CI enforces `--max-warnings 573` as a ratchet: the
ceiling may only be lowered, so the backlog can shrink but never grow.

Verified across the whole change: `npm run check` stays at 0 errors and the full
test suite reports the identical 28 pre-existing failures (777 passing, 0 new,
0 fixed).

## 5. Repository hygiene

Fixed:

- `README_FIX_DOCUMENTATION.md` — an empty 0-byte file. Deleted.
- `playwright-report/index.html` was committed. Untracked; `playwright-report/`,
  `blob-report/` and `.playwright/` added to `.gitignore` (`test-results/` was
  already ignored).

Left for a decision, deliberately not touched:

- ~~**Two deployment guides:** `DEPLOY.md` and `DEPLOYMENT.md`.~~ **Resolved**
  (item 10) — merged into `DEPLOYMENT.md`. The assumption above that "they do not
  conflict" turned out to be wrong; see section 10.
- ~~**Four sources for brand/design.**~~ **Resolved** (item 11) — one canonical
  `docs/BRAND.md`, written from `src/themes.css`. See section 11.
- ~~**`chartpatterns.html` (224 KB) in the repository root** also exists as
  `info/chartpatterns.html` (272 KB).~~ **Resolved** (item 23). The size
  difference was the whole story: the `info/` copy documents 56 chart patterns,
  the root copy 4. Commit `b9931450` added 6343 lines to the `info/` copy and
  left the other untouched, so the root file was an abandoned draft. It also
  lacked the `chartpatterns_files` sidecar the `info/` copy references. Deleted.
- ~~**`.deploy.conf` is committed** alongside `.deploy.conf.example`. It contains
  no secrets, only infrastructure paths and ports, but it is the example file
  filled in.~~ **Resolved** (item 22) — and the description above was too
  generous: it was not "the example file filled in" but a **divergent** file. It
  carried two keys nothing reads (`STABLE_WORK_DIR`, `BETA_WORK_DIR`), lacked two
  the template has, and named a different production start command. It was the
  live configuration of cachy.app in a public repository. Untracked and ignored;
  the template now lists exactly the keys `deploy.sh` reads, and `DEPLOYMENT.md`
  carries the migration step — `deploy.sh` does `git reset --hard && git pull`,
  so the deploy that pulls the change removes the server's config and the *next*
  one fails.
- ~~**Branch mismatch:** no `main` branch exists on the remote.~~ **Incorrect —
  corrected.** `main` does exist, at `d324c32`, two commits behind `develop` and
  fully contained in it. The initial audit relied on `git branch -a`, which in
  this partial clone only listed the branches that had been fetched;
  `git ls-remote --heads origin main` shows it. `.deploy.conf` was right all
  along, and the stable/beta split it documents is real.

  **Resolved:** `.releaserc.json` now configures `main` for stable releases and
  `develop` as a `beta` prerelease channel, matching `.deploy.conf`
  (`BRANCH_STABLE=main` → cachy.app, `BRANCH_BETA=develop` → dev.cachy.app).
  `release.yml` triggers on both.
- **Ad-hoc scripts without structure:** `verification/`, `plans/`,
  `src/verify_settings_v2.py`, and roughly 20 mixed Python/JS helper scripts in
  `scripts/`. Worth grouping and documenting, or removing what is spent.

---

## 6. Whitepaper audit — all eight chapters

The whitepaper (`src/lib/assets/content/whitepaper.{de,en}.md`, ~29 KB per
language) is the document shown to outside readers, and it had never been checked
against the code. Every file, path and command reference was resolved, and the
published maths was made executable.

### What held up

- **The worked example in chapter 3 is correct.** Account $10,000, risk 1%, entry
  $50,000, stop $49,000 → 0.1 BTC, $5,000 position value, $500 margin at 10x, and
  a loss of exactly the risked $100 if the stop is hit. All five figures were run
  through the real calculator and match. This is now locked in by
  `src/lib/whitepaper-claims.test.ts`, so the document cannot drift from the
  engine without a test failing.
- **The security chapter is accurate, and understates the implementation.**
  `cryptoService.ts` uses AES-GCM/CBC with a 256-bit key size and PBKDF2, with
  non-extractable keys and derived-key caching — more than the whitepaper claims.
- **The three named `localStorage` keys all exist** (`cachy_trade_store`,
  `tradeJournal`, `cryptoCalculatorSettings`).
- **The PWA and telemetry claims hold.** `static/manifest.json` and
  `src/service-worker.ts` are present, and tracking is Matomo via `window._mtm`,
  consistent with "standard non-intrusive analytics (if enabled)".
- **The core stack claims are right**: SvelteKit, TypeScript, TailwindCSS, Svelte 5
  Runes, decimal.js, Chart.js, Vitest are all installed at the stated versions.

### What was wrong

| Chapter | Claim | Reality |
| --- | --- | --- |
| 2 | Four store files named `AccountState.svelte.ts`, `MarketState.svelte.ts`, `TradeState.svelte.ts`, `JournalState.svelte.ts` | None exist. The real files are lowercase: `account.svelte.ts`, `market.svelte.ts`, `trade.svelte.ts`, `journal.svelte.ts`. A reader following the document finds nothing. |
| 2 | "TechnicalIndicators — modular library" | No such library, and no such dependency. Indicator maths is `technicals-wasm/` (Rust → WASM) plus `src/utils/indicators.ts` (~2000 lines) and `technicalsCalculator.ts`. |
| 2 | Stack table of eight rows | Omitted the WASM indicator engine, WebGPU (17 WGSL shaders + `webGpuCalculator.ts`), three Web Workers, SpacetimeDB, both AI SDKs (OpenAI, Gemini), `lightweight-charts`, `three` and Zod validation. The document described a materially simpler application than the one that exists. |
| 3 | "The mathematical heart resides in `src/lib/calculator.ts`" | That file is **74 lines** — a facade. The maths is in nine modules under `src/lib/calculators/`. |
| 3 | `journalStore` | Named `journalState`. |
| 5 | The "Safe Swap" synchronisation protocol | The term appears nowhere in the codebase. Marked in the document as a whitepaper-only name, pointing readers to `syncService.ts` instead. |
| 8 | `npm run test:unit` | Does not exist. The command is `npm test`. |
| 8 | `python3 verify_pagination.py` | Does not exist. The real scripts are in `verification/` and `scripts/`. |
| 8 | Reverse proxy to "Port 3000" | `.deploy.conf` uses **3001** (stable) and **3002** (beta). |
| 8 | `pm2 start server.js` | `npm start` runs `node build/index.js`. Both files exist but are different entry points; the document now says so instead of implying they are interchangeable. |
| 8 | Setup is `npm install && npm run dev` | Omitted that both `dev` and `build` first run `scripts/build_wasm.sh`, and said nothing about `npm run check`, `npm run lint` or `npm run test:e2e`. |

### Cross-language divergence

The German table carried a `VisualBar Component` row the English one lacked. The
component is real (`src/components/shared/VisualBar.svelte`), so the row was added
to the English table rather than removed from the German one. Both tables now
match.

### One forward-looking correction

Chapter 7 promised a "Read-Only Investor View" generating a public link to a
portfolio, noting in passing that it "requires a move to a DB-backed
architecture". Under ADR-0001 that moves journal data from Class A to Class B —
a breaking change requiring its own ADR. The chapter now states that explicitly
and marks the feature as not currently planned, rather than advertising it as a
roadmap item with an unstated architectural cost.

---

## 7. Security findings from the test-failure work

Working through the pre-existing test failures (roadmap 18) surfaced three
security issues. All three had been invisible because the tests that would have
caught them were already red and treated as background noise.

### API authentication failed open

`checkAppAuth` guards 17 routes — trading, sync, and three AI proxies that spend
the operator's money. When `APP_ACCESS_TOKEN` was unset it returned "allow", with
an explicit comment saying so. Two test files, one named
`auth_fail_closed.test.ts`, asserted the opposite and had been failing.

`APP_ACCESS_TOKEN` was documented nowhere and there was no `.env.example`, so
"unset" was the realistic default state of any deployment — including the public
`cachy.app` and `dev.cachy.app`.

**Resolved** per `docs/adr/0002-api-authentication-fails-closed.md`: fails closed
with a 401 whose body is indistinguishable from a wrong-token rejection, so the
caller learns nothing about the deployment. `.env.example` now documents the
variable. **This requires setting the token on the server before deploying**, or
the live instance answers 401 to everything.

### Two tests were only green because auth failed open

- `src/tests/security/cmc_proxy.test.ts` supplied no token at all. Its whitelist
  and path-traversal assertions never reached the code they were testing once
  auth started rejecting.
- `src/tests/security/rss_fetch_ssrf.test.ts` mocked
  `../../../lib/server/auth` — one directory level too high, resolving outside
  `src/`. The mock silently never applied. Only fail-open kept the test passing.

Both fixed. The second is the more instructive: a mock pointing at a nonexistent
path fails silently, and the test still passed for the wrong reason.

### `VITE_*_API_KEY` defaults leaked to the browser — resolved

`src/stores/settings.svelte.ts` read `import.meta.env.VITE_OPENAI_API_KEY`,
`VITE_GEMINI_API_KEY` and `VITE_ANTHROPIC_API_KEY` as default values for the
user's AI key settings. Vite **inlines every `VITE_`-prefixed variable into the
client bundle at build time**, so setting any of them for a production build
served the operator's AI keys as plain JavaScript to every visitor.

A trap rather than a live bug — it only fired if someone set those variables when
building. But nothing prevented it, and the convenience it bought was small: a
key entered once in Settings → AI persists in that browser anyway.

**Resolved** as roadmap item 24a. The three fallbacks are gone, replaced by a
comment at the field declarations stating why there is none. Two tests in
`src/stores/settings.security.test.ts` stub the environment variables and assert
a fresh `SettingsManager` ignores them, and that nothing containing the value
reaches `toJSON()`. Verified as genuine guards: restoring one fallback makes both
fail. The variables were also dropped from `.env.example`, since nothing reads
them any more; the README keeps the warning, because the underlying Vite
behaviour still applies to any future `VITE_` variable.

### A live imgbb API key is committed as a default setting

Found while removing the above. `defaultSettings.imgbbApiKey` in
`src/stores/settings.svelte.ts` is not empty like every other credential — it
holds a 32-character hex imgbb key. `imgbbService.ts` uploads screenshots with
whatever is in that field, so **every user of every build shares one account's
key**, and it ships in the client bundle by construction.

Left in place deliberately: unlike the `VITE_` fallbacks this is load-bearing —
deleting it silently breaks screenshot upload for everyone until they register
their own key, and a shared free-tier key may well have been the intent. It also
sits in git history, so the effective fix is to rotate the key at imgbb, not just
to remove the literal. Recorded as roadmap item 24e for an explicit decision.

### The full environment-variable audit

Item 24b: every variable the code reads, checked against `.env.example`.
Application code reads seven, plus one that is not operator configuration:

| Variable | Read by | Was documented |
| --- | --- | --- |
| `APP_ACCESS_TOKEN` | `src/lib/server/auth.ts` (`$env/dynamic/private`) | yes |
| `LOG_STREAM_KEY` | `src/routes/api/stream-logs/+server.ts` | yes |
| `CHAT_DB_PATH` | `src/lib/server/chatStore.ts` | yes |
| `NODE_ENV` | `api/health`, `api/tpsl` | yes |
| `OPENAI_API_KEY` | `src/routes/api/sentiment/+server.ts` | yes |
| `GEMINI_API_KEY` | `src/routes/api/sentiment/+server.ts` | yes |
| `PORT` | `server.js` | **no** |
| `VITEST` | `src/lib/server/chatStore.ts` | n/a — set by the test runner |

Only `PORT` was missing, and it is not cosmetic: `server.js` deliberately
defaults to 3001 rather than adapter-node's 3000, because port 3000 is commonly
taken on shared hosting. That decision lived in a code comment and in
`.deploy.conf`, nowhere an operator reading `.env.example` would find it.

Added along with `ORIGIN`, which the application never reads but adapter-node
does — behind a reverse proxy, SvelteKit cannot otherwise resolve `event.url`.
The reverse check found no orphans: every variable in `.env.example` is read by
something.

`DISCORD_WEBHOOK_URL` (`scripts/discord-notify.sh`) is deployment tooling
configured through `.deploy.conf`, not the app's `.env`. `.env.example` now says
so rather than leaving the reader to guess.

**The durable part is `src/tests/env_documentation.test.ts`**, which walks the
source tree, extracts `process.env.X` and `$env` reads, and fails when one is
absent from `.env.example`. It caught `PORT` on its first run. This is the exact
failure mode behind ADR-0002 — `APP_ACCESS_TOKEN` was undocumented, so nobody set
it, so auth had to fail open to work at all — and it can no longer happen
quietly. The test also asserts that its own scanner still finds
`APP_ACCESS_TOKEN`, so a regex that stops matching cannot make it pass vacuously.

While there: `DEPLOYMENT.md` section 7 was headed "Environment Variables
(Optional)" and omitted `APP_ACCESS_TOKEN` entirely. Written before ADR-0002, it
would have walked an operator straight into a deployment that answers 401 to
everything. Corrected.

### An unrelated `.gitignore` bug found while fixing the above

`.gitignore` contained `! .env.example` — with a space after the `!`. Git reads
that as a literal filename, so the negation never applied and any `.env.example`
would have been silently ignored. That is plausibly why the file never existed.
Corrected to `!.env.example`, verified with `git add --dry-run`.

---

## 8. The 28 pre-existing test failures

At the start of this work `npm test` reported 28 failures across 20 files on
`develop`, independent of any change. They had been red long enough to be treated
as background noise, and that is precisely what made them expensive: **five were
production bugs hiding behind them.**

### Production bugs found

| Bug | Consequence |
| --- | --- |
| `getRelativeTimeString` and `formatGermanDate` did not guard against `NaN`. `new Date("nonsense")` does not throw — it yields an Invalid Date, so every `NaN > 0` comparison was false and control fell through to the final return. | A news item with an unparseable timestamp was displayed as **"gerade eben" / "just now"** — presented as breaking news. The values also fed the AI context. |
| `checkAppAuth` failed **open** when `APP_ACCESS_TOKEN` was unset, which was the realistic default since the variable was undocumented and no `.env.example` existed. | 17 routes open on a public deployment, including three AI proxies billed to the operator. See ADR-0002. |
| The kline backfill loop in `ensureHistory` broke on an empty batch but had no guard for non-empty batches that added nothing. | Infinite loop issuing API requests — rate-limit exhaustion, then OOM. Reproduced: the test exhausted the heap. |
| `newsStore.refresh()` guarded concurrency with `isLoading`, which is only set *after* a deliberate 3s delay. | Two calls inside that 3s window both fetched — the exact duplicate the guard existed to prevent, and the likeliest case in practice. |
| Moving averages with insufficient history reported a value of **0**. | A pivot or MA of 0 is indistinguishable from a real price level. Already fixed in the calculator; a test still asserted the broken behaviour and was inverted to lock the fix in. |

### The other 23

Stale or incomplete test setups. The recurring theme is a **mock that had drifted
from the interface it stood in for**, so the test failed while the code was right:

- Request mocks offering `json()` when the route reads `text()` (deliberately, via
  `safeJsonParse`, to protect numeric precision), or lacking `headers` entirely.
- Response mocks lacking `status`, which the terminal-error classification reads.
- A logger mock missing `debug`, so the code threw a `TypeError` mid-flow — and the
  rollback logic then correctly classified an unknown outcome as indeterminate,
  which the test blamed on the rollback.
- A `vi.mock` path one directory level too high, so the mock silently never applied.
- Position fixtures with no `lastUpdated`, tripping a 200ms freshness check that
  aborts before the code under test is reached.
- Tests awaiting a promise gated on a timer under `vi.useFakeTimers()` without ever
  advancing the clock.
- A missing `$app/environment` mock, so `app.init()` returned immediately at its
  `if (browser)` guard and the startup benchmark measured nothing — zero fetches.
- Assertions against fields that do not exist (`params` on an oscillator) or in the
  wrong place (ADX searched in `oscillators`; it lives in `advanced`, and is off by
  default).

### Result

`npm test` exits 0 — **830 passing, 0 failing**, 2 files and 6 tests skipped. The
CI job that previously ran three hand-picked files now runs the whole suite, so a
red run finally means the pull request broke something.

---

## 9. Order IDs were silently corrupted (fixed)

The project has `safeJsonParse` specifically to stop `JSON.parse` from mangling
long numeric literals, and used it for **inbound** request bodies — but every
exchange response was read with `response.json()`, which is the direction the
large numbers actually come from. `klines/+server.ts` was the sole exception and
already did it correctly.

`apiSchemas.ts` types `orderId` as `z.union([z.string(), z.number()])`, so an ID
may legitimately arrive as a JSON number. Exchange order IDs are routinely 19
digits; `Number.MAX_SAFE_INTEGER` is 16. Reproduced end to end through the real
`sync/orders` route:

```
1234567890123456789  ->  response.json()      ->  1234567890123456800
1234567890123456789  ->  readExchangeJson()   ->  1234567890123456789
```

A corrupted ID is not a rounding inconvenience. The app would hold an order
identifier that does not exist, so a later cancel or modify targets the wrong
order or silently does nothing.

**Fixed.** All 11 exchange sites — `tpsl` (2), `balance` (2), `positions` (2),
`sync`, `sync/orders`, `sync/order-detail`, `sync/positions-pending`,
`sync/positions-history` — now use `readExchangeJson`
(`src/utils/server/exchangeResponse.ts`).

Two things worth recording about the fix:

- **It is safe for arithmetic.** `safeJsonParse` quotes only literals of 15+
  characters. Millisecond timestamps (13 digits) and status codes keep their
  numeric type, so code doing `a.timestamp - b.timestamp` is unaffected. Asserted
  explicitly in `exchangeResponse.test.ts`.
- **The guard is real, not a tautology.** Reverting one route to
  `response.json()` makes the end-to-end test fail; restoring it makes it pass.
  That was checked rather than assumed.

`external/cmc` still uses `response.json()` and returns prices as JSON numbers.
It feeds display and sentiment, never order handling, so it was recorded as
roadmap item 24d rather than folded into this change — **and then deliberately
left alone**. Converting it would turn the ~16-character total market cap into a
string while `cmcService.ts` declares it `number`, breaking a real path to buy
precision nobody can use. The reasoning is a comment at the call site.

---

## 10. Both deployment guides described a script that does not exist

Roadmap item 10 was filed as tidiness — two guides, merge them. It was not
tidiness. Neither guide described how `deploy.sh` actually works, and the errors
pointed in the dangerous direction.

`deploy.sh` recognises exactly one argument, `--beta`. Its default is
**production**:

```bash
ENV_TYPE="stable"
if [[ "$1" == "--beta" ]]; then
    ENV_TYPE="beta"
fi
```

Against that:

| Documented | Actual effect |
| --- | --- |
| `DEPLOY.md`: `./deploy.sh cachy-app` for production | correct by accident — the argument is ignored, and the default is production |
| `DEPLOY.md`: `./deploy.sh devcachyapp` for staging | **deploys production** — the argument is ignored |
| `DEPLOYMENT.md`: `./deploy.sh` = "Deploy to staging" | **deploys production** |
| `DEPLOYMENT.md`: `./deploy_prod.sh` for production | the file does not exist |

The staging command in the old `DEPLOY.md` deployed to `cachy.app`. Three guards
stand in the way — the script prints the target environment in a banner, refuses
to run unless the working tree is on `main`, and requires an explicit `y` for a
production deployment — so this was unlikely to go through unnoticed. But the
documented safe command was the unsafe one, and the guards are the only reason
that did not matter.

Other corrections made while merging, each checked against the script or a route
rather than carried over:

- **Branch name**: staging tracks `develop`, not `dev`.
- **Backup paths**: backups are grouped by mode name (`stable` / `beta`), not by
  `dev` / `prod` as the troubleshooting section claimed.
- **Deployment lock**: the troubleshooting section told the reader to delete
  `/tmp/cachy_deploy_*.lock`, and the feature list claimed a concurrency check.
  There was no lock anywhere in `deploy.sh`. **Since built** (item 24f) — a
  `flock` on `.deploy.lock` taken before the first mutating step, so the
  documentation is true now rather than merely corrected.
- **Atomic build**: the script builds into a shadow directory and only swaps on
  success, which the old text did not mention. That is the guide's strongest
  safety property and it was undocumented.
- **Health endpoint**: the example response still showed version `0.94.3`;
  `/api/health` is unauthenticated by design, which is why `deploy.sh` can use it
  before any token exists.
- **`npm ci` vs `npm install`**: the install step now matches what the script
  runs (`npm ci --legacy-peer-deps`).

`DEPLOY.md`'s one piece of unique content — why 404s appear on JS and CSS after a
build without a restart — is preserved as a subsection of the manual-update
section, since that is the only path where the reader has to do the restart
themselves.

---

## 11. Three brand documents, three different brands

Item 11 asked for one canonical brand document instead of four sources. The
sources did not merely overlap — they disagreed, and two of them were not written
for this project.

**The good news first:** the palette is real and correctly implemented. Every core,
highlight, gradient and light/dark value in `src/themes.css` matches the designed
original, and the four brand themes named in the documents —
`.theme-meteorite`, `.theme-steel`, `.theme-ever`, `.theme-insight` — all exist.
So `docs/BRAND.md` is written from the code, which is the thing users actually see.

What was wrong with each source:

- **`BRAND GUIDELINES.md`** was text extracted from the `brand_guidelines/` JPGs,
  and the extraction **truncated most hex values while leaving the RGB triples
  intact**: `#4e21e` for `#4e21e7`, `#e6f6f` for `#e6f6f5`, `#0f` for `#0f0523`,
  and in one case just `#`. Anyone copying a colour out of it would have got an
  invalid value. Deleted — the JPGs remain, and every truncated value is
  recoverable from the surviving RGB triples, which match `src/themes.css`
  exactly. That agreement is also the proof that the implemented palette *is* the
  designed one.
- **`CORPORATE_DESIGN.md`** had a logo section with blank file names, blank
  minimum sizes and a blank clear-space value, and a typography section whose
  headline font was an empty code block. Its verified content — the type scale,
  the spacing and breakpoint conventions, the logo do-nots — is carried over,
  labelled as intent, since nothing in the code enforces it.
- **`SYSTEM_BRAND_GUIDELINES.md`** assigned the four themes to routes that do not
  exist here (`/services`, `/xr-studio`, `/offer/free-ebook`, `/work/n8n-nodes`),
  and `BRAND GUIDELINES.md` ended with the footer *"HEINZE MEDIA is a WordPress
  SEO Plugin for your website"*. Both were written for a different property and
  reused without adaptation.

### The headline font is genuinely unknown

Three documents, three answers, none matching the app:

| Source | Headline font |
| --- | --- |
| `BRAND GUIDELINES.md` | Degular Bold |
| `CORPORATE_DESIGN.md` | Montserrat Bold |
| `SYSTEM_BRAND_GUIDELINES.md` | Montserrat on line 234, Degular Bold on line 251 |
| The app | neither — headings use the user's chosen body font |

Degular is commercial, Montserrat is free, so this is a licensing question as well
as a design one. Recorded in `docs/BRAND.md` as open rather than guessed.

### Two places where the code departs from the documented brand

Both left alone, because the code is what ships and neither looks accidental:

- `.theme-meteorite` sets its accent to **Blue PRO**, not Purple as documented.
- `.theme-ever` and `.theme-insight` use literal background gradients
  (`#052618 → #010f08`, `#3d050e → #0f0505`) instead of their `--gradient-*`
  tokens — far darker than documented, consistent with a trading UI that runs dark.

### On the 23 non-brand themes

`src/themes.css` ships 27 themes; only four are brand themes. The rest are
editor-inspired (Dracula, Nord, Tokyo Night, Gruvbox, Solarized, ...). That is not
brand drift: a tool people keep open next to their editor for hours benefits from
matching it. `docs/BRAND.md` states the boundary explicitly so the distinction is
not lost again.

---

## 12. Global Chat: the item-12 premise was wrong, and there are two chats

Roadmap item 12 read: *"Decide the fate of the orphaned file-based
`src/lib/server/chatStore.ts` — it has no authentication and violates Class B
condition 2."* Both halves are false, and the error originated in this document
before propagating into ADR-0001 and the roadmap.

**It is not orphaned.** The chain is complete and shipping:

```
ChatPanel.svelte / SidePanel.svelte
  → src/stores/chat.svelte.ts
    → GET/POST /api/chat-v2
      → src/lib/server/chatStore.ts
        → db/chat_messages.json
```

The first audit pass grepped for imports of `chatStore` and found only its own
test. It missed `src/routes/api/chat-v2/+server.ts`, which imports it as
`$lib/server/chatStore` — the alias, not the relative path the grep matched.

**It is not unauthenticated.** Both handlers open with `checkAppAuth(request)`,
and since ADR-0002 that fails closed.

So Cachy ships **two independent Class B chat backends**: the file-based one
behind the side panel, and the SpacetimeDB one behind the Cloud settings tab.
They share no storage, no schema and no UI. Which one survives is a product
decision, so item 12 is reframed rather than executed.

### A regression this uncovered, now fixed

`src/stores/chat.svelte.ts` sent **no `x-app-access-token` header** on either the
poll or the send. Before ADR-0002, `checkAppAuth` failed open when
`APP_ACCESS_TOKEN` was unset, so the side-panel chat worked on any deployment
that had not configured a token — which was all of them, since the variable was
undocumented.

Making auth fail closed therefore broke that chat everywhere. The fix is the same
shape `tradeService.ts` already used: send the header when a token is configured,
omit it otherwise. The route was always meant to be authenticated; the client
simply never held up its end.

### An open question about Class A data

`chat.svelte.ts` computes a **profit factor from `journalState.entries`** and
sends it to the server with every message, so other clients can filter the chat
by trader performance (`minChatProfitFactor`).

The journal is Class A. ADR-0001's third condition says Class B payloads must
carry no Class A data **"auch nicht als Metadaten"** — not even as metadata. A
statistic derived from the journal is exactly that.

**Resolved: removed** (item 12a). Not made opt-in, because the trade was one-sided.
The journal is Class A and ADR-0001 condition 3 forbids Class A data in a Class B
payload even as metadata — but the decisive point is what it bought in return.
The value was computed on the client from the client's own `localStorage` and
accepted by the server verbatim:

```ts
profitFactor: typeof profitFactor === "number" ? profitFactor : undefined,
```

Any client could claim any figure. It was an unverifiable trust signal paid for
with real data, so there was nothing to weigh against the boundary.

Removed end to end: the payload, the server field, the persisted schema, the PF
badge in both chat views, the transcript export, the incoming filter, and the
`minChatProfitFactor` setting that no longer had anything to filter.
`chat.test.ts` now asserts the payload's exact key set — `["clientId", "text"]` —
so re-adding any derived field fails there rather than in review.

### Retention and erasure now exist in the module (item 15a)

`server/spacetimedb/src/index.ts` gained two things:

- a scheduled table firing an hourly sweep that deletes messages older than
  90 days, driven by the database so no caller can skip it;
- `delete_my_messages`, which derives the sender from `ctx.sender` rather than
  from an argument, making erasure self-service and impossible to aim at someone
  else.

**Both typecheck; neither has run.** Publishing needs the SpacetimeDB CLI, which
is not vendored here and is not obtainable from npm — `spacetimedb-cli` returns
404. So `spacetime publish` and `spacetime generate` remain outstanding and need
a machine with SpacetimeDB installed.

The interface for erasure is in place regardless (item 15b): Settings → Cloud has
a "delete my messages" control behind a two-click confirmation. The awkward part
is a deployment state rather than a defect — the reducer is only callable through
bindings that `spacetime generate` produces, and the committed ones predate it.
Hand-writing a generated file would have violated `server/CLAUDE.md` hard
requirement 1 and, worse, could not have been verified here: there is no local
instance to connect to. So the client asks at runtime
(`cloudService.canDeleteMyMessages()`), disables the button when the answer is
no, and names the missing step and who has to take it, rather than failing with
"deleteMyMessages is not a function". `cloudService.erasure.test.ts` covers both
states and the disconnected case.

---

## 13. Verified state after these changes

| Check | Result |
| --- | --- |
| `npm run check` | 1925 files, **0 errors, 0 warnings** |
| `npm test` | **850 passing, 0 failing** (gate suite; wall-clock benchmarks run separately via `npm run test:perf`, 9 passing) |
| `npx eslint .` | **0 errors**, 573 warnings under the CI ratchet |
| `npx semantic-release --dry-run` | Config valid, resolves to "publish from main, develop" |
