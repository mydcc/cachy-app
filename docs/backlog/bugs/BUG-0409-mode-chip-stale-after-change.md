---
id: BUG-0409
title: Mode chip stays stale or shows never-real combos after a mode change
type: bug
status: specced
priority: P0
milestone: M4
editions: [community, pro, private]
area: exchange
data_class: A
adr: none
depends_on: [FEAT-0068]
---

# BUG-0409 — Mode chip stays stale or shows never-real combos after a mode change

## Symptom

Two live-account observations (Bitunix, `develop` @ Sep 2026), both with the
write itself succeeding — toast shown, broker applied:

1. Cachy Iso/One-Way changed to Iso/Hedge in Cachy. Broker holds Iso/Hedge.
   The chip keeps showing Iso/One-Way. No reload, no correction.
2. Broker set to Cross/One-Way externally. Cachy shows Cross/Hedge — a
   combination that never existed anywhere. Setting Cross/One-Way in Cachy
   applies at the broker, but the chip still shows Cross/Hedge.

The Network tab proves the transport works: `POST /api/account-settings`
returns 200 (twice observed) and the broker applies the change. The fault is
isolated to the read-back/display half. The 304s in the same log are Vite dev
conditional GETs for source modules — POSTs are never cached, so they are
unrelated.

The trap (reporter): anything changed at the broker between two Cachy
interactions leaves Cachy showing pre-change values with no indication —
the next Cachy write then diffs and confirms against stale state, so the
trader cannot tell what is actually about to change.

## Reproduction

Test 1 (own write, stale chip):

1. Live account, Bitunix, chip shows Iso/One-Way.
2. Open the mode chip, pick Iso/Hedge, confirm twice (policy default on).
3. Toast confirms; broker holds Iso/Hedge (verified in the broker app).
4. Chip still shows Iso/One-Way until a page reload.

Test 2 (Frankenstein combo):

1. Broker set to Cross/One-Way externally; Cachy shows Cross/Hedge.
2. Set Cross/One-Way in Cachy; broker applies it (verified).
3. Chip still shows Cross/Hedge until a page reload.

## Cause

Three mechanisms, evidence-graded:

1. **Proven (code): the post-write re-read fails silently.** After a margin
   write, `TradeService.fetchLeverageMarginMode` re-reads
   (`src/services/tradeService.ts:347-380`): schema mismatch, stale session
   or failed request all `return` into `logger` only — no toast, chip keeps
   the old value. After a position write, `changePositionMode` only calls
   `accountState.requestSync()` (`tradeService.ts:534-537`), which is a
   no-op unless `PositionsSidebar` mounted a sync callback, and a failed
   `fetchAccount` leaves `positionMode` untouched just as silently
   (`PositionsSidebar.svelte:504-577`).
2. **Proven (code): the halves have independent timelines.** The chip renders
   `tradeState.remoteMarginMode` beside `accountState.positionMode`, each
   refreshed by its own trigger. Any skew composes a combination no venue
   ever reported — Cross/Hedge in Test 2 is margin-truth from one era next
   to position-truth from another.
3. **Hypothesis (needs runtime proof): read-after-write staleness at the
   venue.** If Bitunix propagates account changes with delay, even a
   successful immediate re-read returns pre-write values and only a later
   read (reload) shows the truth. Consistent with all observations,
   unprovable from code. Evidence needed: timestamped `/api/account` and
   `/api/leverage-margin-mode` bodies in the seconds after a write.

Rejected: request shape/validation on the write (the 200s disprove it),
service-worker/304 caching (POSTs return 200; the 304s are dev module
reloads), missing credentials (reads with the same keys succeed).

## Expected

- After a confirmed write, the chip shows broker truth without a reload:
  retry the read-back on stale/missing values (bounded, event-driven — no
  polling loop), and surface a re-read that keeps failing instead of
  logging it away.
- The chip never composes halves from different eras: snapshot both halves
  from one read generation, or mark a half unknown rather than pairing it
  with a stale other half.
- Out of scope: a live push channel (no venue supports settings pushes —
  external changes surface on chip-open/mount, documented), asset mode
  (`FEAT-0332`), contract unit and multi-trade (IDEA-0407, IDEA-0408).

## Fix direction (agreed with reporter Sep 2026)

Event-driven refresh, no polling. Refresh what the moment needs, where
the trader is already looking:

Must refresh (money or truth depends on it):

- Symbol change: different symbol, different leverage/modes — always.
- Chip open (mode/leverage): whoever opens it is about to read or change
  a value — truth must be there first.
- Order arming: first real entry/size input — sizing maths runs on
  leverage, so refresh leverage plus balance once, debounced.
- Pre-order gate: already exists (FEAT-0011), stays the last word before
  money moves.
- Window focus return: catches broker-app changes made in between (the
  reported trap) with one read.
- Account switch: already rotates and refetches, stays.

Explicitly not triggers: TP/SL input (independent of modes/leverage)
and timeframe change (chart-local) — refreshing account state there
burns requests with zero benefit. Well under the venue limit
(10 req/s/endpoint) since everything above is event-driven.

## Notes

Fix groundwork exists uncommitted on `fix/margin-mode-display`: mount/init
reads, a WS-drift bridge, read-on-open, a frozen dialog baseline and a
self-serve `fetchPositionMode` (9 files, ~190 targeted tests green). It
narrows every silent gap above except a venue-side propagation delay, which
only bounded read-back retries can cover.

## Appendix — broker mode screens not yet covered in Cachy

Screenshots from the broker app (Sep 2026), transcribed because images
cannot live in this file. The reporter's point: the mode area is not
finished — Cachy covers 2 of 5 sibling settings below.

1. **Margin Mode tab** — Margin: Cross (one shared pool feeding Position A
   and B) vs Isolated (separate Margin A/B, each with its own position),
   each with an "Apply to all pairs" checkbox. Below it, **Multi-Trade**:
   Off (Trade 1 + Trade 2 merge into One Position) vs On (Position A and B
   stay separate), "switchable anytime without closing positions, new
   orders only". Cachy: Cross/Isolated covered by the chip; Multi-Trade
   missing entirely → IDEA-0408.
2. **Contract Unit tab** — By Qty (BTC), By Cost (USDT, selected: "enter
   the margin you want to use, leverage affects position value"), By
   Position Size (USDT: "enter the position value, leverage affects
   required margin"). Pure order-entry unit, no venue endpoint. Cachy:
   missing → IDEA-0407.
3. **Asset Mode tab** — Banner: "switchable while holding positions or
   open orders". Single-Asset (USDT → USDT-M contracts, USDC → USDC-M
   contracts) vs Multi-Assets (BTC/ETH/USDT into one margin pool backing
   USDT-M, USDC-M and Coin-M contracts). Cachy: missing → FEAT-0332
   (specced; API research still open).
4. **Position Mode tab** — One-Way (selected: only one-way positions per
   futures coin pair) vs Hedge (long and short within one pair, hedging
   across its positions). Note: change refused with open positions or
   pending orders in USDT-M futures; applies to all pairs under USDT-M.
   Cachy: covered by the chip — this bug's stale display is about exactly
   this control.

## Investigation (for the fixing agent — code only, nothing changed)

Checked and ruled out:

- Write transport: live 200s on `POST /api/account-settings`, broker
  applies; request schema, route validation and venue mapping verified
  against current code — shapes match.
- 304/service-worker: Vite dev conditional GETs for source modules only;
  API calls are POSTs returning 200.
- Credentials/token: reads with the same keys succeed, so keys and client
  token are fine.
- Adapter gates: a visible chip implies `supports.accountSettings`
  (bitunix); bitget reads resolve locally by design (FEAT-0229 table).
- Policy second confirm (#2541, intended, toggleable): silent only when
  declined or unseen — needs the reporter's observation, not code.
- Envelope shape (BUG-0060, done): mapper passes `positionMode` through.
- No duplicate item: backlog searched for mode-chip staleness, none found.

 ruled out later (2026-09-08 review):

- String-vs-number leverage: the server route
  (`src/routes/api/leverage-margin-mode/+server.ts`) coerces with
  `Number(data.leverage)` before responding, so the client-side
  `z.number()` schema cannot fail on stringified numbers. Dead end.
- Toast visibility: `ToastContainer` is mounted globally
  (`src/routes/+layout.svelte:578`), so every failure that toasts is
  visible. A strictly silent attempt therefore never reaches a toast —
  it stops at: disabled Confirm, declined/unseen policy dialog, a
  hanging `modalState.show` promise, or an empty `changes` diff.

Fragilities found (fix candidates, ranked):

1. All-or-nothing read schema: `BitunixLeverageMarginModeSchema`
   (`src/types/apiSchemas.ts`) requires `leverage: z.number()` — one
   off-spec field (e.g. a stringified number from the venue) discards the
   whole read, `marginMode` included. Docs show numbers; the wire may
   vary. Harden with coercion plus per-field fallback.
2. Silent re-reads: `fetchLeverageMarginMode` failure → `logger` only
   (`tradeService.ts:365-380`); sidebar `fetchAccount` failure keeps the
   old `positionMode`; `requestSync()` without a mounted sidebar is a
   no-op. Nothing reaches a toast.
3. Sidebar-only position source (on `develop`): the chip's right half has
   no read of its own. Groundwork uncommitted on
   `fix/margin-mode-display` (`fetchPositionMode`, ~190 targeted tests).
4. Independent timelines per half → never-real combos (needs an atomic
   snapshot decision, product side).
5. No venue push channel for settings — push chain audited 2026-09-08
   (`docs/bitunix-api/08_websocket.md`, `bitunixWs.ts`, `account.svelte.ts`):
   (a) The venue pushes only EVENTS: order create/fill/cancel (order and
   position channels), balance updates (wallet). No settings/mode channel
   exists. A mode change on an empty account — the normal case — produces
   no event at all, so physically nothing can arrive. Not a Cachy bug.
   (b) Cachy subscribes to all four private channels after login, but only
   with keys AND `entitlement.capabilities.marketData`
   (`bitunixWs.ts:504-507,1158`). Without that, zero pushes of any kind.
   (c) Arriving pushes DO carry modes per object (order: `positionType`,
   `positionMode`, `leverage`; position: `marginMode`, `leverage`), but
   `updatePositionFromWs`/`updateOrderFromWs` file them onto the position/
   order objects only — never onto the chip sources
   (`tradeState.remote*`, `accountState.positionMode`). That last hop is
   the Cachy-side gap.
   Decisive user test: do open positions/orders update live in Cachy, or
   also only after reload? Live positions + stale chip = mapping gap (c).
   Stale positions too = private socket never connects (b) — check keys,
   entitlement, console WS errors.

Ruled out 2026-09-08 (code): no spurious wipe exists. `computeKeys`
(`appEffects.svelte.ts`) is a stable string — rotation (which only
discards in-flight reads) fires solely on real provider/account/keys
changes. `resetInputs` does wipe remote values via
`INITIAL_TRADE_STATE`, but only on explicit user reset (button, hotkey,
AI). The endpoint itself answers correctly minutes later (reporter
capture post-reload: `BTCUSDT/USDT leverage 19 ISOLATION`), so neither
the route nor the schema is broken per se.

Remaining prime mechanism: the immediate post-write re-read returns
pre-write values (venue propagation delay) and nothing ever retries —
with no mount read on `develop`, the stale values freeze until reload.
Needs the timestamp pairing below to close.

Runtime evidence still needed (reporter's browser):

1. Timestamped bodies of `/api/account` and `/api/leverage-margin-mode`
   in the ~10 s after a mode write — stale or fresh?
2. Console line `[TradeService] Invalid leverage/margin-mode response`
   present? (proves schema fragility #1).
3. Cachy build/version, provider, positions/orders open during the test,
   sidebar visible?
4. Does the policy second-confirm dialog appear on every attempt?
   (Decisive: with working toasts, a missing dialog is the only
   remaining silent stop before transport.)
5. Any error toasts during the ~30 attempts? (Word for word.)

## Prime mechanism (code-proven, matches all observations)

`PositionsSidebar` mounts TWICE — desktop (`+page.svelte:297`, CSS-hidden
below xl) and mobile (`+page.svelte:702`, CSS-hidden at xl and up).
CSS-hidden is still mounted: both instances run their mount fetch, both
run their keys-change effect, each POSTs `/api/account` independently,
and both share one `syncCallback` slot (`registerSyncCallback` overwrites).
There is no response ordering anywhere — only the session guard, which
covers account switches, not overlapping reads. Last response wins, so a
slow pre-write fetch landing after a fast post-write fetch overwrites
fresh values with stale ones. This single mechanism explains: the fresh
ONE_WAY response sitting in Network next to a Hedge chip, the 2-in-30
intermittency, Frankenstein combos (halves refreshed by different
losers of overlapping races), and why reloads only sometimes help.
Reporter confirmation 2026-09-08 (desktop): after reload, FIVE
identical `POST /api/account` (1.1 kB each) fire within 1.25 s
(572/621/989/1070/1250 ms, filter `account`). The codebase has exactly
ONE caller of that route (`PositionsSidebar.fetchAccount`), so one code
path fires concurrently and redundantly — consistent with two mounted
instances (desktop + mobile, the latter CSS-hidden on desktop but alive)
times mount plus channels-ready effects. Timing sequence reported: one
account row around modal-open (no fetch is wired to opening the dialog
in current code — a concurrent leftover), then `account-settings`
(write) plus a second `account` (the sync refresh) right after confirm.
Which of the overlapping responses lands last decides the chip — the
race, not the write, is what the trader sees.
Fix direction (for the fixing agent): single-flight the account fetch
(one owner) and/or sequence responses so a stale one can never overwrite
a fresher one; consider not fetching from the CSS-hidden instance.

## Ruled out 2026-09-08 (flicker + persistence)

Reporter: after reload the old value flashes briefly, then fresh values
overwrite within milliseconds. Not a bug: trade-store persistence
explicitly deletes all remote fields before saving
(`trade.svelte.ts:389-398`, "a timestamp restored from disk would claim
the account state was confirmed in a previous session"), and
`account.svelte.ts` persists nothing. The flash is the persisted LOCAL
draft (e.g. leverage input) handing over to the arriving broker value.
It proves the opposite of staleness: reads land fast and fresh after
reload. Venue-delay hypothesis weakened accordingly — the prime
mechanism stays the unsequenced overlapping reads (BUG-0412) plus
silent re-read drops.

Open: reporter never saw the policy second-confirm dialog — toggle
state (`margin-mode-change` in Settings → Confirmation) unchecked.
If OFF, writes go direct (no second dialog by design); if ON and no
dialog appears, `modalState.show` is broken in their env.
Resolved 2026-09-08: reporter never saw a second dialog in ~30 tries,
flow is always click → modal Confirm → toast, and writes demonstrably
fire (200s). Conclusion: their `margin-mode-change` toggle is OFF (or
the dialog is skipped equivalent) — the policy dialog is ruled OUT as
the silent stop for this reporter. Silent attempts stop later: empty
diff, dropped re-read, or lost race.

## Complete read-trigger map (develop, verified Sep 2026)

`leverage-margin-mode` fires on: analysis/symbol selection
(`app.fetchAllAnalysisData`, `app.ts:584-601`, fire-and-forget),
order-submit stale-gate (`PlaceOrderPanel.svelte:257`), post-write
re-reads (`changeLeverage`/`changeMarginMode`). Never on mount, never
on modal-open. `account` fires only from `PositionsSidebar.fetchAccount`
(mount/keys/channels/sync per instance). Reporter screenshot (reload +
filter `api/`): all three rows (`leverage-margin-mode` 460 ms,
`positions` 457 ms, `account` 492 ms) are page-load time — the modal
was opened visibly later, so the rows were attributed to modal-open by
mistake. Nothing reads at modal-open in current code.

## Resolved: rows at modal-open came from the uncommitted fix branch

2026-09-08, initiator stack (reporter screenshot):
`click_1 @ ExchangeAccountControls.svelte:548` → `requestSync` →
sidebar sync → `fetchPositions`. Line 548 in the
`fix/margin-mode-display` worktree is exactly
`accountState.requestSync()` inside the chip-open handler (read-on-open
fix) plus `fetchLeverageMarginMode` two lines above — all three rows
explained. Pure `develop` wires nothing to modal-open (verified line
403, only `modeOpen = true`). Conclusion: the reporter runs `npm run
dev` from the fix worktree, not from the main checkout — recent
observations (full `Cross • Hedge` chip, working picks) ran WITH the
uncommitted display fixes. Corrections this forces: (a) remaining
staleness happens DESPITE mount/init reads, bridge, read-on-open,
frozen baseline and self-serve position read — the surviving causes
narrow to the unsequenced overlapping reads (BUG-0412), silent
re-read drops, or venue-side delay; (b) any `develop`-only statement
above drawn from the last days of observations needs re-verification
against the main checkout before the fix.

## Clean-room results (dev.cachy.app = pure develop, Sep 2026)

- Test A (own write): position mode change works — toast plus
  immediately visible change. Own-write staleness is INTERMITTENT, not
  constant: with sidebar mounted and no overlapping stale fetch, the
  sync path delivers.
- Test B (external write): chip never moves alone. No push, no polling —
  confirmed on a clean build. External sync needs an explicit trigger.
- Test C (reload, filter `api/account`): exactly 2 POSTs — the two
  mounted sidebars (BUG-0412), each fetching once. Narrower than the
  earlier 5-burst (which included keys/channels refires), same root.
- Fix order implied: sequence the reads FIRST (BUG-0412 — single-flight
  or ordered responses), then re-test staleness before adding retries.
  Retries on top of an unsequenced race only add more racers — the
  uncommitted `fix/margin-mode-display` groundwork (extra read triggers)
  likely widened the race window it meant to close.

## Live split (dev.cachy.app, Sep 2026): position applies, margin does not

Reporter: Hedge/One-Way changes apply correctly (toast, broker, chip);
Cross/Isolated never changes in Cachy. Prime suspect, structural: the
dialog diffs drafts against LIVE props (`MarginModeModal.svelte`,
`marginChanged = draft !== currentMarginMode`). Any refresh landing
mid-dialog (analysis burst, sidebar refire — both proven frequent)
equalizes draft and current for the margin half, so Confirm sends
`{marginMode: undefined, positionMode: X}` — position always travels,
margin is silently dropped. The position half cannot suffer the same
fate in the same way (its source refreshes through a different path).
Distinguishing test open: margin-ONLY pick → Network `account-settings`
body — `marginMode` absent proves the eaten pick (client-side);
present with 200 proves broker-applied plus display-only staleness.

## Margin-only pick sends nothing (dev.cachy.app, Sep 2026)

Reporter: margin-ONLY pick (Isolated, position untouched) → Confirm →
NO `account-settings` row at all. Reopened modal: neither margin card
highlighted, One-way highlighted. So at send time EITHER `onconfirm`
never fired (Confirm disabled — but then the pick could not enable it
unless current already equaled it, contradicting the missing
highlight) OR `confirmModes` skipped silently (`busy` stuck from an
earlier hung attempt — `if (busy) return` with no toast; `!symbol`;
`marginModeReason` — but no reason paragraph renders and buttons look
enabled) OR the write threw before fetch with an unnoticed toast
(adapter refusal path).
Reporter answers: button ACTIVE, modal CLOSED, no toast, no console
error. Wiring verified (`onconfirm={confirmModes}`, main checkout
clean). Remaining two: silent skip before fetch (`busy` stuck from an
earlier hung attempt, empty `symbol`, hidden reason) vs list cleared
after send (reload/navigation wiping Network without Preserve log).
Distinguishing test (Preserve log): no row even with log kept —
nothing is sent, nothing reloads. Reporter: button ACTIVE, modal
closed afterwards, no toast, no console error. Ruled out since:
stuck `busy` (would disable the chip too), visible reason (none
renders, buttons pickable), thrown error (always toasts), policy
dialog hang (would leave the modal open), form submit (both buttons
`type="button"`), wrong wiring (`onconfirm={confirmModes}` verified),
stray edits (main checkout clean). What remains is invisible at
runtime: the `if (changes.marginMode && symbol && !marginModeReason)`
gate evaluating false despite an enabled button — i.e. `symbol` empty
or reason flipped in the same tick, or `changes` emptied between
render and handler. Decisive: breakpoint INSIDE `confirmModes`
(`ExchangeAccountControls.svelte`, at the margin `if`) and read
`changes`/`symbol`/`marginModeReason`/`busy` from the Scope panel. Reopen-unhighlighted means the seed
(`currentMarginMode`) is undefined or a non-matching case at that
moment — NOT the uppercase value the venue returns. Open: button
enabled/disabled at click, modal closed or stayed open, any toast
(incl. error text), console errors.

## Filter discipline (reporter uses `accoun`)

Substring `accoun` matches `account`, `account-settings`,
`accounts.ts`, `*Account*.svelte.ts` — but NOT `leverage-margin-mode`
or `positions`. Consequences: "no account-settings row" claims stand
(it would match); any "no leverage-margin-mode row" claim needs a
re-check with cleared filter before it counts as evidence. Going
forward: note the active filter with every Network observation.

## Split: position-only always sends, margin never does (Sep 2026)

Reporter: position changes apply every time; any attempt involving
margin sends NOTHING (no row, silent close, active button). Same
function, adjacent `if`s — position needs no symbol, margin needs
`symbol` non-empty plus no reason. Reasons render visibly (none seen)
and disable the cards (picks work), so the surviving suspect is an
empty/unset `tradeState.symbol` in that session: reads guarded or
failing (no `leverage-margin-mode` rows with clear filter), modal seeds
undefined (no card highlighted), confirm skips silently, chip shows
leftovers or "—". Corroborating questions open: exact chip text now,
symbol field content, open orders present?

## Prime suspect: stale app shell served to the browser

Reporter screenshot (live): leverage chip 19x, margin half "—",
position half truncated One-Way, Positions (0), Orders (0). Active
Confirm, closed modal, no toast, no console error, NO request row —
with all code paths verified, an actually-sent write MUST leave a row.
The remaining consistent explanation is not in the code at all: the
browser executes a STALE bundle. A service worker IS active on the
reporter's dev origin (DevTools initiator `service-worker.ts:85`;
`src/service-worker.ts` ignores POST and `/api/*` but serves cached
GET build assets). API traffic then looks perfectly healthy while the
running UI predates the verified source — matching "impossible"
observations (no row despite wired Confirm, values no source version
produces). Decisive test: DevTools → Application → Service Workers →
unregister everything for the origin → hard reload → repeat the
margin-only pick. If the row appears, the code was never at fault in
this session.

## Prime suspect: unseen policy dialog blocks margin only

Stale bundle ruled out (SW unregistered, hard reload, same result).
Standing: margin never sends (no row ever), position always sends,
button active, modal closed afterwards, no toast, no console error.
Position-only changes never need the policy dialog (`modeNeedsAsking`
requires a margin change); margin changes need it whenever the
`margin-mode-change` toggle is ON. An UNSEEN second dialog explains
the split exactly: margin waits forever on an unconfirmed dialog
(no row, no toast, modal left open for the user to close), position
flows untouched. It also explains Test A on dev.cachy.app (position
needs no dialog on any toggle state) and the generic `modesChanged`
toast proving nothing about the margin half. Open: toggle state in
the reporter's Settings → Confirmation. Hidden-dialog ruled OUT:
both windows share WindowManager's counter from the same base
(`BASE_Z_INDEX` 11000, `WindowManager.svelte.ts:56,392,430`), so a
later confirm dialog renders ABOVE the mode modal — it would be seen.
"Never seen" therefore means it never opened: toggle OFF, or the
margin diff was already empty at send time.

## Open: active confirmation toggles appear dead

Reporter: the three ACTIVE confirmation toggles (margin/position
section of Settings → Trading → Confirmation) seem dead — flipping
them changes nothing observable. Store wiring verified in code
(`ConfirmationSettings.svelte:62` writes via `setRequired` with
persist; `requires()` reads the same store; gated-but-unwired order
toggles are deliberately disabled with a warning note — those are not
the complaint). Unverified: persisted round-trip in the reporter's
browser (flip → reload → still flipped?) and the displayed state of
the margin toggle (ON would demand the never-seen second dialog).
Moved on per reporter instruction; needs one look, not analysis.
Reporter test 2026-09-08: toggles behave dead as stated. `Toggle.svelte`
itself verified (one-way `checked` in, DOM truth out via `onchange`,
disabled class blocks pointer) — the chain UI → store → persist →
`requires()` is code-correct end to end. Unresolved without eyes:
displayed state vs effective state (shows ON but acts OFF, or shows
OFF and acts accordingly). Names declined by reporter ("weiter").
Reporter retest: toggles have no effect. Remaining prime suspect:
per-origin storage. Policy persists in the browser's localStorage,
which is SEPARATE per address — flipping on localhost:5173 does
nothing on dev.cachy.app and vice versa, and the reporter tests on
both. Second suspect: persist failure (UI would show the red
`persistFailed` note — unconfirmed). Ruled out: toggle component,
store write/read path, gated-shortcircuit (margin-mode-change is not
gated, `requires()` returns the stored value).

## Evidence log

- 2026-09-08, reporter (live account): `/api/account` body captured after
  a Cachy → One-Way write (toast shown, broker app shows One-Way) still
  returns `"positionMode": "HEDGE"` (full body archived in the report
  thread). The chip shows exactly what the API returns — the display chain
  is faithful, the venue answer lags the broker app. Supports cause
  hypothesis 3 (read-after-write delay). Still open: timestamp pairing
  (toast time vs response time), the `leverage-margin-mode` twin response,
  and one repetition (there and back).
  ```json
  { "success": true, "data": { "marginCoin": "USDT", "positionMode": "HEDGE" } }
  ```
- 2026-09-08, reporter (live account): leverage change 10 → 20 closes the
  dialog silently — no toast, no broker traffic, console empty. Code path:
  `confirmLeverage` takes the `localOnly` branch
  (`ExchangeAccountControls.svelte`), which by design reports nothing.
  `localOnly` is `paperState.enabled || remoteLeverage === undefined`;
  paper is off (mode writes reach the broker), so `remoteLeverage` never
  arrives: the `/api/leverage-margin-mode` read delivers nothing in the
  reporter's env while `/api/account` answers. Same route feeds the
  margin half — one dead read explains the whole frozen left side.
  (The chip DID show margin values before, so the read worked at least
  once — intermittent or symbol-dependent, still open.)
- Design gap found on the way: the local-only fallback is
  indistinguishable from a failure — no hint that the input stayed local
  planning. A visible marker belongs in the fix.

## Links

- [`FEAT-0068`](../features/FEAT-0068-bitunix-account-settings.md) — the write path this drifts from
- [`FEAT-0024`](../features/FEAT-0024-confirmation-policy.md) — the second confirm in front of the write
- [`FEAT-0332`](../features/FEAT-0332-asset-mode.md) — asset mode stays separate
- [`BUG-0060`](./BUG-0060-positions-account-envelope-mismatch.md) — envelope shape, done
- [`BUG-0062`](./BUG-0062-hedge-mode-close-position-fails.md) — hedge-mode handling history, done
- [`IDEA-0199`](../ideas/IDEA-0199-bitunix-ui-analysis.md) — screenshot-derived UI analysis, done
