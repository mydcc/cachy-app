# Roadmap

The project's first roadmap, written at the point where two months of rapid
prototyping turned into a maintained codebase. It is deliberately ordered by
what unblocks what, not by what is most interesting.

Items are grouped into **Now** (in progress or next), **Next** (agreed, not
started) and **Later** (wanted, not yet specified). Anything without a clear
definition of done belongs in Later.

Status legend: 🟢 done · 🟡 in progress · ⚪ not started

---

## Now

### Engineering foundation

| # | Item | Status |
| --- | --- | --- |
| 1 | Repair the version pipeline (single source, regression test) | 🟢 |
| 2 | semantic-release + commitlint | 🟢 |
| 3 | Install the missing ESLint stack, fix config false positives | 🟢 |
| 4 | Correct README, extract the legacy changelog, add the repo audit | 🟢 |
| 5 | ~~Baseline tag `v0.94.3`~~ — dropped: the first release is 1.0.0, so no anchor tag is needed | 🟢 |
| 6 | Two-branch model: `main` stable, `develop` as `beta` prerelease | 🟢 |
| 7 | ADR process + ADR-0001 defining the Local-First boundary | 🟢 |

Versioning restarts at **1.0.0**. With no tag in the repository,
semantic-release publishes `1.0.0` as its first release by default, so no
baseline tag is required and there is no manual step left. The hand-written
0.9x history stays in `docs/CHANGELOG-legacy.md`.

### Documentation truth pass

| # | Item | Status |
| --- | --- | --- |
| 8 | Align `CLAUDE.md`, README and both whitepapers with ADR-0001 | 🟢 |
| 9 | ~~Audit the rest of the whitepaper against the code~~ — done: all eight chapters checked, every reference resolved, chapter 3 maths now covered by an executable test | 🟢 |
| 10 | ~~Merge `DEPLOY.md` and `DEPLOYMENT.md` into one guide~~ — done: one guide, and both had the `deploy.sh` invocation wrong | 🟢 |
| 11 | ~~Consolidate the four brand/design sources into one canonical doc~~ — done: `docs/BRAND.md`, verified against `src/themes.css` | 🟢 |
| 11a | ~~Feed the in-app changelog from the generated `CHANGELOG.md`~~ — done: the generated releases are substituted into the localized document at render time | 🟢 |

**Item 11 is done.** `docs/BRAND.md` replaces three root-level documents that gave
three different answers. The palette turned out to be real and correctly
implemented — every core, highlight, gradient and light/dark value in
`src/themes.css` matches the designed original — so the canonical document is
written from the code, with the old files' unverifiable parts labelled as intent
rather than fact.

The three had to go rather than be cross-referenced: one was OCR output with
truncated hex values (`#4e21e` for `#4e21e7`), one had empty logo and typography
placeholders, and one described a different website's routes and contradicted
itself on the headline font within twenty lines. Details in
`docs/REPO-AUDIT.md`, section 11. One question is left open for a human:
which headline typeface is actually the brand's.

**Item 11a is done.** The in-app changelog would have frozen at 0.94.3 the moment
semantic-release published its first version, because it rendered a hand-written
copy of the release history. `markdownLoader` now substitutes the generated
`CHANGELOG.md` into the localized document at a `<!-- CHANGELOG_GENERATED -->`
marker, so there is no copy to keep in sync — the generated file is the single
source of truth for releases, and the localized files keep only what a machine
cannot write: the German and English framing, and the 0.9x history.

No build step and no generated files in the repository: `CHANGELOG.md` is
imported with `?raw` and merged at render time. The generated part is English
only, since commit messages are English by project convention; the note above the
marker says so in the reader's language.

**Item 10 is done.** `DEPLOY.md` is merged into `DEPLOYMENT.md`, which every
other document already pointed to. The merge was worth more than tidiness: the
two guides gave three different `deploy.sh` invocations and none of them matched
the script. `DEPLOY.md` documented `./deploy.sh devcachyapp` for staging — the
script only recognises `--beta`, so that command deploys **production**.
`DEPLOYMENT.md` documented a `deploy_prod.sh` that does not exist. Details in
`docs/REPO-AUDIT.md`, section 10.

Item 9 is done. The published risk-engine example verified correct against the
real calculator, and the security chapter turned out to understate the
implementation. But chapter 2 had described a materially simpler application than
exists — no WASM engine, no WebGPU, no SpacetimeDB, no AI SDKs — and chapter 8
would have actively misled a new developer (a `npm run test:unit` script that
does not exist, a verification file that does not exist, the wrong port).
Full findings in `docs/REPO-AUDIT.md`, section 6.

---

## Next

### Global Chat as an optional Class B feature

Kept per ADR-0001, on SpacetimeDB. The integration already exists —
`server/spacetimedb/src/index.ts` with a `send_message` reducer, generated
bindings in `src/lib/spacetimedb/`, and a wired `CloudTab.svelte`. What is
missing is everything around it:

| # | Item | Status |
| --- | --- | --- |
| 12 | ~~Two chat backends ship, not one~~ — decided: SpacetimeDB survives, the file-based one is removed, and the existing chat UI now runs on SpacetimeDB | 🟢 |
| 12a | ~~**Class A leak:** `chat.svelte.ts` sends a profit factor derived from the journal~~ — done: removed end to end, guarded by a payload-shape test | 🟢 |
| 13 | ~~Document how a user obtains a connection token~~ — done: `docs/GLOBAL-CHAT.md` section 3 | 🟢 |
| 14 | ~~Replace the hardcoded `http://127.0.0.1:3000` / `cachy-server` defaults~~ — done: `cloudHost` / `cloudDbName` settings | 🟢 |
| 15 | ~~Message retention and deletion policy~~ — done as policy: `docs/GLOBAL-CHAT.md` section 4 | 🟢 |
| 15a | ~~Enforce the retention policy in the module~~ — done: scheduled 90-day sweep plus self-service erasure. Needs `spacetime publish` + `generate` to go live | 🟢 |
| 15b | ~~Wire `delete_my_messages` into the Cloud tab~~ — done: the control exists and degrades honestly until `spacetime generate` has run | 🟢 |
| 16 | ~~Make the off-by-default state and the four Class B conditions visible in the Cloud tab~~ — done | 🟢 |
| 17 | ~~Behaviour when the server is unreachable~~ — done, with a test that breaks the connection and runs the risk engine | 🟢 |

**Item 12 is decided and done: SpacetimeDB survives.** The file-based backend —
`src/lib/server/chatStore.ts`, `/api/chat-v2` and `db/chat_messages.json` — is
removed, along with the `CHAT_DB_PATH` variable that configured it.

The chat window and side panel stay exactly where they were. Only what stands
behind them changed: `src/stores/chat.svelte.ts` is now an adapter over
`cloudService`, presenting the same `ChatMessage` shape the UI already consumed,
so `SidePanel`, `ChatPanel`, `AssistantView` and the chat window needed no
changes of their own.

Two things the swap required. The connection token became a persisted setting
(`cloudToken`, in `SENSITIVE_KEYS` so it is encrypted with the master password
like every other credential) — it previously lived in component state, which
would have limited the chat to the settings tab. And `cloudService` now captures
the connection identity in `onConnect`, shortened the same way the module
shortens it, which is how the UI tells "me" from everyone else.

Item 12's original premise was wrong and is worth recording: it described
`chatStore.ts` as orphaned and unauthenticated. It was neither — the first audit
pass grepped for the relative import path and missed the `$lib` alias.

Fixing this uncovered a regression: `chat.svelte.ts` never sent the
`x-app-access-token` header, so making auth fail closed (ADR-0002) broke the
side-panel chat on every deployment. Fixed here.

**Items 13–17 are done** for the SpacetimeDB path, which is unaffected by the
item-12 decision. `docs/GLOBAL-CHAT.md` is the operator's guide: what is stored
(three fields), how a token is issued (by the module operator — there is no
issuance path in this repository, and that is stated plainly rather than papered
over), the retention policy, and the offline guarantee. The host and module name
moved out of `cloudService.ts` into settings, the Cloud tab now states the four
Class B conditions and its off-by-default state, and
`cloudService.offline.test.ts` proves a dead chat server cannot take the risk
engine with it.

**Item 12a is done — the profit factor is gone.** It was removed rather than
made opt-in, because it cost real data and bought nothing:

- The journal is Class A. ADR-0001 condition 3 forbids Class A data in a Class B
  payload *even as metadata*, and a statistic computed over every trade the user
  has recorded is exactly that.
- The value was computed on the client from the client's own `localStorage` and
  accepted by the server verbatim (`typeof profitFactor === "number"`), so any
  client could claim any figure. It was an unverifiable trust signal.

Removed end to end: the payload, the server field, the stored schema, the PF
badge in both chat views, the transcript export, the incoming filter, and the now
dead `minChatProfitFactor` setting with its i18n keys. `chat.test.ts` asserts the
payload's exact key set, so re-adding any derived field fails there. Only message
text and an opaque client ID leave the device now.

**Item 15a is done.** `server/spacetimedb/src/index.ts` gained a scheduled table
that fires an hourly sweep deleting messages older than 90 days, and
`delete_my_messages`, which derives the sender from `ctx.sender` rather than from
an argument — so erasure is self-service and nobody can erase anyone else's
messages. Both typecheck; neither has run against a live instance, because
publishing needs the SpacetimeDB CLI. `spacetime publish` and `spacetime generate`
are required before the erasure reducer is callable from the client, which is
item 15b.

**Item 15b is done.** Settings → Cloud has a "delete my messages" control behind
a two-click confirmation. The interesting part is what it does when it cannot
work: the reducer is only callable through bindings that `spacetime generate`
produces, and the ones committed here predate it. Hand-editing generated files is
forbidden by `server/CLAUDE.md`, and there is no SpacetimeDB CLI in this
environment to regenerate them — so the client asks at runtime whether the
reducer exists, disables the button when it does not, and names the missing step
and who has to take it. `cloudService.erasure.test.ts` covers both states plus
the disconnected case.

That leaves the CLI steps as the only thing outstanding, and they need a machine
with SpacetimeDB installed: `spacetime publish`, then `spacetime generate`. After
that the button works with no further change.

**Item 21 — first pass done, 1315 → 1124.** The mechanical categories are
exhausted; what is left needs judgement, so the method matters more than the
number:

| Category | Was | Now | How |
| --- | --- | --- | --- |
| Unused imports | 140 | 14 | Removed. Pure dead weight, no behaviour to change. |
| Unused `catch` bindings | 65 | 3 | `catch (e)` → `catch` — the ES2019 optional binding, so the binding is gone rather than renamed to be ignored. |
| Unused locals / params / other | 176 | 174 | Two verified dead leftovers removed; the rest need reading, one at a time. |
| `no-explicit-any` | 934 | 933 | Untouched. Needs real types, file by file. |

Nothing was suppressed: no `eslint-disable`, no ignore patterns added to the
config, no rule relaxed. Every warning that went away did so because the code it
pointed at is gone.

**The remaining work, in the order it is worth doing:**

1. **`no-unused-vars`, 191 left.** Read each one. An "assigned but never used"
   local is sometimes a leftover and sometimes a bug where a computed value was
   meant to be used — the two look identical to the linter. Two were checked
   during this pass: `colorUp` in `EqualizerEngine` and `RaindropsEngine`, both
   superseded by inline recomputation, both removed.
2. **`no-explicit-any`, 933 left.** Highest count, lowest mechanical content.
   Concentrated in `bitunixWs.ts` (36), `market.svelte.ts` (27) and
   `orders/+server.ts` (19) — the exchange and market-data paths, where a wrong
   type is a money bug, so this is the part to do slowly and with tests.
3. Only when both reach zero: flip the rules from `warn` to `error` and drop the
   ratchet.

Lower the ceiling in `.github/workflows/audit.yml` on every pass, so the backlog
can only shrink.

**Item 22 is done, and it was not just a `git rm --cached`.** The two files had
drifted in both directions:

- The committed `.deploy.conf` carried `STABLE_WORK_DIR` and `BETA_WORK_DIR`,
  which **nothing in `deploy.sh` reads**, and `PROJECT_NAME` was equally inert in
  the template.
- It was missing `HEALTH_CHECK_URL` and `MAX_BACKUPS`, working only because the
  script has fallbacks for both.
- Its `STABLE_START_COMMAND` pointed at a different script than the template's
  (`cachyapp.sh` vs `prodcachyapp.sh`) — so the committed file was the live
  production configuration of cachy.app, in a public repository. No secrets, but
  it published internal server paths.
- The template contained a **duplicated `HEALTH_CHECK_URL` block**, pasted twice.

The template is rewritten to list exactly the keys the script reads, with
placeholder paths instead of real ones. `.deploy.conf` is untracked and ignored.

The part that needed care is the migration: `deploy.sh` runs
`git reset --hard HEAD && git pull`, so the deploy that pulls this change deletes
the live config from the server. That run still succeeds, because the config was
sourced before the pull — **the next one fails**, regenerating placeholders and
rolling back on the health check. A failure one deploy removed from its cause is
exactly the kind that costs an afternoon, so `DEPLOYMENT.md` now opens the
deployment section with the backup step.

### Code health

| # | Item | Status |
| --- | --- | --- |
| 18 | ~~Fix the pre-existing test failures~~ — done: **28 → 0**. The gate suite passes (821 tests) and CI runs all of it instead of three hand-picked files. Wall-clock benchmarks moved to a non-blocking job — see below | 🟢 |
| 19 | ~~Attach `cause` to rethrown errors~~ — done: all 10 sites in `apiService.ts`, `tradeService.ts`, `news/+server.ts` and `storageUtils.ts` now chain the original failure | 🟢 |
| 20 | ~~Burn down the 112 ESLint errors, then make lint a required CI check~~ — done: 0 errors, lint is now a required check | 🟢 |
| 21 | Burn down the remaining 1124 `no-explicit-any` / `no-unused-vars` warnings, lowering the CI ceiling as you go, then restore both rules to `error` | 🟡 |
| 22 | ~~Resolve `.deploy.conf` being committed alongside its own `.example`~~ — done: untracked and ignored, template corrected, migration documented | 🟢 |
| 23 | Deduplicate `chartpatterns.html` (root and `info/` copies differ — decide which is current) | ⚪ |
| 24 | Group and document the ~20 ad-hoc scripts in `scripts/`, `verification/`, `plans/` | ⚪ |
| 24a | ~~Remove the `VITE_*_API_KEY` defaults in `settings.svelte.ts`~~ — done: the fallbacks are gone and two tests guard against their return | 🟢 |
| 24b | ~~Audit remaining `env.*` reads against `.env.example`~~ — done: audited, `PORT` added, and a test now enforces it | 🟢 |
| 24c | ~~Parse exchange responses with `safeJsonParse`, not `response.json()`~~ — done: all 11 exchange sites go through `readExchangeJson`, proven end-to-end | 🟢 |
| 24d | Consider the same for `external/cmc` — CMC returns prices as JSON numbers. Display and sentiment only, no order handling, so lower priority than 24c was | ⚪ |
| 24e | **Decide the fate of the committed imgbb API key** — `defaultSettings.imgbbApiKey` holds a real 32-character key, so every user shares one account. Needs a decision, not a deletion: removing it breaks screenshot upload by default, and the key is in git history either way, so it should be rotated at imgbb regardless | ⚪ |
| 24f | Add a concurrency lock to `deploy.sh` — two simultaneous runs would race on the `.deploy_work` shadow directory and on the build swap. The old docs claimed a lock existed; it never did | ⚪ |

Item 20 is done: lint is a required check at 0 errors, with a warning ratchet so
the backlog cannot grow. The ratchet has already earned its place: work on item 18
pushed the count to 1371 and CI rejected it until the four new `as any` casts were
typed properly.

**Item 18 is done.** All 28 failures are fixed, `npm test` exits 0 with 830
passing tests, and the CI job that previously ran three hand-picked files now runs
the whole suite — so a red run finally means the pull request broke something.

Enabling the full suite in CI immediately exposed a second problem worth
recording: `engine_benchmark.test.ts` asserts that processing 5x the data takes
under 8x the time. It passed locally at 4.4x and failed CI at 10.9x — because it
compares a ~5ms measurement against a ~24ms one, where a single GC pause shifts
the ratio by more than half. Four files carrying wall-clock or heap thresholds are
now excluded from `npm test` and run via `npm run test:perf` in a
`continue-on-error` CI job. `load_testing.test.ts` stays in the gate: it asserts
shape and finiteness, not timing.

That job then kept reporting red on every run, so both offenders were fixed
rather than left to cry wolf:

- **The scaling test** (9.1x against a limit of 8x) timed a single pass over 1k
  candles as its baseline. Both sides are now the median of five runs. The
  threshold and the intent are unchanged — quadratic behaviour would still show
  as ~25x — but the number now means what it claims. The same file's budget test
  shows why single-shot was hopeless: five consecutive runs over 100 candles came
  out as `[3.0, 2.9, 7.0, 2.9, 2.6]` ms, a 2.7x spread with nothing changing.
- **The memory test** (16 MB against a limit of 10 MB) was worse than noisy: it
  was never measuring what it claimed. Its `if (global.gc) global.gc()` calls
  were dead code, because `global.gc` only exists under `node --expose-gc`, which
  nothing passed. So it compared two arbitrary points in V8's allocation cycle
  and called the difference a leak. `vitest.perf.config.ts` now passes the flag
  (a top-level `execArgv` option in vitest 4 — under `poolOptions.<pool>.execArgv`
  it is silently ignored), and the test skips itself if the flag is ever absent
  again rather than producing a verdict it cannot support.

With a real collection forced, actual growth is **0.35 MB** over 50 iterations
and **0.00 MB** for the buffer pool, against thresholds of 10 and 15 MB. There
was never a leak. Worth noting for later: those thresholds now have ~30x
headroom, so they would not catch a moderate regression — tightening them is a
separate call, and only worth making now that the measurement is real.

Five of the fixes were production bugs rather than test problems: an invalid date
rendering as "just now", fail-open API auth, an unbounded kline backfill loop, an
ineffective news concurrency guard, and moving averages reporting 0 instead of
being omitted when there is insufficient history. The remaining 23 were stale or
incomplete test setups — most often a mock that had drifted from the interface it
stood in for, which is why they failed while the code was correct.

**Item 24a is done.** The AI key fields no longer fall back to
`import.meta.env.VITE_*_API_KEY`, so no production build can inline the
operator's keys into the client bundle. The convenience that fallback bought was
minor — a key entered once in Settings → AI persists in that browser — against a
leak that would be served to every visitor. `settings.security.test.ts` stubs the
three variables and asserts a fresh store ignores them; restoring one fallback
makes the tests fail, so they are real guards.

Removing it surfaced item 24e: `defaultSettings.imgbbApiKey` is not empty like
every other credential but holds a real key, shared by every user of every build.
That one is a decision rather than a deletion — see `docs/REPO-AUDIT.md`,
section 7.

**Item 24b is done.** Seven variables are read by application code; six were
already documented and `PORT` was not. The lasting part is
`src/tests/env_documentation.test.ts`, which scans the source for
`process.env.X` and `$env` reads and fails if any of them is missing from
`.env.example` — the drift that produced ADR-0002 cannot repeat silently. It
found `PORT` on its first run.

**Item 24c is done.** All 11 exchange-response sites — `tpsl` (2), `balance` (2),
`positions` (2), `sync` (1), `sync/orders`, `sync/order-detail`,
`sync/positions-pending`, `sync/positions-history` — now read the body through
`readExchangeJson` (`src/utils/server/exchangeResponse.ts`), which is
`safeJsonParse(await response.text())`. `klines/+server.ts` already did this; the
helper gives the other routes one named place stating why.

The bug was real and reproducible end to end, not theoretical:

```
1234567890123456789  ->  response.json()      ->  1234567890123456800
1234567890123456789  ->  readExchangeJson()   ->  1234567890123456789
```

`src/routes/api/sync/orders/security.test.ts` drives the actual route with a
19-digit order ID and asserts the rounded form appears nowhere in the payload.
Verified as a genuine guard rather than a tautology: reverting that one route to
`response.json()` makes the test fail, restoring it makes it pass.

Why the change is safe for arithmetic: `safeJsonParse` only quotes numeric
literals of **15 or more characters**. Millisecond timestamps are 13 digits and
status codes are tiny, so both keep their numeric type — `exchangeResponse.test.ts`
asserts this explicitly. Only the values that were already being corrupted change
type, and the schemas in `apiSchemas.ts` accept `string | number` for them.

Two route tests failed on the change because their fetch mocks offered only
`json()`. Same mock drift as item 18: fixed by giving them `text()` as a real
Response has.

---

## Later

| # | Item |
| --- | --- |
| 25 | Broader SpacetimeDB use beyond chat — any such feature needs its own ADR and must satisfy the Class B conditions; Class A data stays local |
| 26 | Publish `/docs` to Confluence as a read-only mirror, repo stays the source of truth |
| 27 | Mirror this roadmap as Jira epics for tracking |
| 28 | Mobile native adaptation (claimed as "Phase 2" in the whitepaper — unverified against any actual plan) |
| 29 | Institutional features (whitepaper "Phase 3" — same caveat) |

Items 28 and 29 are listed because the whitepaper already promises them to
readers. They are recorded here as unspecified rather than silently dropped;
item 9 should determine whether they are real commitments.

---

## Explicitly not planned

- **Server persistence of Class A data** — journal, settings, API keys, presets
  and notes stay on the device. See ADR-0001.
- **Making any core function require a server.** The calculator, journal and risk
  management must work with the network down.
