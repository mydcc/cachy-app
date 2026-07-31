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

**Item 23 is done.** The two copies were not near-duplicates to pick between:
`info/chartpatterns.html` documents **56 chart patterns**, the root copy **4**.
Commit `b9931450` added 6343 lines to the `info/` copy alone and never touched
the other, so the root file had been an abandoned early draft since then.

It also had no assets: `info/chartpatterns.html` references a `chartpatterns_files`
sidecar directory that exists only under `info/`, alongside its sibling
`candlestick.html`. Nothing anywhere in the repository linked to the root copy.
Deleted — 226 KB, and one fewer file at the top level pretending to be
documentation.

**Item 24f is done.** `deploy.sh` takes a `flock` on `.deploy.lock` before the
first mutating step. A second run refuses to start rather than interleaving a
branch checkout, a stash, a pull, an rsync into `.deploy_work` and a build swap
with the first one's.

`flock` rather than a PID file: the kernel owns it, so nothing stale survives a
SIGKILL or a power cut — no trap to get right. Proven rather than assumed, and
the test corrected an assumption: a second run **is** refused while the first
holds the lock, the lock **is** free once it finishes, but after `kill -9` it was
still held. The cause is that children inherit the descriptor, and the `sleep`
standing in for the build was still alive.

That behaviour is right for this script and the comment now says so: the real
child is the background npm build, which keeps writing into `.deploy_work` after
its parent dies. A second deployment rsyncing into that directory is exactly the
race the lock exists to prevent, so the lock should outlive the script for as
long as the work does.

`.deploy.lock`, `.deploy_work/` and `build_old_*/` are gitignored — verified by
creating the directories and checking the patterns actually match, since a
trailing-slash pattern silently matches nothing when the directory is absent.

**Item 24d is closed as a decision not to change it.** The item asked whether
`external/cmc` should read through `readExchangeJson` like the exchange routes.
It should not, and the reason is specific rather than a shrug:

`safeJsonParse` quotes numeric literals of 15 or more characters. The total
crypto market cap is ~16 characters with decimals (`1900000000000.12`), so it
would arrive as a **string** — while `CmcGlobalMetrics.total_market_cap` in
`cmcService.ts` declares `number` and `ai.svelte.ts:521` passes it straight into
the AI context. TypeScript would not catch the mismatch, because the body is
`any` on both sides of the change. Small-cap prices like `0.00000012345678` are
16 characters too, and would convert as well.

Against that: nothing here reaches an order. CMC feeds the market overview and
the AI context, never a position size, and precision past the 17th significant
digit of a market cap is meaningless. So the change would introduce a real
runtime/type mismatch to solve a problem that does not exist on this path.

The reasoning lives in a comment at the call site, not only here — the next
person to notice the inconsistency will be reading that file, not this one. It
also says what to do if a CMC value ever does feed a calculation: type it
`string | number` and run it through `Decimal`, rather than switching the one
line.

**Item 24 is done.** `scripts/README.md` indexes all of it, grouped by the only
question that matters when you open the directory: **does this run on its own, or
did someone write it for one afternoon?**

Six scripts are wired into automation — `build_wasm.sh` via `package.json`,
`lint-i18n.js` and the three translation scripts via CI, `discord-notify.sh` via
`deploy.sh`. Breaking one of those breaks a build, a deploy or a check. Eight
more are real manual tools with a stated reason to reach for them.

Three findings worth recording:

- **`pre-commit.sh` and `husky-pre-commit.sh` are not installed.** There is no
  `.husky/` directory and husky is not a dependency, so neither hook has ever
  run. The checks they perform now live in `translation-check.yml`, where
  `--no-verify` cannot skip them. Kept, because installing a local hook is the
  developer's choice, and `pre-commit.sh` documents its own installation.
- **`render_build.sh` targets Render.com**, while the project deploys to aaPanel
  through `deploy.sh`. Nothing references it.
- **`scripts/maintenance/` holds four one-shot patch scripts** that performed a
  specific refactor once. They are not idempotent. The README says plainly not to
  run one to find out what it does — which is exactly what an undocumented
  directory of `fix_*.py` files invites.

Descriptions were read out of the scripts, not guessed from filenames, and one
was corrected in the process: `detect_leaks.cjs` checks **timer** cleanup
specifically (`setInterval` without `clearInterval`), not listeners or
subscriptions in general.

**Item 21, second pass: 1124 → 1107 — and it found two real bugs.** This is the
pass the first one predicted: an "assigned but never used" warning looks the
same whether it is a leftover or a value someone forgot to use, and only reading
the code tells them apart. `bitunixWs.ts` had 17 of them, and two were the second
kind.

**`connectPrivate(force)` accepted the parameter and ignored it.** Its sibling
`connectPublic(force)` uses it in three places, including "when already
connected, do not return early — rebuild". `connectPrivate` returned
unconditionally, so `connect(force: true)` rebuilt the public socket and silently
left the **authenticated** one — the stream carrying order and position updates —
exactly as it was. A forced reconnect never reached it.

**The depth handler validated the payload and then discarded the result.** It
bound `bids` / `asks` from the Zod-parsed data, whose `SafeString` transform
exists to keep orderbook levels as strings, and then passed the raw `data.b` /
`data.a` to `marketState`. The comment directly above said the transform had
already normalised them. So a level the exchange sent as a number arrived as a
number while the declared type said string.

Both are covered by `bitunixWs_force_reconnect.test.ts`, verified as genuine
guards: reverting each fix fails its test, restoring it passes.

Also removed from the same file: a `JSON.stringify` of **every inbound message**
whose only consumer was an unused length — a full serialisation per tick on a
market-data socket, discarded. Plus six dead imports and a dead interface.

Two `ws.onerror` handlers were left deliberately silent, only losing their unused
parameter. The private one carries a comment showing the logging was commented
out on purpose; `onclose` fires straight after and drives the reconnect. Not a
place to "fix" by restoring noise.

**Item 21, third pass: 1107 → 1095**, starting on `no-explicit-any` in
`market.svelte.ts`. Unlike the earlier passes this one found no bug, and that is
worth stating rather than dressing up.

What it did produce is a named type. `RawNumeric = string | number | Decimal |
null | undefined` is the honest input for anything coercing exchange data, and it
documents *why* the union exists: `safeJsonParse` quotes literals of 15+
characters, so a price is a string or a number depending on its length alone.
Three coercion helpers now say that instead of `any`.

Timer handles moved from `any` to `ReturnType<typeof setInterval>` — the handle
is a number in the browser and a `Timeout` under Node, which is what the `any`
was really covering — and a duck-typed cleanup that cast to `any` twice now names
its union.

**Two claims in this pass had to be walked back, which is the part worth
recording.** Both times the code change was sound and the *story about it* was
not, and both times the test written to prove the story passed with the change
reverted — which is the only reason it was caught.

1. Typing `updateDecimal`'s parameter made the typechecker reject
   `new Decimal(undefined)`, so a null guard was added. First recorded as a
   latent crash; no call path reaching it was ever demonstrated. The guard stays
   because the type requires it, the claim does not.
2. A second `updateDepth` call site in `bitunixWs.ts` also passed raw levels, and
   was recorded as "the same defect at a second site". It is narrower than that:
   the fast path handles `depth_book5` whenever the payload parses, so the
   fallback only runs for payloads that failed validation — which then fail the
   new check too, and the update is skipped. The change makes the two paths
   consistent (depth is either validated or not applied) rather than fixing a
   demonstrated leak.

Both comments in the code now say this. The lesson is cheap to state and easy to
forget: **a fix that compiles is not a bug that existed.** Reachability has to be
shown, and the way to show it is a test that fails without the fix.

**Passes four and five: 1095 → 1029.** Two different kinds of work, worth
separating because only one of them scales.

*Mechanical, and it scaled:* 58 occurrences of `(fn as any).mockReturnValueOnce()`
across 17 test files became `vi.mocked(fn).mockReturnValueOnce()`. Not a
suppression — `vi.mocked` is vitest's own typed accessor, so the mock API is
checked against the real signature instead of reached through a cast that turns
checking off. Scriptable and safe: a wrongly rewritten mock does not compile, and
a mock pointed at the wrong function fails its test.

*Per-file, and it does not:* `src/routes/api/orders/+server.ts` went from 16 to 8
by naming one thing — an `ExchangeError` interface for the `code` and `details`
fields this file attaches at throw sites and reads back in the handler. That
single type removed `any` from six places. Plus `Decimal.Value` for `safeDecimal`
(which is exactly `string | number | Decimal`) and one index-signature cast in
`cleanPayload` instead of one per property access.

**What remains does not have a shortcut.** Measured across the whole tree:

| Shape | Count |
| --- | --- |
| `x: any` parameters | 219 |
| `(x as any).prop` | 113 |
| `: any[]` | 50 |
| `as any;` | 47 |
| `let x: any` | 41 |
| `Record<string, any>` | 20 |

Every one needs the actual type at that spot. 401 of the remaining warnings are
in tests and scripts, 628 in production code. At roughly 8–60 per file this is
several sessions of work, not one — and the exchange and market-data files should
be done slowly, since that is where a wrong type is a money bug.

**Where passes three to seven left it: 1107 → 978.** The method that works is
now clear enough to state, because it produced every one of those passes:

> Find the file with the most warnings, look for the **one thing** being cast
> around repeatedly, and name it. `ExchangeError` removed six casts from the
> orders route; `MockConnection` removed fifteen from `networkMonitor.test.ts`;
> `WsInternals` removed fifteen more from the two leak tests. A file rarely has
> N different problems — it usually has one, N times.

**Next up, and why they are in this order:**

1. `src/services/bitunixWs.ts` (16) and `src/services/wasmCalculator.ts` (14) —
   production, exchange path. Worth doing slowly; the earlier pass on this file
   found two real bugs.
2. `src/services/storageService.test.ts` (10 left) and the other test files —
   self-contained, and a wrong type fails loudly.
3. `src/lib/physics/StressLogic.ts` (17) — **deliberately last.** Ammo.js ships
   no types, so this needs a real ambient declaration for the ~10 constructors
   and 4 world methods actually used. It is also the hardest to verify from a
   terminal: it needs a browser and WASM. A hasty declaration here would look
   like progress and not be any.

**Pass nine: `bitunixWs.ts` is now free of `any`, 966 → 950.** This closes the
file the item-21 write-up singled out as "worth doing slowly" — it is where the
force-reconnect and depth-validation bugs were found, and every remaining site
was a real payload shape, not boilerplate.

- `isTradeData` took `d: any` and returned a type predicate promising `{ p: any,
  v: any, s: any, t: any }` — a type guard that told the compiler nothing.
  Retyped to `(d: unknown): d is SafeTradeShape`, the actual two fields it
  checks.
- Two identical inline `safeString` closures (price and ticker handlers, ~15
  lines each, differing only in one log string) became one shared method.
  Duplication was the actual defect here; `any` was just how it was spelled.
- Four sites handed a raw pre-validation WebSocket item to sinks that already
  accept `any` (`accountState.*FromWs`, `mapToOMSPosition/Order`). The position
  handler validates with `BitunixPositionSchema.safeParse` and then uses the raw
  item **regardless of the result** — worth flagging, but not a bug: a comment
  states it as deliberate ("best effort for positions, IDs are less critical
  than Orders"). Typed as `Record<string, unknown>`, the honest shape, not
  papered over.
- `bucketCandles: any[]` building a synthetic kline from `marketState.data`
  became `Kline[]`, and the `synthKline as any` three lines later came off with
  it — the object satisfied `Kline` once the compiler could check it.
- `sendPublicMessage(payload: any)` only ever reaches `JSON.stringify`; `unknown`
  says that honestly.

All 28 tests across the file's six spec files still pass. Nothing here changed
behaviour except the duplication removal, which is byte-for-byte the same
computation in one place instead of two.

**Pass ten: `activeTechnicalsManager.svelte.ts`, 950 → 939.** Three things,
found by typing rather than assumed:

- Two `requestIdleCallback` call sites and the polyfill inside
  `getRequestIdleCallback` all cast their timer handle `as any`. The actual
  cause was a return type declared as plain `number`, when the polyfill
  branch returns whatever `setTimeout` returns — a `Timeout` object under
  Node. Widened the declared return type to
  `ReturnType<typeof setTimeout> | number` and the `throttles` map alongside
  it; `clearTimeout` already accepted both, so nothing downstream changed.
- `isTechnicalsEqual(a: any, b: any)` and `handleResult(..., marketData: any,
  result: any)` compare and consume real, already-defined types
  (`TechnicalsData`, `MarketData`) that simply were not imported into this
  file.
- `injectRealtimePrice` took a `symbol` parameter it never read — removed at
  the one call site — and assigned a local `close` that was never used
  because the code below it reads `price` directly. Both were dead, not
  disguised bugs; removed.

No production code path changed shape; `npm test` stays at 850 passing.

**Pass eleven: `syncService.ts`, 939 → 928.** The repeated cast was the raw
Bitunix API payload — positions and orders come back from
`/api/sync/positions-history`, `/api/sync/positions-pending`, and
`/api/sync/orders` as untyped JSON, and every downstream `.map`/`.filter`
callback re-declared its parameter `any` rather than share a shape:

- Named `RawSyncPosition` and `RawSyncOrder` for the two payload shapes
  actually read in this file (a strict subset of `types/bitunix.ts`'s
  `BitunixOrder`, which doesn't cover the plan-order `stopPrice`/
  `triggerPrice` fields this file needs) — 8 `any` parameters and one
  `Record<string, any[]>` SL-candidate map replaced by these two types plus
  the existing `Kline` type for the two kline-array callbacks.
- Removed an unused `batchIndex`/`currentIndex` pair — the progress index was
  computed and never read.
- `catch (e: any)` became `catch (e)` with the standard
  `e instanceof Error ? e.message : String(e)` narrowing. That, in turn,
  surfaced a real typing gap in the `_()` translator: the code passes a
  runtime-checked dynamic key (`message.startsWith("apiErrors.") ? message :
  ...`) that the `TranslationKey` string-union can't express statically.
  Resolved with `as TranslationKey` at that one call site, matching the same
  documented pattern already used for dynamic keys in `VisualsTab.svelte` and
  `CalculationSettings.svelte` — not a new workaround, the established one.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twelve: `ai.svelte.ts`, 928 → 917.** The repeated cast was
`gatherContext()`'s return value — the object assembled from portfolio
stats, market depth, technicals, CMC data and news, exposed to the UI as
`aiState.lastContext` for the context-gathered indicators, was `any` at
every one of its 8 use sites in this file (the field itself, a WS depth
tuple used four times, a position mapper, a pending-action queue, and two
`catch (e: any)` blocks).

- Named `AiContext` for the shape `gatherContext()` actually returns, with
  all fields optional because the 5-second-timeout fallback path returns
  only `{ error }`. `marketData.depth.bids`/`.asks` are the existing
  `[string, string]` tuple type from `MarketData`, not `any`; `openPositions`
  reuses the existing `Position` type from `account.svelte.ts`.
- Giving `lastContext` a real type instead of `any` turned a silent mismatch
  into a compile error: `AiPanel.svelte` and `AssistantView.svelte` read
  `contextData?.cmc?.global` and `contextData?.news` to light up two "context
  gathered" indicator dots, but `gatherContext()` has never returned fields
  named `cmc` or `news` — it returns `marketIntelligence` and `latestNews`.
  Unlike the two reachability claims from pass one and pass nine, this one
  needed no revert-test: the mismatch is a static fact about the object
  literal's shape, provable by reading the return statement, not a claim
  about which runtime path executes. Both indicators have silently shown
  "not gathered" regardless of whether CMC/news context was actually
  fetched, since whichever commit last renamed those two fields. Fixed at
  both read sites to the field names `gatherContext()` actually produces.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirteen: `bitgetWs.ts`, 917 → 907.** The repeated cast was the raw
private-channel WS payload — the same class of problem as `bitunixWs.ts` in
pass nine, but this pass surfaced something bigger than a cast.

- `BitgetLoginResponse`, `BitgetCandleTuple`, `BitgetWSOrderData`,
  `BitgetWSPositionData` replace 6 `any` casts across the login check, the
  candle mapper, and the order/position forEach callbacks.
- Two unused imports (`isAllowedBitgetChannel`, `validateBitgetSymbol`)
  removed — `subscribe()`/`unsubscribe()` already gate on
  `getBitgetChannel()`'s allow-list, so these were never called. One dead
  local (`timeSince`, computed and never read — the staleness check that
  presumably used it is gone, per the "No autonomous reconnections here"
  comment two lines below) and one unused `onerror` parameter removed.
- **Found, documented, not fixed here — `docs/TODO.md` item 3.** Naming the
  order/position payload types made two things visible that a plain `any`
  had been hiding: `accountState.updatePositionFromWs`/`.updateOrderFromWs`
  (shared with Bitunix) read field names — `qty`, `positionId`,
  `orderStatus`, `dealAmount`, `ctime` — that Bitget's handler never sends
  (it sends `size`, `status`, `filled`, no position id, no create time at
  all), and the login-ack check three lines above passes its input through
  a zod schema that requires `action` and doesn't declare `event`/`code`,
  so a real login acknowledgement may never reach the check meant to read
  it. Both are provable by reading the two sides of each call side by side
  — no revert-test needed, the mismatch is a static fact about the object
  shapes — but neither is confirmed against a live Bitget account, and a
  fix this size needs its own test and its own commit, not a rider on a
  lint pass. Left as `any`-free but behaviourally unchanged; see the TODO
  entry for what "fixed" would require.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass fourteen: `technicalsService.ts`, 907 → 897.** The repeated cast was
`Kline[]`/`Kline` again — every worker-routing method (`calculateTechnicals`,
`calculateWithWorker`, `initializeTechnicals`, `updateTechnicals`,
`calculateTechnicalsInline`) re-declared its kline parameter `any` even
though the file already imports `Kline` from `technicalsTypes` for its own
return type.

- 5 `Kline[]`/`Kline` parameters, one `IndicatorSettings` parameter (was
  `any`, already imported and used by every sibling method), one
  `(reason?: unknown)` promise-reject type, and one named
  `{ type: string; payload: Record<string, unknown> }` for
  `postMessage()`'s argument — 8 `any` sites total.
- Removed `indicatorsCache`, a `WeakMap` declared next to `settingsCache`
  and never read anywhere in the file — a leftover from whatever used to
  cache indicator results separately from settings.
- Typing `generateCacheKey`'s `settings` parameter surfaced one real type
  error: `sPart`'s type was inferred `string | undefined` from
  `settings?._cachedJson`, then reassigned a `string | null` on the next
  branch. `null` was never a semantically meaningful signal here (the
  three subsequent checks only ever ask "is this falsy", never distinguish
  the two) — changed the `: null` fallback to `: undefined` to match.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass fifteen: `src/lib/server/logger.ts`, 897 → 887.** The repeated cast
was arbitrary log payload data — `sanitize()`, `emitLog()`, and all four
public log methods (`info`/`warn`/`error`/`debug`) took `data?: any` and
`sanitize` also returned `any`, even though the function's whole job is to
recursively walk a value of genuinely unknown shape and redact sensitive
keys — the textbook case for `unknown`, not `any`.

- 9 `any` sites became `unknown`, including `LogEntry.data`. One spot
  needed an explicit narrowing cast: inside the `typeof data === "object"`
  branch, `unknown` doesn't support `for...in` plus indexed access the way
  `any` silently did, so `data as Record<string, unknown>` names what the
  branch already assumed.
- Dropped an unused trailing `val` parameter from one regex `.replace()`
  callback (the other, five lines down, already destructures the value it
  needs under a different name — this one just never used it).

No behavior change: every call site already passed concrete values, never
relied on `any`'s implicit coercion.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass sixteen: `account.svelte.ts`, 887 → 877.** The repeated cast was the
raw WS position/order/balance payload forwarded from both exchange
services into the three `updateXFromWs` methods.

- `RawWsPosition`, `RawWsOrder`, `RawWsBalance` (exported) replace 10 `any`
  sites — the three `updateXFromWs` methods, their three `*Batch` wrappers,
  and the `listeners`/`notifyTimer` compatibility fields, the latter two
  now `Set<(value: AccountSnapshot) => void>` and
  `ReturnType<typeof setTimeout> | null`.
- Hoisted the `safeDecimal` helper, defined identically inline in both
  `updatePositionFromWs` and `updateOrderFromWs`, to module scope instead
  of duplicating it.
- Typing `data` from `any` to a real (if all-optional) interface turned
  four previously-silent assignments into real type errors:
  `Position.side: "long" | "short"` and `OpenOrder.side/type` are string
  literal unions, but the values assigned to them are `.toLowerCase()`
  results typed as plain `string`. This was already true before — `any`
  just hid it. Cast at the assignment (`as "long" | "short"`, etc.)
  rather than widening the `Position`/`OpenOrder` interfaces, since this
  is exchange data whose values are runtime-trusted, not statically
  provable, and widening those two interfaces would ripple into every
  other place they're read across the app.
- **This is the same pair of functions documented in pass thirteen's TODO
  entry.** Typing them here made the mismatch appear a second time, now as
  a compile error at `bitgetWs.ts`'s two call sites (excess/missing
  properties against `RawWsOrder`/`RawWsPosition`) rather than a silent
  runtime no-op. Preserved the current (buggy) behavior with an explicit
  `as RawWsOrder`/`as RawWsPosition` cast and a comment at each site,
  rather than fixing the field names as a rider on this pass — same
  reasoning as pass thirteen: a live-trading correctness fix needs its own
  test, not a drive-by inside item 21.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass seventeen: `market.svelte.ts`, 877 → 867.** A second pass over this
file (the first, in an earlier session, introduced `RawNumeric`); this one
cleared the 10 warnings that pass left behind.

- `RawKline`, `RawPriceUpdate`, `RawTickerUpdate`, `RawDepthUpdate`,
  `RawKlineWsMessage` — five named shapes for the raw WS payloads
  `pendingKlineUpdates`, `applyUpdate`, `updateSymbolKlines`/
  `applySymbolKlines`, and the four legacy `updateX` methods actually
  receive, replacing 8 `any` sites.
- `applyUpdate`'s `partial` parameter was `any` despite an exact-fit type
  already existing two methods away: `MarketUpdatePayload`. Using it
  surfaced two real gaps in that type for object-shaped fields — its
  mapped type adds `| string | number | null` to *every* `MarketData`
  field uniformly, including `depth` and `technicals`, which are never
  sensibly a string or number. Narrowed with `typeof === "object"` checks
  at the two read sites rather than special-casing `MarketUpdatePayload`
  itself, which is used broadly enough that changing its shape risked
  side effects outside this file.
- Five `new Decimal(k.field)` calls and one `new Decimal(data.change)` cast
  their `RawNumeric` argument `as Decimal.Value` rather than adding a new
  null guard — `RawNumeric` includes `null`/`undefined`, which the prior
  `any` silently let through to `new Decimal(...)` unchanged. Preserves
  the exact prior behavior (including the fact that it can still throw)
  instead of quietly changing what happens on a null/undefined field.
- Removed one unused local (`previousTimestamp`, computed and never read).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass eighteen: `tradeService.ts`, 867 → 858.** The repeated cast was the
raw HTTP response body — `signedRequest<T>()` parsed it into `data: any`
and returned it as `T` unchecked, and two TP/SL fetch call sites used
`signedRequest<any>` to match.

- `data: Record<string, unknown>` in `signedRequest`, with an explicit
  `return data as T` at the one point it actually becomes the generic
  return type (previously implicit through `any`). `TradeError.details`
  and `serializePayload`'s return type became `unknown`; one internal
  `newObj: any` became `Record<string, unknown>`. The two TP/SL call sites
  now request `signedRequest<Record<string, unknown>>` instead of `<any>`.
- Typing `data` surfaced three real, narrow gaps `any` had been papering
  over: `data.code || response.status || -1` passed to
  `BitunixApiError`'s `code: number | string` parameter (`data.code` is
  `unknown`, needs a cast); `data.msg || data.error` built a log/error
  message from two `unknown` fields (wrapped in `String(...)`, which was
  already implicitly happening via template-literal coercion); and the
  `.catch()` fallback on one TP/SL fetch returned a differently-shaped
  object (`{ error: string }`) than the success path, which only type-checked
  before because both sides were `any`. Gave the catch callback an explicit
  `Record<string, unknown>` return type so both branches agree.
- Removed the unused `PositionRaw` type import (only `PositionRawSchema`,
  the runtime validator, is used) and `validCount`, a counter incremented
  once and never read.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass nineteen: `src/locales/i18n.ts`, 858 → 849.** The repeated cast was
the dot-notation dictionary walker (`getNestedValue`/`setNestedValue`) used
to build the `de-tech` locale (German UI text with English technical
terms substituted in).

- `Record<string, unknown>` for both functions' object parameters and
  `unknown` for their value types, with one explicit
  `as Record<string, unknown>` where `setNestedValue` descends a level
  (narrowing `unknown` back down — the walk is inherently untyped, since
  it's indexing a JSON tree by a runtime string path).
- 3 unused named imports from `svelte-i18n`
  (`getLocaleFromNavigator`, `dictionary`, `getLocaleFromHostname`) and one
  unused local function (`getSafeLocale`) removed — none referenced
  anywhere in the file or elsewhere in the codebase.
- The `_` store's cast-through type had `vars?: Record<string, any>`;
  changed to `unknown`, the values side of a translation-interpolation map
  that's only ever read, never operated on structurally.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty: `app.ts`, 849 → 841.** No single repeated cast this time —
five unrelated `any` sites in the app-orchestration module, plus three
unused type imports.

- `Settings` (already exported from `settings.svelte.ts`) replaces
  `settingsState.subscribe((s: any) => ...)`'s parameter type.
- Two `(bitgetWs/bitunixWs as any).isDestroyed = false` sites — a
  deliberate reach past a `private` field to force a clean reconnect —
  became `as unknown as { isDestroyed: boolean }`, naming exactly the one
  field being reached for instead of casting away all type safety on the
  whole object.
- `symbolDebounceTimer: any` became `ReturnType<typeof setTimeout> | null`,
  and a `requestIdleCallback` polyfill's callback parameter became
  `() => void` instead of `any`.
- Removed three unused type imports (`TradeValues`, `IndividualTpResult`,
  `BaseMetrics`) not referenced anywhere in the file.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-one: `webGpuCalculator.ts`, 841 → 833.** The repeated cast
was `TechnicalsData`'s result-building helper, `injectResult()`, which
built moving-average/oscillator/volatility entries through `any` at every
step.

- Three `writeBuffer(..., params as any)` calls turned out to need no cast
  at all: each is already behind an `instanceof ArrayBuffer` /
  `Float32Array` / `Uint32Array` check, and all three satisfy WebGPU's
  `BufferSource` parameter type directly.
- `calculate()`'s `klines: any[]` parameter became `Kline[]`, matching
  every other calculator in this codebase.
- `injectResult()`'s `result[category] as any[]`, `entry: any`, and
  `(result as any)[category]` became `IndicatorResult[]`/`IndicatorResult`
  once `IndicatorResult` gained a `price?: number` field — the GPU path
  was already writing `.price` onto moving-average entries, a field the
  type didn't declare and (as far as a codebase-wide search found) nothing
  reads. Documented as such rather than silently dropped, since removing
  an assignment because it "looks unused" is a claim about behavior, not
  about types.
- The `'volatility'` branch's `(result as any)[category][name] = val`
  writes to a key `TechnicalsData.volatility` doesn't declare — currently
  only `name === 'CHOP'` reaches it. Typing it surfaced that the WASM/CPU
  reference implementation puts the same indicator under a different
  field entirely (`result.advanced.choppiness`, not `result.volatility`),
  which would mean the GPU-accelerated Choppiness indicator never reaches
  wherever the UI actually reads it. Cast preserves current behavior; see
  `docs/TODO.md` item 4 — lower severity than the Bitget findings (WebGPU
  is the optional acceleration path), but the same "confirm with a test,
  don't fix as a lint-pass rider" reasoning applies.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-two: `wasmCalculator.ts`, 833 → 825.** A second pass over
this file (the first, in an earlier session, normalized its catch
bindings); this one cleared the 8 warnings that pass left behind — the
WASM bridge's own module/instance/result types.

- `WasmModule`/`WasmTechnicalsInstance` name the dynamically-imported glue
  module's shape (there's no static type to import — see the comment on
  why), replacing `wasmModule: any`/`instance: any`.
- `WasmRawResult` names the flat `Record<string, number>` maps the WASM
  module's JSON output actually has (`movingAverages`, `oscillators`,
  `volatility`, `pivots`), replacing `convertResult(raw: any, ...)`.
  `calculate()`/`convertResult()`'s `klines: any[]` become `Kline[]`,
  matching every other calculator in this codebase.
- Removed `isNetworkError`, computed alongside `isCompileError` but never
  read (`isCompileError` gates the immediate-throw decision; the network
  classification has no reader).
- The pivots-building block's `pivotsObj: any` intermediate variable is
  gone — it only ever held `{ classic: {...} }` before being assigned
  straight to `data.pivots`, so the object is now built and assigned in
  one step. Also trimmed six lines of resolved "does TS allow this?"
  exploratory comments down to the two-line conclusion they reached.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-three: `src/utils/WasmTechnicalsCalculator.ts`, 825 → 817.**
A parallel WASM bridge class to the one cleaned in pass twenty-two —
except this one has no callers.

- `WasmModule`/`WasmTechnicalsInstance`/`WasmParsedResult` replace 6 `any`
  sites, mirroring `services/wasmCalculator.ts`'s pattern; this file's
  `parseWasmResult` assigns fields straight onto `TechnicalsData` rather
  than reshaping flat maps, so its result type is keyed off
  `TechnicalsData`'s own field types instead of duplicating them.
- Removed two unused parameters (`enabledIndicators` on `initialize()`,
  `newCandle` on the no-op `shift()` stub) — neither read anywhere in the
  method body.
- **Found, not deleted: this whole class appears unreachable.** Nothing in
  `src/` imports `WasmTechnicalsCalculator`; the only other reference is a
  test file that mentions it in comments but never imports it, behind an
  `it.skip(...)`. Documented in `docs/TODO.md` item 5 rather than removed
  — the defensive-deletion rule in `CLAUDE.md` is explicit that code whose
  purpose isn't fully clear from the code alone doesn't get deleted
  without a person confirming it's safe to, and "confirmed unreferenced by
  grep" isn't the same as "confirmed safe to delete."

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-four: `tradeFlow.worker.ts`, 817 → 809.** The Web Worker
driving the animated trade-flow background (Three.js particle scenes).

- `FlowSettings` (with an index signature for the per-engine fields each
  of the five background engines reads independently — `BaseEngine`'s own
  `settings` field stays `any` by design, documented as such, and this
  type is just the honest shape of what the worker module itself reads:
  `flowMode` and six camera fields) and `TradeEventData` replace 4 `any`
  parameters.
- `updateSentimentUniforms()`'s three repeated
  `(obj as any).material.uniforms.uSentiment` casts became one
  `ObjectWithSentimentUniform` cast plus optional chaining — `THREE.Object3D`
  doesn't declare `.material` on the base type (only mesh subclasses do),
  so a cast is still needed, but one instead of three.
- `switchMode()`'s `mode` parameter widened to `string | undefined` to
  match `FlowSettings.flowMode` honestly, rather than asserting it's
  always present — the function already no-ops correctly on an unmatched
  mode.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-five: `WindowBase.svelte.ts`, 809 → 801.** The abstract base
class for all ~15 window implementations (charts, journal, chat, settings,
...).

- `HeaderControl`, `WindowSerializedState`, and the codebase's existing
  `WindowConfig`/`ContextMenuAction` types replace 6 `any` sites
  (`headerControls`, `serialize()`, `applyConfig()`, `getContextMenuActions()`)
  plus `Snippet` from `svelte` for `headerSnippet`. `componentProps()`'s
  `Record<string, any>` becomes `Record<string, unknown>`.
- Typing `HeaderControl` from what `WindowFrame.svelte` actually reads
  (`ctrl.title`, `ctrl.icon`, not just the two fields `ChartWindow.svelte.ts`,
  the only current populator, sets) caught a mismatch before it shipped
  rather than after — the initial interface only had `label`/`active`/
  `action`, which `npm run check` immediately rejected against the
  template's real reads.
- Typing `applyConfig(config: any)` to the real `WindowConfig` surfaced a
  dead fallback: `f.closeOnBlur ?? f.closeOnOutsideClick ?? this.closeOnBlur`
  reads a `closeOnOutsideClick` field `WindowFlags` has never declared and
  no window registration anywhere in `WindowRegistry.svelte.ts` sets —
  confirmed by grep before removing, not assumed.
- **Left as `any`, with an explicit `eslint-disable-next-line` and a
  comment:** the abstract `component` getter. Each of ~15 subclasses
  returns a different concrete Svelte component with its own specific prop
  signature; making this precisely typed would mean widening every
  implementation's props to a common shape, a much larger and unrelated
  change. Same treatment as `trade.svelte.ts`'s `update()`/`set()` from an
  earlier pass — a documented exception, not a silent gap, and it still
  drops out of the warning count instead of counting against the ratchet.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-six: `routes/api/orders/+server.ts`, 801 → 793.** A second
pass over this order-placement route (the first, in an earlier session,
removed 6 `any` casts); this one cleared the 8 left behind.

- `BitgetRawOrder` (one interface covering both the "current" and
  "history" endpoints, which use different field names for fill price and
  status — `priceAvg`/`state` vs. nothing/`status` — documented as such
  rather than split into two near-identical types) replaces 2 `any`
  parameters; `placeBitgetOrder`'s `Promise<any>` becomes `Promise<unknown>`,
  matching how its result is only ever forwarded, never destructured.
- Removed a duplicated undefined-stripping loop: `placeBitgetOrder` had its
  own inline `Object.keys(bitgetBody).forEach(k => (bitgetBody as any)[k]
  === undefined && delete ...)`, byte-for-byte the same logic as the
  `cleanPayload<T>()` helper already defined in this file and already
  called at two other sites — now a third call site instead of a third
  copy.
- Removed two genuinely unused symbols: `OrderRequestPayload` (only the
  runtime validator `OrderRequestSchema` is used) and `safeDecimal`, a
  never-called defensive helper. Checked before removing `safeDecimal`
  specifically because this is an order-placement route handling real
  money: every other `new Decimal(...)` call site in the file is already
  guarded by its own truthiness check, so the helper wasn't covering a gap
  — it was written and never wired up.
- Typing `body: unknown` at one log call and `o.cTime` (used with
  `parseInt`, which requires a `string`) surfaced two more places where
  `any` had silently let a wider type through than the code actually
  needed; both fixed with an explicit narrow/`String()` rather than
  reintroducing `any`.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-seven: `calculatorService.ts`, 793 → 786.** The position-size
calculator's orchestration service — the file that turns form values into
the numbers shown on screen.

- Three of the five `any` sites were annotations on parameters whose types
  were already fully known from context (`values.targets`'s array element,
  twice) or from the real `calculateTotalMetrics` implementation in
  `lib/calculators/core.ts` (`Array<{ price: Decimal; percent: Decimal }>`,
  returning the existing `TotalMetrics` type) — removing the redundant
  `any` let TypeScript's own inference (or the real signature) take over,
  no new type needed.
- The fourth, `currentTradeState.targets.map((t: any) => ...)`, became
  `TradeTarget` (already exported from `trade.svelte.ts`) — the import had
  looked unused at first glance (only one of its two use sites was visible
  before reading further into the file) and was removed, then re-added
  once this second site turned up.
- One truly-unused type import (`CalculatedTpDetail`) removed.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-eight: `routes/api/klines/+server.ts`, 786 → 779.** The
public candle-data proxy route, fronting both exchanges.

- `BitunixRawKline` (a dual-named field set — `open`/`o`, `id`/`time`/`ts`,
  ... — reflecting that Bitunix's kline shape has varied across API
  versions/endpoints) and `BitgetCandleTuple` (the documented
  `[timestamp, open, high, low, close, volume, quoteVol]` array shape)
  replace 4 `any` sites across both exchanges' fetch functions.
- Two `params: any` query-builder objects became `Record<string, string>`,
  matching what they're actually built from (`.toString()`ed values) and
  handed to `URLSearchParams`.
- One `(e as any).message` inside an already-narrowed
  `typeof e === 'object' && 'message' in e` branch became
  `(e as { message: unknown }).message` — the narrowing had already done
  the real work, the cast just needed to say what it was casting to.
- A `.sort((a: any, b: any) => ...)` on an already-mapped array needed no
  annotation at all — removing it let TypeScript infer both parameters
  from the `.map()` call immediately above.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass twenty-nine: `PositionsSidebar.svelte`, 779 → 768.** First Svelte UI
component in this item — everything ahead of it in the warning count was
a production service, store, or route handler, per the priority this item
has followed throughout (money-relevant code first).

- `NormalizedOrder` (existing type) and a new `AccountInfo` interface
  matching this component's own initial-state object field-for-field
  replace 3 `any` state declarations. `translateError()`'s `data: any`
  became a small inline shape; its dynamic-key `$_(key as any)` became
  `as TranslationKey`, the same established pattern as `syncService.ts`.
- `handleClosePosition()` built its `positionSide` argument as
  `String(pos.side).toLowerCase() as any` — but `pos.side` (from
  `OMSPosition`) is already the literal union `"long" | "short"`;
  `.toLowerCase()` was a no-op on an already-lowercase value that only
  existed to justify the cast. Passing `pos.side` directly removes both.
  Its and `handleCancelOrder()`'s `as any` response casts became
  `{ error?: string } | undefined`, matching what's actually read off them.
- Typing `historyOrders: NormalizedOrder[]` surfaced a dead fallback:
  `Number(o.filled || o.dealAmount || 0)` reads a `dealAmount` field
  `NormalizedOrder` has never declared — `filled` is the one canonical,
  always-present field the `/api/orders` route normalizes both
  exchanges' responses into. Removed the fallback.
- Removed three genuinely-dead symbols after checking each had no
  consumer anywhere (prop, template, or otherwise): the `isMobile` prop
  (no caller ever passes it, and the two call sites in `+page.svelte`
  both use the bare `<PositionsSidebar />`), `loadingAccount` (assigned in
  two places, read in none — unlike its three siblings
  `loadingPositions`/`loadingOrders`/`loadingHistory`, which are each
  passed to a sub-component's `loading` prop, this one wasn't even
  declared with `$state()`, so it couldn't have driven reactive UI even
  if something had read it), and `refreshAll()`, a complete, working
  function with no caller and no dangling UI hook (button, keybinding)
  that looked like it was meant to invoke it.
- Verified with `npm run build` in addition to the usual `npm run check`/
  `npx eslint`/`npm test`, since this is the first UI file touched in this
  item and a prop removal changes this component's external interface.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty: `JournalContent.svelte`, 768 → 757.** The largest UI file
touched so far — the trading journal's dashboard shell.

- `WindowBase` (the abstract class typed in pass twenty-five) replaces the
  `window?: any` prop; the component's only use of it,
  `win.headerSnippet = snippet`, already matches the `Snippet | null`
  field that pass gave it. `setHeaderSnippet`'s own `snippet: any`
  parameter becomes `Snippet` from `svelte`.
- `sortTrades()` sorts a genuine mix of two shapes — individual
  `JournalEntry` rows and synthetic grouped-by-symbol summary rows — by an
  arbitrary field name. `Record<string, unknown>` doesn't fit as the
  parameter type here (`JournalEntry` has no index signature, so it isn't
  structurally assignable to it — confirmed by `npm run check`, not
  assumed); the array stays `unknown[]` and each row is cast once, at the
  point it's read by dynamic key, rather than at the function boundary.
  `handleSort`'s `field: any` becomes a named `SortField` type shared with
  the existing `sortField` state.
- Two `catch (e: any)` sites normalized to the standard
  `e instanceof Error ? e.message : ...` pattern used throughout this item.
- **Found real, un-displayed user feedback, and fixed it — not by adding
  new UI, but by routing through UI that already exists.** Three cheat-code
  handlers (`unlockDeepDive`, `lockDeepDive`, `activateVipSpace`) built a
  parallel "overlay" state machine — `showUnlockOverlay`/
  `unlockOverlayMessage`, set on every path — that no template markup ever
  read; the feature-flag flips they perform (`isDeepDiveUnlocked`, opening
  the VIP space URL) worked, but the user got zero visual confirmation.
  Replaced the dead state with `uiState.showToast()`, the same toast
  system already used elsewhere in this codebase (confirmed in
  `PositionsSidebar.svelte`, pass twenty-nine) — this restores the
  intended feedback using existing, tested infrastructure instead of
  building new UI to satisfy a lint rule.
- Two more `$effect`s read a value (or, in one case, an array of eight
  values) purely to register it as a reactive dependency, never using the
  local binding itself — Svelte 5's standard "track without using"
  pattern. `void`-prefixed the reads instead of binding them to unused
  `const`s, which satisfies `no-unused-vars` without changing what the
  effect tracks. (A bare, non-`void`-prefixed property-read statement was
  tried first and rejected by a different rule, `no-unused-expressions` —
  `void` is exempted from that rule where a bare expression isn't.)
- **Found and left in place, documented in `docs/TODO.md` item 6:**
  `forceRecalculateAtr()` is a complete, working manual data-repair
  trigger with prepared i18n strings for its confirm dialog and progress
  messages, but no button, menu entry, or other caller anywhere in the
  file — a finished feature missing its UI trigger, not dead code.
  Suppressed narrowly (`eslint-disable-next-line`, pointing at the TODO)
  rather than deleted, since "purpose is clear, wiring is incomplete" is
  exactly what this repo's defensive-deletion rule protects.
- Verified with `npm run build` in addition to check/eslint/test, same as
  the previous UI-component pass, since the toast substitution changes
  user-visible behavior (in the intended direction — restoring feedback
  that was silently missing).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-one: `VisualsTab.svelte`, 757 → 746.** The theming/background
settings tab — six of its eleven `any` casts were the same repeated
shape: a `{#each}` over a literal array of mode names, assigning the loop
variable to a `settingsState` field typed as the exact matching string
literal union, cast away because the array literal widens to plain
`string` by default.

- All six became `{#each [...] as const as x}` instead of a cast at the
  assignment — `as const` narrows each array element to its literal type,
  so the loop variable already matches the target field's union and no
  cast is needed at all. Verified each target field's declared type
  against the array's contents before applying (`borderEffectColorMode`,
  `burningBordersIntensity`, `backgroundType`, `tradeFlowSettings.flowMode`,
  `.colorMode` — five distinct settings, same pattern each time).
- **Found and fixed a real, demonstrable bug, not a maybe:** the "Enable
  Side Panel" toggle's `onchange={(e: any) => uiState.toggleAssistant(e.detail)}`
  read `.detail` off a plain DOM `Event` — a property that has never
  existed on `Event` (only on `CustomEvent`), which is presumably why this
  was cast to `any` in the first place, to dodge the compile error that
  typing `e` honestly would have produced immediately.
  `toggleAssistant(show: boolean)` takes `show` falsy on every call as a
  result, and its body is `if (show) { open } else { close }` — so this
  toggle could only ever close the assistant window, never open it,
  regardless of which way the user clicked it. Fixed to read
  `(e.currentTarget as HTMLInputElement).checked`. Unlike the pass twelve
  and pass twenty-two findings, this needed no revert-test: `Event.detail`
  not existing is a static fact about the DOM type, not a claim about
  which runtime path executes.
- iOS's `DeviceOrientationEvent.requestPermission` — a Safari-only
  extension absent from the standard DOM lib types — got a named
  `DeviceOrientationEventiOS` interface instead of two `as any` casts.
- Removed `layoutModes`, an options array with prepared translation keys
  but no reader anywhere in the file (checked: the "layout" sub-tab renders
  plain toggles, not a mode selector) — unlike `forceRecalculateAtr` in the
  previous pass, this carries no working side effect when unused, so it's
  inert leftover data rather than a finished-but-unwired feature; removed
  rather than documented.
- Verified with `npm run build` in addition to check/eslint/test, per the
  UI-component convention this item has followed since pass twenty-nine,
  and specifically relevant here given the toggle behavior fix.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-two: `TechnicalsPanel.svelte`, 746 → 736.** The indicator
readout panel — 9 of 10 warnings were the dynamic-translation-key pattern
established in `syncService.ts` (pass eleven).

- 9 `$_(key as any)` sites became `as TranslationKey`, including one
  genuinely dynamic key built from a runtime action string
  (`` `settings.technicals.${key}` ``). The tenth site,
  `$_("settings.technicals.noSignals" as any)`, needed no cast at all once
  checked against the schema — it's a fixed literal already present in
  `TranslationKey`, not a dynamic key; the cast was copy-paste from the
  dynamic sites around it.
- Removed `toggleTimeframePopup()`, a click-toggle handler with no caller
  — the timeframe dropdown's open/close is driven entirely by
  `handleDropdownEnter`/`handleDropdownLeave` (hover), confirmed by
  reading both the state variable's only two setters and the template's
  actual event bindings. Superseded by the hover interaction, not a
  parallel path still in use.
- Verified with `npm run build` in addition to check/eslint/test, per the
  UI-component convention.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-three: `JournalCharts.svelte`, 736 → 726.** The
performance/cost chart grid in the journal's deep-dive dashboard.

- Most of the `.map((d: any) => ...)` sites needed no type at all —
  `equityCurve`/`drawdownSeries`/`feeCurve` all come from calculator
  functions (`lib/calculators/charts.ts`) with no explicit return type
  annotation, so TypeScript already infers their element shape
  end-to-end through the `journalState` derived chain; removing the
  redundant `any` let that inference take over.
- `themeColors?: any` became a named `ThemeColors` interface matching the
  prop's own default-value shape (five hex-color strings).
- Removed two unused props, `isPro`/`isDeepDiveUnlocked`: the one caller
  (`JournalContent.svelte`) passed them as hardcoded `isPro={true}
  isDeepDiveUnlocked={true}` — not bound to the real
  `settingsState.isPro`/`.isDeepDiveUnlocked` — and this component never
  read either one. Removed on both sides (the prop declarations here, the
  hardcoded attributes at the call site) rather than wiring up gating
  logic that was never implemented and that I have no basis for designing
  correctly — access control for this dashboard already happens via a
  sibling component's own `{#if settingsState.isPro}` gate.
- Removed `execData`/`scatterData`, a duplicate MFE-vs-MAE scatter-chart
  computation with no `<ScatterChart>` consumer in this file — confirmed
  the real one lives in the sibling `JournalDeepDive.svelte`
  (`ScatterChart` import, `mfeVsMae` title, at that file's line 561).
- Verified with `npm run build` in addition to check/eslint/test, given
  the cross-file prop removal.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-four: `TpSlList.svelte`, 726 → 719.** The TP/SL order list —
directly financial UI, showing and cancelling live take-profit/stop-loss
orders.

- `TpSlOrder` (already exported from `tradeService.ts`) replaces 5 `any`
  sites (`orders`, `editingOrder`, and three handler parameters). Two
  `catch (e: any)` blocks normalized to the standard
  `e instanceof Error ? e.message : String(e)` pattern, with the dynamic
  i18n-key lookup cast to `TranslationKey` where the message starts with
  `"dashboard.alerts"`.
- Typing `order: TpSlOrder` surfaced two real gaps `any` had papered over:
  `order.qty || order.amount` — `TpSlOrder` declares `qty?: string` but
  not `amount`, which only exists via the interface's `[key: string]:
  unknown` index signature, so the fallback's type was `unknown`, not
  assignable to `formatDynamicDecimal`'s parameter; and
  `order.ctime || order.createTime`, both individually `number |
  undefined`, passed to `formatDate(ts: number)` which doesn't accept
  `undefined`. Fixed with a narrowing cast on the first (the index
  signature's `unknown` is honestly no more specific than that without
  changing the shared type) and an explicit `|| 0` fallback on the second,
  matching `formatDate`'s own `if (!ts) return "-"` handling of falsy input.
- Verified with `npm run build` in addition to check/eslint/test, per the
  UI-component convention.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-five: `ScatterChart.svelte`, 719 → 712.** The MFE-vs-MAE
efficiency chart — last production UI component before this item moves
into test files.

- `ScatterPoint` (the exact shape `getExecutionEfficiencyData` in
  `lib/calculators/charts.ts` returns) replaces the `data: any` prop and
  the two Chart.js scriptable-color-callback contexts
  (`backgroundColor`/`borderColor`), which read `ctx.raw?.rawPnl`.
- The tooltip `label` callback's `context: any` became Chart.js's own
  `TooltipItem<"scatter">` type, imported from `chart.js` — the correct
  fix, not a workaround, since the library already exports the type this
  callback is actually invoked with.
- **Left `any` deliberately, with an eslint-disable and a comment:** the
  `datasets` array mixes a scatter dataset with line-type efficiency
  overlays pushed in afterward, and Chart.js's dataset types are generic
  per chart type — typing a genuinely heterogeneous array against that
  would need real union/type-guard machinery, disproportionate to a lint
  pass. Confirmed by trying the honest type first: `unknown[]` produced
  four cascading errors at the `new Chart(...)` call and the
  `chart.data =`/`chart.options =` update sites, all rooted in the same
  mixed-dataset shape. Same treatment as `WindowBase.component` from an
  earlier pass — still drops out of the warning count via the disable
  comment.
- Verified with `npm run build` in addition to check/eslint/test, given
  the Chart.js integration.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-six: `hooks.server.ts`, 712 → 706.** The global console
interceptor and request-logging middleware.

- `globalThis as typeof globalThis & { _isConsolePatched?: boolean }`
  replaces two `(global as any)._isConsolePatched` sites — a named
  augmentation instead of casting the whole global object away.
  `console.log`/`.warn`/`.error`'s `...args: any[]` become `unknown[]`,
  which is all the `typeof a === "object" ? JSON.stringify(a) :
  String(a)` mapping needs.
- One `catch (err: any)` normalized to the standard
  `err instanceof Error ? err.message : String(err)` pattern.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-seven: `lib/calculators/charts.ts`, 706 → 700.** The journal
chart-data calculators feeding `JournalCharts.svelte`/`JournalDeepDive.svelte`.

- Four `{ x: any; y: number }[]` chart-point array declarations became
  `{ x: string; y: number }[]` — every one is populated by pushing
  `{ x: t.date, ... }`, and `JournalEntry.date` is `string`.
- Removed an unused import, `getTimingData` — genuinely redundant, not
  missing wiring: the feature it powers works via a separate, already-used
  path (`lib/calculators/stats.ts` → `aggregator.ts` → `calculator.ts`,
  confirmed by `calculator.ts`'s own comment "Exported from Stats now" and
  by `journalState.timingMetrics`'s actual call site), so this file's copy
  of the same import was dead weight, not a hole.
- Removed an unused local, `expectancy` — computed, then abandoned per the
  code's own adjacent comment ("this is actually expectancy per trade in
  $, need in R"), with `avgRMultiple` used two lines below instead once
  the unit mismatch was noticed. Kept the comment, attached to the
  surviving variable, since it documents a real unit-conversion pitfall.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-eight: `routes/api/positions/+server.ts`, 700 → 694.** The
open-positions proxy route, fronting both exchanges.

- New `NormalizedPosition` (added to `types/bitunix.ts` alongside the
  existing `NormalizedOrder`, the shared output shape both exchanges map
  into) plus two local raw input types, `BitunixRawPosition` and
  `BitgetRawPosition`, replace 6 `any` sites.
- One site needed care: Bitunix's chain is `.map(raw → normalized)`
  `.filter(...)`, so the `.filter()` callback's `p` is the *normalized*
  object, not the raw exchange payload — confirmed by reading the map
  body's return statement before typing it, not assumed from position in
  the chain. Bitget's chain runs the other order, `.filter(raw)`
  `.map(raw → normalized)`, so both of its callbacks take the raw type.
  Getting this backwards on the Bitunix side would have shipped code
  checking `BitunixRawPosition.size`, a field that raw shape doesn't have.
- TypeScript's contextual typing doesn't reach into `.filter()` callbacks
  through a function's declared return type across a chained `.map()` —
  the first attempt (`(p) => ...` on the Bitunix filter) came back
  "implicitly has an 'any' type"; typed explicitly against
  `NormalizedPosition` instead.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass thirty-nine: `routes/api/external/news/+server.ts`, 694 → 688.** The
news-proxy route (CryptoPanic/NewsAPI passthrough with an in-memory cache,
rate limiter, and in-flight-request dedup).

- `CachedResponse.data: any` → `unknown`, and `pendingRequests`'s
  `Map<string, Promise<any>>` → `Promise<unknown>` — both are opaque
  payloads this route stores and replays verbatim, never inspects, so
  `unknown` is the honest shape.
- `setCache(key, data: any)` → `data: unknown` to match.
- An eviction filter, `.filter(([_, info]) => ...)`, dropped the unused
  `_` destructure binding entirely (`.filter(([, info]) => ...)`) — this
  repo has no `varsIgnorePattern`, so the underscore itself doesn't
  suppress the warning, only removing the binding does.
- Two `catch` blocks normalized with the standard
  `err instanceof Error ? err.message : String(err)` guard. The second one
  also read `err.cause` for logging; `unknown` has no `.cause`, so that
  read got its own `instanceof Error` guard alongside the message
  extraction rather than a blanket cast.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass forty: `services/marketAnalyst.ts`, 688 → 682.** The favorites-symbol
multi-timeframe technical-analysis background loop.

- New `AnalystTechEntry` interface for the per-timeframe cache entries
  this file builds (raw indicator arrays plus `_maMap`/`_oscMap`, Maps
  pre-indexed by indicator name for O(1) lookups instead of re-scanning
  the arrays on every read) — used for both the internal `techMap` and
  the exported `calculateAnalysisMetrics()`'s parameter, replacing 3
  `Record<string, any>` sites.
- `private timeoutId: any` → `ReturnType<typeof setTimeout> | null`,
  matching what `setTimeout`/`clearTimeout` actually exchange.
- Removed three dead locals surfaced once nothing dereferenced them:
  `requiredIndicators` (assigned from a module-level
  `REQUIRED_INDICATORS` object, itself never read anywhere else —
  removed both, a leftover from before `getAnalystSettings()` took over
  building the indicator-enable settings actually passed downstream),
  and `ema200_4h`/`tech4h` plus `rsiObj` (computed then never read —
  `calculateAnalysisMetrics()` already re-derives both the EMA-200 trend
  and RSI from the same `techMap` it's handed, so these were leftover
  from before that extraction).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass forty-one: `services/newsService.ts`, 682 → 676.** The
news-fetch/sentiment-cache orchestrator (CryptoPanic, NewsAPI, Discord, RSS,
plus an AI sentiment summarizer).

- The CryptoPanic/NewsAPI response mappers each had a `.map((item: any) =>
  ...)` reading fields off an untyped `safeJsonParse(text)` result.
  `safeJsonParse<T>` is generic, so both call sites now pass
  `z.infer<typeof CryptoPanicResponseSchema>` /
  `z.infer<typeof NewsApiResponseSchema>` (the exact schemas
  `routes/api/external/news/+server.ts` already validates the upstream
  response against, from pass 39) instead of casting the mapper's
  parameter — the honest fix, reusing existing schema types rather than
  inventing a parallel shape.
- That surfaced a real gap in `CryptoPanicPostSchema`
  (`types/newsSchemas.ts`): it never declared a `currencies` field, even
  though `NewsItemSchema` two schemas up in the same file expects exactly
  that shape (`{code, title}[]`) and the CryptoPanic API does send it.
  Added the matching field declaration rather than casting `unknown` away
  at the call site — the schema was incomplete, not the consumer wrong.
- `params: any` (the CryptoPanic query-params object) → `Record<string,
  string>`, matching what's actually assigned into it.
- Removed three module-scope constants nothing read:
  `CACHE_KEY_SENTIMENT`, `CACHE_TTL_NEWS` (dead since the sentiment cache
  uses its own `CACHE_TTL_SENTIMENT`, and news-cache freshness runs
  through `shouldFetchNews()`, not a flat TTL constant), and
  `SentimentCacheSchema`/`SentimentAnalysisSchema` (a Zod pair with no
  reader anywhere in the file — `analyzeSentiment()` reads the IDB cache
  and the AI response both as trusted casts, `cached as {data:
  SentimentAnalysis, ...}` and `data.analysis as SentimentAnalysis`,
  never through either schema). Left unwired rather than wired in: adding
  a new rejection branch to a live external-AI response path is a
  behavior change past what a lint pass should carry — documented as
  `docs/TODO.md` item 7 instead.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass forty-two: `stores/ui.svelte.ts`, 676 → 670.** The window/modal/toast
UI-state store, including the legacy `subscribe()`/`update()` pair kept for
non-Svelte-context callers.

- New `UiSnapshot` interface, matching the object literal `subscribe()`'s
  `getSnapshot()` and `update()`'s `stateSnapshot` both already build
  field-for-field — replaces the `(value: any) => void` /
  `(state: any) => any` signatures on both legacy methods, and both
  internal snapshot builders.
- `tooltip.data` (the `$state` field) and `showTooltip()`'s `data`
  parameter → `unknown`. This store never reads into the object — it's
  handed through to whichever of `PositionTooltip`/`OrderDetailsTooltip`
  the `tooltip.type` discriminant selects, which is exactly the "opaque
  payload, never inspected here" shape `unknown` describes; both
  consumers still type their own prop as `any`, out of scope for this
  file.
- `private notifyTimer: any` → `ReturnType<typeof setTimeout> | null`,
  matching the two `setTimeout`/`clearTimeout` sites managing it.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass forty-three: `utils/technicalsCalculator.ts`, 670 → 664.** The shared
indicator-calculation core run from both the main thread and the
technicals worker.

- `advancedInfo: any` → `NonNullable<TechnicalsData["advanced"]>` — the
  exact type already existed (`vwap`, `mfi`, `stochRsi`, `williamsR`,
  `choppiness`, `ichimoku`, `parabolicSar`, `superTrend`,
  `atrTrailingStop`, `obv`, `volumeProfile`, `volumeMa`, `adx`,
  `marketStructure`), it just wasn't applied at the one place that builds
  every field on it.
- `let volatility: any` → `TechnicalsData["volatility"]`, same reasoning.
- `let pivotData: any` → `{ pivots: TechnicalsData["pivots"]; basis:
  TechnicalsData["pivotBasis"] }`, covering both the calculated branch and
  the `{ pivots: undefined, basis: undefined }` disabled-pivots branch.
- `shouldCalculate()`'s `(config as any).enabled` needed no cast at all —
  the existing `'enabled' in config` guard already narrows the
  `keyof IndicatorSettings` union correctly; the cast was redundant.
- Removed an unused type import, `DivergenceResult` (the array literal it
  typed is pushed straight into a `DivergenceItem[]`, and nothing else in
  the file names the type), and an unused local, `stochD` — read from
  settings, then never used, per the adjacent comment ("D-Line is
  optional... usually standard Stoch has K and D") the D line was never
  actually implemented here, only K.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6 skipped.

**Pass forty-four: `components/shared/OrderHistoryList.svelte`, 664 → 658.**
The order-history panel in the positions sidebar.

- `Props.orders`, and the `order` parameter of `handleMouseEnter`,
  `handleKeyDown`, and `getFeeDisplay`, all typed as `NormalizedOrder`
  (the same type `PositionsSidebar.svelte` already declares its
  `historyOrders`/`filteredHistoryOrders` as — this component just never
  had it on the receiving end). `getTypeLabel`'s `type: any` →
  `string`, matching the one field it's ever called with, `order.type`.
- The dynamic i18n key read, `$_(error as any)`, → `as TranslationKey`,
  the pattern established since pass 11.
- Typing surfaced a dead fallback: four PnL reads did
  `order.realizedPNL || order.realizedPnL`, but `NormalizedOrder` only
  ever declares `realizedPNL` (capital PNL) — `realizedPnL` doesn't exist
  on the type, so the fallback never contributed. Removed the dead half
  of all four reads; behavior is unchanged since `undefined || 0` and
  `x || undefined || 0` evaluate identically.
- One follow-on fix typing required: `roleMap[order.role]` failed since
  `role` is `string | undefined` on `NormalizedOrder` and can't index a
  `Record<string, string>` as `undefined` — `roleMap[order.role || ""]`.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds (extra gate for UI-component passes).

**Pass forty-five: `components/shared/journal/JournalDeepDive.svelte`, 658
→ 652.** The journal's expanded analytics panel (performance/market/
strategy/behavior chart tiles).

- `themeColors: any` → a local `ThemeColors` interface, matching the
  5-field object `JournalContent.svelte` builds and passes into both this
  component and `JournalCharts.svelte` (pass 33 already named the same
  shape there — declared locally again here rather than shared across
  files, since it's a small `<script>`-local prop type, consistent with
  how this codebase already has an unrelated, differently-shaped
  `ThemeColors` in `chartPatterns.types.ts`).
- Two dynamic i18n key reads, `$_(("journal.days." + ...) as any)`, → `as
  TranslationKey`.
- `(ds.data || []).map((d: any) => ...)` needed no annotation — `d`'s
  shape (`{x: string, y: number}`) already flows through from
  `getTagEvolution()`'s inferred return type, the same pattern pass 33
  found repeatedly in the sibling chart component.
- The confluence-matrix hour-label loop, `{#each Array(24) as _, i}`,
  flagged its unused item binding — Svelte's each-block bindings aren't
  covered by `no-unused-vars`' default "after-used" leniency for trailing
  used parameters (which is why a plain `(_, i) => i` callback elsewhere
  in the same file is fine). Replaced with a precomputed `hoursOfDay =
  Array.from({length: 24}, (_, i) => i)` array iterated by value
  (`{#each hoursOfDay as hour}`), removing the unused binding entirely
  instead of just renaming it.
- Removed a dead local, `dirData` — computed via
  `calculator.getDirectionData(journal)` but never read anywhere in the
  file; `journalState.directionMetrics` (same underlying calculator,
  different call site) is what the rest of the codebase actually uses.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass forty-six: `lib/windows/implementations/CandleChartView.svelte`, 652
→ 646.** The Lightweight Charts candle view rendered inside `ChartWindow`.

- `window: any // Type ChartWindow` → `window: WindowBase`, matching the
  precedent already set by `AssistantView.svelte`, `ChatTestView.svelte`,
  and `IframeView.svelte` (`window: WindowBase`, or `WindowBase & {...}`
  for extra fields) — the fields this file actually reads/writes off it,
  `showRightScale` and `currentPrice`, are both declared on `WindowBase`
  itself, not on `ChartWindow`.
- `let debounceTimer: any` → `ReturnType<typeof setTimeout>`.
- The `subscribeVisibleLogicalRangeChange` handler's `newVisibleLogicalRange:
  any` → `LogicalRange | null`, lightweight-charts' own
  `LogicalRangeChangeEventHandler` parameter type.
- `klines.map((k: any) => ...)` needed no annotation — `klines` already
  resolves to `Kline[] | undefined` through `marketState`'s typed
  `Record<string, Kline[]>`, so `k` infers correctly once the cast is
  gone.
- Removed two unused props, `showPriceInTitle` and `setTimeframe` — both
  destructured, neither read anywhere in the file. Traced both to confirm
  they're genuinely dead, not a missing wire-up: `showPriceInTitle` is
  redundant because `WindowFrame.svelte` already reads
  `win.showPriceInTitle`/`win.currentPrice` directly off the same live
  window instance to render the title-bar price (confirmed at
  `WindowFrame.svelte:419`), and `setTimeframe` is redundant because
  timeframe switching already works end-to-end through
  `ChartWindow.updateHeaderControls()`'s header buttons, which mutate
  `this.timeframe` directly rather than through this callback.
  `ChartWindow.svelte.ts`'s `componentProps` still passes both — left
  as-is since the render site (`WindowFrame.svelte:638`) spreads props
  through an untyped `win.component`, so the extra keys are harmlessly
  ignored, not a type error.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass forty-seven: `services/apiService.ts`, 646 → 641.** The
Bitunix/Bitget kline and ticker HTTP client.

- New `BitgetRawKlineObject` (Bitget's object-format kline, endpoint
  version dependent, hence the multi-field fallback chains already in the
  code), `BitunixRawTicker`, and `BitgetRawTicker` — replace 4 of the 5
  `any` sites, each a mapper callback parameter for a raw exchange
  payload.
- Two of the four `new Decimal(obj.field || obj.altField)` calls in the
  Bitget kline object branch needed `as Decimal.Value` casts to preserve
  the prior unchecked (possibly-throwing, caught by the surrounding
  `try`) behavior — same reasoning as pass 17's identical situation:
  `obj.open || obj.o` can resolve to `undefined` if the payload has
  neither field, and `Decimal.Value` doesn't include `undefined`.
- The remaining two `any` sites, a Bitget-kline-array `.map()` parameter
  and a Bitunix-kline `.map()` parameter, both feed straight into a Zod
  `.safeParse()` (which accepts `unknown` natively) → `unknown` instead
  of a named type.
- `let errData: any = {}` (parsed from a failed Bitunix kline response,
  read only for `.error`) → `{ error?: string }`.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped.

**Pass forty-eight: `services/cloudService.ts`, 641 → 636.** The Global
Chat (SpacetimeDB) client — Class B data per ADR-0001, opt-in and
authenticated only.

- All 5 remaining `any` sites in this file are the same class of problem
  the file already had one documented instance of:
  `canDeleteMyMessages()`'s `(reducers as any).deleteMyMessages` (kept
  `any` with an `eslint-disable-next-line` and a comment explaining that
  the generated SpacetimeDB bindings in `src/lib/spacetimedb/` can predate
  a server-side schema change, since editing generated files by hand is
  forbidden and a build isn't guaranteed to have re-run `spacetime
  generate`). The other 5 sites are the identical situation —
  `(tables as any).globalMessage || (tables as any).global_message` (the
  snake_case/camelCase accessor-name fallback, already explained by the
  comment directly above it), the `onInsert((ctx: any, row: any) => ...)`
  callback whose shape depends on that same untyped handle, and
  `(reducers as any).sendMessage(text)` — given the matching
  `eslint-disable-next-line` treatment with a comment pointing back at the
  established precedent, rather than forcing a type onto something the
  file's own comments already document as runtime-uncertain.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped.

**Pass forty-nine: `lib/windows/WindowManager.svelte.ts`, 636 → 631.** The
singleton window stacking/persistence manager.

- `rehydrate()`'s `let data: any[]` → `unknown[]`, and
  `createFromData(data: any)` → `data: unknown`, narrowed via a new
  `SerializedWindowData` interface (deliberately wider than the existing
  `WindowSerializedState` from `WindowBase.svelte.ts`, since each window
  type's own `serialize()` adds its own extra fields — `symbol`,
  `timeframe`, `url` — that this factory reads back out). Two of the
  three `new XWindow(...)` calls needed `as string` casts on `d.url`/
  `d.title` to preserve the prior unchecked behavior against
  `ChannelWindow`/`IframeWindow`'s required-string constructor
  parameters, rather than adding new fallback defaults that would change
  what a corrupt or partial session entry produces.
- `openModal()`'s `component`/`options` and `openIframe()`'s `options`
  stayed `any`, documented with `eslint-disable-next-line` — both forward
  verbatim into `ModalWindow`/`IframeWindow`'s own `any`-typed
  constructors (a separate file, out of this pass's scope), for the same
  "heterogeneous Svelte component" reasoning pass 25 already documented
  on `WindowBase`'s abstract `component` getter.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty: `services/logger.ts`, 631 → 626.** The client-side
centralized logger (distinct from `lib/server/logger.ts`, typed back in
pass 15).

- `data?: any` on `log()`/`warn()`/`debug()` and `error?: any` on
  `error()` → `unknown`, matching the server-side logger's precedent:
  these are opaque debug payloads handed straight to `console.*`, never
  inspected by this file.
- `(settings.logSettings as any)[category]` → `(settings.logSettings as
  Partial<Record<LogCategory, boolean>>)[category]`. Not just a
  mechanical swap: `logSettings`'s declared type only has 6 of
  `LogCategory`'s 10 members (`journal`, `data`, `ui`, `api` aren't
  fields on it) — `Partial<Record<LogCategory, boolean>>` is what
  actually matches the runtime behavior of indexing a plain object with a
  key it may not declare (`undefined`, then `!!undefined` → `false`),
  which is exactly what the `any` cast was silently doing. No settings UI
  component references `logSettings` at all currently, so those four
  categories are only ever enabled via `force` or `debugMode` rather than
  a per-category toggle — a completeness gap in an internal debug
  feature, not a correctness bug, so noted here rather than in
  `docs/TODO.md`.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped.

**Pass fifty-one: `stores/settings.svelte.ts`, 626 → 621.** The Class-A
settings store (API keys, secrets, presets — `localStorage`-only per
ADR-0001).

- `private notifyTimer: any` / `private saveTimer: any` →
  `ReturnType<typeof setTimeout> | null`.
- Two identical `SENSITIVE_KEYS.includes(key as any)` sites (guarding
  which decrypted-secret fields are safe to write back onto `this`) →
  `key as keyof Settings`, matching `SENSITIVE_KEYS`'s own declared
  element type (`(keyof Settings)[]`) instead of bypassing it — `key`
  comes from `Object.entries(...)`, which always yields plain `string`,
  so a cast is still required, just a precise one instead of an escape
  hatch.
- `let encryptionPassword: any` → `string | CryptoKey | undefined`,
  matching `getDeviceKey()`'s declared return type
  (`Promise<string | CryptoKey>`) and `cryptoService.encrypt()`'s second
  parameter type, both already correctly typed — the `any` was
  redundant.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-two: `actions/burn.ts`, 621 → 616.** The `use:burn` Svelte
action driving the burning-border fire effect (fed by `fireStore`).

- New `Rect` interface (`{top, left, width, height}`) for `lastRect`/
  `rect` — covers both the pushed-geometry literal and
  `node.getBoundingClientRect()`'s `DOMRect` (a structural superset, so
  no cast needed at either assignment site).
- `private localLastPrice: any = null; // Decimal` → `Decimal | null`,
  removing the comment now that the type says it directly.
- The two `as any` casts on the `fireStore.updateElement()` call —
  `layer: currentLayer as any` and `mode: (explicitMode || currentMode)
  as any` — needed no cast at all. `currentLayer` (`currentOptions.layer
  ?? "tiles"`) already resolves to exactly `BurningElement`'s declared
  `layer` union, and `explicitMode || currentMode` already resolves to
  exactly its `mode` union (`BurnOptions.mode` has one more member,
  `'glow'`, than `settingsState.borderEffectColorMode`, but the `||`
  fallback's combined type still matches `BurningElement.mode` exactly).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped.

**Pass fifty-three: `components/shared/backgrounds/engines/CityEngine.ts`,
616 → 611.** One of seven `BaseEngine` background-rendering
implementations (Three.js instanced-mesh "city" trade visualization).

- `buildings`'s Map value type gained an optional `type?: 'buy' | 'sell'`
  field, eliminating both `(data as any).type` read/write sites — the
  field was always there at runtime (set in `onTrade()`, read in
  `update()`), just never declared on the literal type.
- Removed the unused `EngineContext` type import (only referenced by
  itself).
- `update(time: number, delta: number)`'s `delta` was unused; dropped
  from the signature rather than suppressed, since TypeScript allows an
  override to declare fewer parameters than the abstract method it
  implements (extra arguments the caller passes are simply ignored) —
  confirmed by `npm run check` staying at 0 errors. Left the other six
  sibling engines untouched: none of them use `delta` either, but fixing
  all seven is a separate pass each, not a drive-by here.
- `updateSettings(newSettings: any)` stayed `any`, documented — every
  sibling engine's `updateSettings()` has the identical signature,
  matching `BaseEngine.context.settings`'s own declared `any` ("Generic
  settings for flexibility"); narrowing just this one override wouldn't
  make the actual sink any more honest.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-four: `components/shared/backgrounds/galaxy.worker.ts`, 611 →
606.** The dedicated worker driving the galaxy/stardust Three.js
background (message-passed init/resize/settings/color updates).

- New `GalaxySettings` interface (the two fields this worker actually
  reads, `camPos`/`autoCenter`, plus an index signature for whatever
  other engine-specific tunables `GalaxyEngine`/`StarDustEngine` read
  from `context.settings` themselves — both take it as `any`, matching
  `BaseEngine`'s own declared field type) replaces the module-level
  `settings: any` and both `init`/`updateSettings` message payload `any`
  parameters.
- `InitMessageData`, `ResizeMessageData`, `UpdateColorsMessageData` type
  the other three `self.onmessage` payload shapes, all previously `any`.
- Typing `colors.blending` as `THREE.Blending` (the field
  `UpdateColorsMessageData.blending` needs to assign into) surfaced that
  the object literal's inferred type had narrowed `blending` down to the
  single literal value of `THREE.AdditiveBlending`, rejecting any other
  valid `Blending` constant — fixed by giving `colors` an explicit type
  annotation instead of leaving it inferred from the initializer.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-five: `components/shared/journal/JournalTable.svelte`, 606 →
601.** The journal trade table (flat and grouped-by-symbol modes).

- `onUpdateTrade`'s `data: any` → `Partial<JournalEntry>`, matching what
  `app.updateTrade()` (its one real caller, via `JournalContent.svelte`)
  actually declares and what both call sites (`{tags: newTags}`,
  `{screenshot: url}`) already pass.
- `sortTradesList()` rebuilt around the exact pattern
  `JournalContent.svelte`'s `sortTrades()` already established in an
  earlier pass for this same "rows might be a real trade or a synthetic
  group-summary object" problem: the list param is `unknown[]`, each row
  is cast to `Record<string, string | number | Decimal | undefined |
  null>` at the point of dynamic-field access, and the `.toNumber` duck
  check became a real `instanceof Decimal` guard. `getSlAtr()`'s `item:
  any` got the same row-record type, with `as Decimal.Value` casts on
  its three field reads to preserve the prior unchecked (possibly-NaN,
  guarded by the adjacent `if` above it) behavior.
- `Props.trades` and the `{#snippet tableTemplate(items: any[], ...)}`
  parameter stayed `any[]`, documented: unlike the sort helper, these
  flow directly into ~250 lines of template that duck-types both
  `JournalEntry` fields and group-summary fields (`isGroup`,
  `totalTrades`, `totalProfitLoss`, `wonTrades`, nested `trades`) off the
  same `item` — typing that properly means auditing every read in the
  template against a discriminated union, a separate and larger pass.
  Discovered along the way: an HTML-comment `<!-- eslint-disable-next-line
  -->` placed before a `{#snippet ...}` tag does *not* suppress warnings
  inside that tag's TypeScript parameter list (svelte-eslint-parser
  doesn't expose template comments as directives to the embedded
  TS sub-parse) — a `/* eslint-disable-line */` block comment placed
  inside the parameter list itself does work, since it's parsed as a
  real TS comment in that sub-parse.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-six: `components/shared/backgrounds/engines/BaseEngine.ts`,
601 → 597.** The abstract base class all seven Three.js background
engines extend.

- Removed `BaseEngineSettings` — an interface with its own `[key:
  string]: any` index signature, declared but referenced nowhere in the
  codebase, not even in this file. `EngineContext.settings` was already
  typed `any` directly rather than via this interface.
- The other three `any` sites — `EngineContext.settings`,
  `updateSettings(settings: any)`, `shouldReinit(newSettings: any)` — all
  documented with `eslint-disable-next-line` rather than narrowed.
  `context.settings` is read by every subclass (`CityEngine`,
  `BlockEngine`, `EqualizerEngine`, `GalaxyEngine`, `RaindropsEngine`,
  `SonarEngine`, `StarDustEngine`) and by `galaxy.worker.ts` via
  free-form field access (`s.gridWidth || 80`, etc.) with no shared
  settings shape across engines — narrowing it here would cascade type
  errors through all of them, confirmed by CityEngine's pass already
  leaving its own `updateSettings` override `any` for exactly this
  reason.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-seven: `lib/windows/implementations/ContentWindow.svelte.ts`,
597 → 593.** A generic "wrap any Svelte component" window implementation.

- `_component`/the constructor's `component` param stayed `any`,
  documented — same reasoning `WindowBase.svelte.ts`'s abstract
  `component` getter already gives (a generic Svelte component reference
  with no shared prop shape).
- `_componentProps: any` → `Record<string, unknown>`, matching
  `WindowBase`'s own `componentProps` getter, which this class overrides
  — an honest type was already sitting one file away.
- `options: any` in the constructor stayed `any`, consistent with every
  sibling window implementation's constructor (`ModalWindow`,
  `IframeWindow`, `ChannelWindow`) — same family-wide convention.
- Grepping for callers turned up none: `ContentWindow` isn't imported or
  instantiated anywhere in `src/`, unlike `ModalWindow`/`IframeWindow`
  which both have real `windowManager` entry points. Documented as
  `docs/TODO.md` item 8 rather than deleted, per this repo's
  defensive-deletion rule — same shape of finding as item 5
  (`WasmTechnicalsCalculator.ts`).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-eight: `lib/windows/implementations/DialogWindow.svelte.ts`,
593 → 589.** The alert/confirm/prompt dialog window, resolving a
caller-supplied Promise.

- `resolve`'s field type, the constructor's `resolve` parameter, and
  `closeWith(value: any)` → `boolean | string`, traced through the one
  real call chain: `modalState.show()` (`stores/modal.svelte.ts`) passes
  a `Promise<boolean | string>`'s executor `resolve` straight into this
  constructor, and `DialogView.svelte`'s `handleConfirm(result: boolean
  | string)` is the only caller of `closeWith()`.
- `options: any = {}` → `WindowOptions` (imported from `../types`).
  Unlike the sibling window implementations (`ModalWindow`,
  `IframeWindow`, `ContentWindow`), nothing here reads extra fields off
  `options` beyond spreading it into `super()` — no `.props`-style
  extraction — so the honest type had no downside, unlike those files
  where `any` stays deliberate.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass fifty-nine: `components/shared/OpenOrdersList.svelte`, 589 →
585.** The open-orders panel in the positions sidebar — sibling to
`OrderHistoryList.svelte` from pass 44.

- Same fix as that pass: `Props.orders`, `handleMouseEnter`'s and
  `handleCancel`'s `order` parameters → `NormalizedOrder`, matching what
  `PositionsSidebar.svelte`'s `openOrders: NormalizedOrder[]` actually
  passes in. `getTypeLabel`'s `type: any` → `string`, the one field it's
  called with (`order.type`). No dead-fallback finding this time — every
  field this file reads (`symbol`, `time`, `side`, `type`, `amount`,
  `filled`, `price`, `status`, `id`, `orderId`) is a real declared
  `NormalizedOrder` field, unlike `OrderHistoryList.svelte`'s
  `realizedPnL` case.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass sixty: `components/shared/MarketDashboardModal.svelte`, 585 →
581.** The favorites-overview modal (confluence-sorted symbol grid with
live price/change overlay).

- `sortedResults`'s `.sort((a: any, b: any) => ...)` needed no
  annotation at all — its element type (a union of `SymbolAnalysis` and
  a locally-built placeholder object for unanalyzed favorites) already
  has `confluenceScore: number` on both branches, so removing the cast
  let TS infer it correctly.
- `getLivePrice(item: any)` / `getLiveChange(item: any)` →
  `(typeof sortedResults)[number]`, referencing the same derived array's
  inferred element type instead of duplicating the union by hand.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass sixty-one: `components/shared/ThreeBackground.svelte`, 581 →
577.** The galaxy-worker mount point (offscreen-canvas handoff, theme
color sync).

- `(canvas as any).transferControlToOffscreen()` needed no cast at
  all — `HTMLCanvasElement.transferControlToOffscreen(): OffscreenCanvas`
  is already declared in the project's DOM lib; the offscreen canvas this
  produces types straight into `galaxy.worker.ts`'s `InitMessageData.canvas:
  OffscreenCanvas` from pass 54, no seam.
- Removed three dead locals: `isVisible` (set from an
  `IntersectionObserver` callback, read nowhere — the adjacent comment,
  "Tell worker to pause/resume? (Not implemented in worker yet)", already
  says the feature it was tracking for was never wired up), and `bgCol`/
  `isLight` (a first-pass "is the background light or dark" check,
  immediately superseded three lines later by the "Proper HSL check in
  main thread" that actually computes `light` and is what's used).

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

**Pass sixty-two: `lib/windows/implementations/AssistantView.svelte`, 577
→ 573.** The AI/notes/chat side-panel window content.

- `catch (e: any) { errorMessage = e.message || "Error"; }` → the
  standard `e instanceof Error ? e.message : "Error"` normalization.
- Dynamic i18n key read, `$_(errorMessage as any)`, → `as
  TranslationKey`.
- Removed two dead functions, `changeFontSize()` and `cycleMode()` —
  both thin wrappers around `win.setFontSize()` / `win.onHeaderTitleClick()`
  with no caller anywhere in this file. Confirmed genuinely redundant,
  not a missing wire-up: `WindowFrame.svelte` (the actual window header)
  already calls both directly on `win` from its own font-size ±
  buttons and title-click handler, so the feature these wrapped works
  end-to-end without them.

`npm run check` stays at 0 errors; `npm test` stays at 850 passing, 6
skipped; `npm run build` succeeds.

### Code health

| # | Item | Status |
| --- | --- | --- |
| 18 | ~~Fix the pre-existing test failures~~ — done: **28 → 0**. The gate suite passes (821 tests) and CI runs all of it instead of three hand-picked files. Wall-clock benchmarks moved to a non-blocking job — see below | 🟢 |
| 19 | ~~Attach `cause` to rethrown errors~~ — done: all 10 sites in `apiService.ts`, `tradeService.ts`, `news/+server.ts` and `storageUtils.ts` now chain the original failure | 🟢 |
| 20 | ~~Burn down the 112 ESLint errors, then make lint a required CI check~~ — done: 0 errors, lint is now a required check | 🟢 |
| 21 | Burn down the remaining 573 `no-explicit-any` / `no-unused-vars` warnings, lowering the CI ceiling as you go, then restore both rules to `error` | 🟡 |
| 22 | ~~Resolve `.deploy.conf` being committed alongside its own `.example`~~ — done: untracked and ignored, template corrected, migration documented | 🟢 |
| 23 | ~~Deduplicate `chartpatterns.html`~~ — done: the root copy was an early draft with 4 of 56 patterns | 🟢 |
| 24 | ~~Group and document the ~20 ad-hoc scripts~~ — done: `scripts/README.md`, grouped by whether anything runs them | 🟢 |
| 24a | ~~Remove the `VITE_*_API_KEY` defaults in `settings.svelte.ts`~~ — done: the fallbacks are gone and two tests guard against their return | 🟢 |
| 24b | ~~Audit remaining `env.*` reads against `.env.example`~~ — done: audited, `PORT` added, and a test now enforces it | 🟢 |
| 24c | ~~Parse exchange responses with `safeJsonParse`, not `response.json()`~~ — done: all 11 exchange sites go through `readExchangeJson`, proven end-to-end | 🟢 |
| 24d | ~~Consider the same for `external/cmc`~~ — considered and **declined**, with the reasoning recorded at the call site | 🟢 |
| 24e | **Decide the fate of the committed imgbb API key** — moved to [`docs/TODO.md`](TODO.md), since it needs a person rather than a plan. The key must be rotated at imgbb regardless of the outcome | ⚪ |
| 24f | ~~Add a concurrency lock to `deploy.sh`~~ — done: `flock` on `.deploy.lock`, proven with concurrent runs | 🟢 |

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
