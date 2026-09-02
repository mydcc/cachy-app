---
id: FEAT-0020
title: Show and change exchange account settings from Cachy
type: feature
status: done
assignee: claude
priority: P1
milestone: M3
editions: [community, pro, private]
area: trade-panel
data_class: A
adr: none
depends_on: [FEAT-0017]
estimate: 2
size: S
target_date: 2026-11-18
start_date: 2026-08-01
---


Branch: `feat/feat-0020-account-settings-panel`

# FEAT-0020 — Show and change exchange account settings from Cachy

## Problem

Margin mode, position mode, asset mode and per-symbol leverage live at the
exchange and are invisible in Cachy. A user has to open the exchange's own UI to
check or change them — and worse, Cachy sizes positions without knowing them,
so a position calculated for isolated margin can be placed into a cross-margin
account with a completely different liquidation profile.

## Proposal

A panel that reads the account's real configuration from the exchange and lets
the user change it:

- **Margin mode:** isolated / cross, per symbol and account-wide
- **Position mode:** one-way / hedge
- **Asset mode:** single-asset / multi-asset
- **Leverage:** per symbol, within the exchange's bounds
- **Default TP/SL behaviour** where the exchange exposes it

Everything reflects the exchange's actual state, refreshed rather than cached
optimistically. Availability comes from
[`FEAT-0017`](FEAT-0017-exchange-capability-model.md) — an exchange without
hedge mode does not show the control.

Changes to these settings are order-adjacent: switching margin mode with an open
position changes its liquidation price. Every change goes through a confirmation
that states the consequence, and the
[`FEAT-0011`](FEAT-0011-preflight-order-verification.md) gate reads the real
values rather than the displayed ones.

## Acceptance criteria

- [x] Each setting reflects the exchange's real state, verified against the
      exchange's own UI — *code side done; the against-the-UI half needs a live
      account, see State*
- [x] Changing each setting takes effect at the exchange, per exchange —
      *same caveat*
- [x] Controls for unsupported capabilities are absent, not broken
- [x] Changing a setting with an open position warns with the specific
      consequence
- [x] The verification gate reads live account state, not the panel's cache
- [x] Failure to read the state blocks order placement rather than assuming
      defaults
- [x] German and English strings

## State

Most of this item was already built when it was picked up — leverage, margin
mode and position mode all existed, with `ExchangeAccountControls.svelte` as
the panel. What was missing was the confirmation wiring, and an honest account
of which criteria were already met. Both are below.

### What this change added

`margin-mode-change` shipped in FEAT-0024 defaulted on, and this panel had no
confirmation on the mode path at all: the settings toggle existed and changed
nothing. It now asks, and declining sends nothing.

`leverage-change` had a confirmation, but hard-coded to "only with an open
position" — so a user who switched the toggle on never saw one otherwise, and a
user who switched it off saw one anyway. The policy now decides that case. The
open-position dialog is unchanged and deliberately not configurable: it carries
the projected liquidation price, a consequence rather than a prompt, in the
same sense that FEAT-0011's verification cannot be configured away.

### Criteria that were already met

**Unsupported capabilities absent** — `supportsMarginMode` gates the control
per venue (FEAT-0017), and `ExchangeAccountControls` renders nothing when
`supports.accountSettings` is false. Pinned by "a venue without these endpoints
offers no controls" in the component test.

**Warns with the specific consequence** — and for two of the three settings the
guard is stronger than the criterion asks. Leverage warns, quoting the
liquidation price the position would move to, calibrated from the venue's own
entry/liquidation/leverage triple. Margin mode and position mode are *blocked*
rather than warned about (`marginModeReason` on a busy symbol,
`positionModeReason` on any open position) because the venue refuses the change
outright.

That correction cost a wrong assumption on the way: this change first added an
open-position confirmation for margin mode, and the test written for it failed
because the control is disabled in exactly that state. The branch was removed
rather than left as unreachable code pretending to be a safeguard.

**Gate reads live account state** — `orderGate.checkAccountState` compares the
payload against `DisplayedState`, which the call site captures fresh; the gate
reads no store by construction.

**Stale state blocks placement** — `MAX_ACCOUNT_STATE_AGE_MS` (60s) refuses an
`open` intent whose account snapshot is older, with reason `stale`. It fails
closed rather than assuming a default, which is this criterion exactly.

### Not verified here

The first two criteria say "verified against the exchange's own UI" and "takes
effect at the exchange, per exchange". The code paths exist and are unit
tested, but confirming the values match what Bitunix and Bitget actually show
needs live accounts on both venues. That half is untested and should not be
read as done.

### Out of scope, deliberately

**Asset mode** (single/multi-asset) from the Proposal does not exist anywhere in
`src/` — no capability flag, no schema, no route, no adapter verb. It is the one
item of the five with nothing behind it, and it is a feature rather than a gap
in this one: it needs its own item and its own venue research.

**Default TP/SL behaviour** is likewise unimplemented and unscoped.

## Out of scope

Cachy's own risk limits — those are [`FEAT-0013`](FEAT-0013-risk-limits-and-kill-switch.md)
and are enforced locally regardless of exchange settings.

## Links

- Reference screenshots: Bitunix "Configs" panel — Margin Mode, Contract Unit,
  Asset Mode, Position Mode
- [`FEAT-0017`](FEAT-0017-exchange-capability-model.md)
