---
id: FEAT-0013
title: Enforce hard risk limits and a kill switch at the execution boundary
type: feature
status: done
branch: claude/feat-0011-erledigen-k3fht2
priority: P0
milestone: M1
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
estimate: 2
size: S
target_date: 2026-10-09
---

# FEAT-0013 — Enforce hard risk limits and a kill switch at the execution boundary

## Problem

Nothing stops a sequence of individually plausible orders from adding up to a
loss the user never intended, and there is no single action that stops all
outgoing order traffic. Risk today is a number in a form, enforced by the user's
attention.

## Proposal

**Limits**, configured once and enforced where orders leave, not where they are
entered:

- max position size (absolute and as a share of account equity)
- max leverage
- max loss per trade
- max loss per day, measured against realised PnL
- max concurrent open positions

**A kill switch**: one action that blocks every outgoing order immediately,
survives a reload, and requires a deliberate action to clear. It blocks new
orders and modifications; it does **not** close positions — an automatic
liquidation triggered by a panic button is a way to turn a scare into a loss.

Limits and the switch are checked inside the [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)
gate, so nothing can route around them.

Both are Class A: limits are settings, the daily-loss figure derives from the
journal. Neither leaves the device.

## Acceptance criteria

- [x] Each limit has a test that submits an order exceeding it and asserts
      refusal with the limit named
- [x] Limits are enforced at the gate, not in the form — proven by a test that
      constructs an over-limit order programmatically
- [x] The kill switch blocks a live submission attempt, asserted with no
      outbound request
- [x] The switch survives reload
- [x] Clearing it requires an explicit confirmation
- [x] The daily-loss counter is computed with `Decimal` and resets on a defined
      boundary stated in this item
- [x] Limit and switch state never leave the device
- [x] German and English strings

## Out of scope

- Automatic position closing on breach. Deliberate — see above.
- Exchange-side risk settings. Those are [`FEAT-0020`](FEAT-0020-account-settings-panel.md).

## Resolved questions

- **Which timezone does "per day" use?** → **The UTC day, 00:00 to 00:00.**
  Journal entries are stamped as ISO strings and exchange fills arrive in UTC,
  so a UTC window is the one that agrees with the records it is measured
  against. A local window in a DST-observing zone has a 23-hour and a 25-hour
  day each year, and the 25-hour one silently widens the limit. And a fixed
  boundary is reproducible — two people reading the same journal get the same
  number.

  The cost is real: a trader at UTC+13 sees the counter reset mid-evening. The
  settings panel therefore states the boundary and shows the next reset in
  local time, so it is never a surprise. `utcDayStart()` in
  `src/services/rmsService.ts` is the single definition.
- **Does the daily limit count paper trades?** → **No**, and structurally so.
  `JournalEntry.isPaper` exists as of this item, and `realizedPnlToday()`
  filters on it explicitly. FEAT-0012 sets the flag when it lands; the
  exclusion does not depend on paper trades happening never to reach the
  journal, because an incidental exclusion is one refactor away from being
  none at all.
- **Trailing-stop and TP/SL modifications** → **Allowed.** The rule the kill
  switch actually implements is: *block what creates or increases exposure,
  allow what can only reduce it.*
  - Blocked: opening orders, and pending-order amendments (`modify-order`),
    which can raise quantity or price on a resting order — and where
    cancelling is always available instead.
  - Allowed: closes, flash-closes, close-all, every cancel, and TP/SL plan
    modifications. A stop or target attaches to a position that already
    exists and can only ever reduce it. Deciding "tightening vs widening"
    would need the position side and mark price, and getting that wrong means
    refusing a legitimate stop move at the worst possible moment — strictly
    worse than allowing one that happens to widen.

  `rmsService.increasesExposure()` is the single definition, and it is tested
  against every intent kind.

## What shipped

- `src/stores/riskLimits.svelte.ts` — Class A store for the six limits and the
  kill switch, on its own `localStorage` key. Written synchronously on every
  change: a debounced save would mean a switch engaged moments before a reload
  comes back off, which is the one failure this feature cannot have. Releasing
  requires `releaseKillSwitch({ confirmed: true })`, so a deliberate action is
  a property of the API rather than a convention the UI is trusted to follow.
- `src/services/rmsService.ts` — the limit checks and the daily-loss counter,
  registered with the FEAT-0011 gate via `installGateHooks()`. Limits apply
  only to orders that open or increase exposure; a limit that blocked a close
  would leave the user over their limit *and* unable to get out.
- `src/services/app.ts` — installs the hooks at startup. Unregistered hooks
  mean the gate approves on those two checks, so this is not optional wiring
  and there is a test that it is present.
- `src/components/settings/RiskLimitsSettings.svelte` — a Risk sub-tab under
  Trading: the switch, today's realised PnL with the reset boundary, and the
  six limits. An empty field means "off", which is distinct from a limit of
  zero.
- `orderGate.KillSwitchCheck` now receives the intent, which is what lets the
  switch distinguish opening from closing.
- German and English strings for every limit, refusal and control.

## Follow-ups

- As with FEAT-0011, no opening-order path exists in the client yet
  (FEAT-0069), so the five order-shaped limits are covered by tests but not
  yet reached by a call site. The kill switch already has teeth on
  `modify-order`. Both engage fully when FEAT-0069 lands.
- `rmsService.validateTrade()` and `monitorRisk()` predate this item, are not
  wired to anything, and were left untouched.

## Links

- [`FEAT-0011`](FEAT-0011-preflight-order-verification.md) — the gate that calls this
- `src/services/rmsService.ts` — existing risk-management service
