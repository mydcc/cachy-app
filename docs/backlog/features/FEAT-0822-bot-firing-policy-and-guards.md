---
id: FEAT-0822
title: Bot firing policy and guards — every rule user-configurable, the safety floor fixed
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0026
depends_on: [FEAT-0807, FEAT-0810]
assignee: opencode
branch: feature/feat-0822-bot-firing-policy-and-guards
parent: FEAT-0805
size: L
estimate: 13
---

# FEAT-0822 — Bot firing policy and guards

## Problem

Today a bot fires at most once per evaluation and the engine's `(rule, anchor)`
semantics are invisible to the trader. Nothing lets him answer "may this bot
fire again?", "how many positions may it open?", or "why did it *not* fire?".
Two bots on the same symbol and side can race into one averaged position
(`botOrders.ts` documents the window), a refused entry can repeat on every
candle, and a fleet of twenty bots has no single lever to stop it. A platform
that manages real money cannot ship a strategy engine whose limits are implicit.

The product owner's direction (review round, 2026-11-18): the platform is
**open** — every rule the system applies must be something the user can set,
manage and see. "Exactly once" is a *default against accidental double fires*,
not a hard-coded law; a grid bot fires per level by design.

## Proposal

An explicit **"Firing & limits"** section in the bot envelope, enforced by the
engine before anything reaches `OrderGate`:

1. **Firing policy** (per bot, user-set):
   - `once` — one-shot, expires after the first entry.
   - `once_per_candle` — default; the `(rule, anchor)` guard already in the
     engine, now visible and named.
   - `multi` — deliberate re-entries up to the limits below.
   - Grid bots (FEAT-0819) fire per filled level and are not covered by the
     one-shot default.
2. **Limits** (per bot, user-set, decimal-precision):
   - max open positions (default `1`),
   - max entries per day,
   - max risk per position / total budget cap.
3. **Ownership reservation** — before an entry is submitted the bot reserves
   `(symbol, side)`; a second bot or a second fire on the same reservation is
   refused with a visible reason. (Implements ADR-0026 decision 2.)
4. **Throttling** — after a refusal (gate, size, permissions) the bot does not
   retry on every candle; one visible notice per rule and reason, as
     FEAT-0810 already demands for exit refusals.
5. **Guard log** — every suppressed or refused action is recorded with rule,
   candle and reason ("second fire suppressed: position already open",
   "limit reached: 3 entries today"), filterable, surviving reload.
6. **Kill switch** — one control per bot (and a fleet-wide variant) that
   disables new entries and, on explicit confirmation, closes owned positions
   through the existing exit path (FEAT-0810). It never touches positions it
   does not own.
7. **Open platform, fixed floor** — behavior above is fully configurable.
   The safety floor is not: a mandatory stop before arming, one `OrderGate`,
   no exposure-increasing exits (ADR-0020/0026). "Open" never means
   "safety can be switched off".

Security boundary (owner direction): no path outside the app can write or arm
a bot document; template imports are drafts that require explicit user
confirmation; provenance and versioning show who changed what.

Monitoring, three layers: state chip on every bot row (incl. a
`limit reached` state), guard events in the protocol, per-bot guard history
in the journal's per-bot review (FEAT-0812).

## Acceptance criteria

- [ ] A bot with `once_per_candle` fires at most once per closed candle even
      when the condition holds on the next evaluation; the suppressed repeat
      appears once in the guard log.
      *Delivered in halves, and only one of them is this item's: the
      within-candle suppression is real and pinned, but it happens in the
      evaluation gate's announce map (FEAT-0477, pinned in its own tests) —
      a repeat the gate withholds never reaches the lane, so it never
      reaches the guard log either. Recording gate-side suppressions in the
      ledger would need a gate→ledger notification channel the evaluation
      core deliberately does not have (it is store-free by design);
      deferring that channel rather than breaking the core's boundary.
      What the guard log DOES record, pinned in botOrders tests: the
      `once` policy's expiry after a landed entry, and every limit
      refusal.* 
- [x] A `multi` bot with `max positions: 1` refuses a second entry with a
      visible reason and stays healthy for the next legitimate exit/entry
      cycle.
      *Pinned in botOrders.test.ts (cap consulted before the book guard) and
      released for the next cycle by the reservation's settle-release test.*
- [x] Ownership reservation prevents the two-bot same-symbol-and-side race;
      the loser's refusal names the reason and is logged.
      *Unit (race + release) and e2e (botGuardExecution: one entry lands, the
      loser refused `slot-reserved` with a ledger row, no network).*
- [x] Max entries per day and the budget cap are enforced with `Decimal`
      arithmetic; hitting a limit shows `limit reached` on the row, not a
      silent stop.
      *Pure checks in botGuards.ts (Decimal end to end), the projection's
      standing-state half in botsState (day-cap pin), the chip in BotsList.*
- [x] A refusal (gate, size, permissions) produces exactly one notice per
      rule and reason — no per-candle toast loop.
      *The toast throttle stays on the sink's reported-set; the guard log
      counts every repeat per reason on the newest row (the log answers
      "why did my bot not act", the toast answers "know it now").*
- [x] The kill switch stops new entries immediately; its close-owned-positions
      variant confirms once, names what will be closed, and leaves untouched
      positions untouched.
      *Per-bot Stop with confirm-before-close (BotsList component tests);
      the fleet button stops entries only — closing stays per-bot with its
      own confirm, per the open question's proposal below.*
- [x] Every firing/limit policy is readable in the bot document (hashed), set
      in the editor (FEAT-0811), and visible in the row (FEAT-0808).
      *Document fields hashed (Rust + TS integration tests pin the identity
      and the pre-field hash), row visible (chip + guard line); the editor
      controls are FEAT-0811's deliverable, as this criterion itself names.*
- [x] Money-path tests: no native-number math, prove no double close and no
      accidental exposure increase. 👤 Human review recommended before merge.
      *Decimal quantities throughout; the race and day-cap e2e prove a
      refused firing leaves no book row behind; the no-double-close half is
      the exit lane's, pinned in FEAT-0810's e2e and carried here by the
      reservation's own release test.*

## Out of scope

- Exit conditions themselves (FEAT-0809/0810).
- The confirmation-candle entry mode (FEAT-0823) — shares the editor section.
- Multi-account separation (FEAT-0825).
- Portfolio-level limits across bots (a later decision; per-bot first).

## Decided questions

- **2026-11-19 (shipped with this item):** The fleet-wide kill switch **stops
  entries** and does not close anything by default — closing is the per-bot
  Stop's own confirm (the row asks once, names the position, and leaves
  everything else untouched). The proposal's "asks once per position group"
  remains the shape a future fleet-close control would take; it is
  deliberately not shipped here.
- **2026-11-19 (shipped with this item):** Guard events live in **their own
  log view** (`cachy_bot_guards_v1`, newest-first, one row per reason with a
  repeat count) rather than inside the firing ledger — the firing ledger
  counts attempts, the guard log answers "why did my bot not act", and
  merging them would have made the two counts indistinguishable.

## Links

- [`ADR-0026`](../../adr/0026-a-bot-owns-the-position-it-opens.md)
- [`ADR-0020`](../../adr/0020-automation-envelope-promotion-and-simulate-bots.md)
- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0807`](FEAT-0807-derive-bot-lifecycle-state.md)
- [`FEAT-0810`](FEAT-0810-execute-bot-exits-through-the-order-gate.md)
- [`FEAT-0811`](FEAT-0811-superbot-editor-for-exit-conditions.md)
- Code: `src/services/alertEngine/botOrders.ts` (in-flight guard, documented
  netting race), `src/services/orderGate.ts`
