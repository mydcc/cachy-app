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

### Code health

| # | Item | Status |
| --- | --- | --- |
| 18 | ~~Fix the pre-existing test failures~~ — done: **28 → 0**. The gate suite passes (821 tests) and CI runs all of it instead of three hand-picked files. Wall-clock benchmarks moved to a non-blocking job — see below | 🟢 |
| 19 | ~~Attach `cause` to rethrown errors~~ — done: all 10 sites in `apiService.ts`, `tradeService.ts`, `news/+server.ts` and `storageUtils.ts` now chain the original failure | 🟢 |
| 20 | ~~Burn down the 112 ESLint errors, then make lint a required CI check~~ — done: 0 errors, lint is now a required check | 🟢 |
| 21 | Burn down the remaining 809 `no-explicit-any` / `no-unused-vars` warnings, lowering the CI ceiling as you go, then restore both rules to `error` | 🟡 |
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
