---
id: FEAT-0526
title: Explain the kill switch in Settings and make its behaviour configurable
type: feature
status: in-progress
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
assignee: opencode
branch: feat/feat-0526-kill-switch-settings
---

# FEAT-0526 — Kill switch explained and configurable in Settings

## Problem

The kill switch is the one control that decides whether money can move: while
engaged it blocks everything that increases exposure and lets exits through
(`rmsService.ts::increasesExposure`). Today that rule lives only in code. A
trader who engages the switch in panic has never seen what it will and will not
do, and cannot adapt it to their own trading — e.g. a trader who never scales
in may want adds blocked, while a TP/SL-heavy trader needs modifies untouched.
An unexplained, unconfigurable money gate is itself a risk: it is either
trusted blindly or not used at all.

## Proposal

A Kill Switch section in Settings that (1) explains the rule in plain language
(DE+EN): blocked while engaged are opens, adds and non-TP/SL modifies; always
permitted are single closes, close-all, order cancels and TP/SL adjusts — and
(2) makes the behaviour configurable:

- block-scope toggles: block adds (default on), block non-TP/SL modifies
  (default on);
- confirm-before-engage (default on);
- auto-engage rules: daily-loss limit arms the switch automatically (threshold
  configurable, default off until the trader sets a value).

The asymmetry is deliberate: the switch may **engage** itself, but it is released
only by an explicit user action. Engaging restricts what may happen, so getting it
wrong costs nothing; releasing re-opens exposure, so it stays with a human. See
[Decisions](#decisions).

Every toggle states its default and takes effect without a reload. All strings
in both locales; `npm run i18n` parity stays green.

## Resolution (2026-10-28)

**The rule and its explanation share one predicate.** `rmsService.killSwitchBlocks`
is the switch's scope; `increasesExposure` stays untouched because
`checkLimits` reads it to decide which limits apply. Turning "block adds" off
narrows the switch only — the size, daily-loss and loss-per-trade caps still
check adds. `killSwitchScope()` returns the same booleans for the Settings
text, so a toggle cannot leave the prose describing the old rule; permitted
cases are stated, not merely omitted.

**Configuration** lives in `riskState` (Class A, same synchronous persist as
the switch timestamp): `blockAdds`, `blockNonTpSlModifies`, `confirmEngage`
(default on) and `autoEngageDailyLossUsdt` (empty = off, must be positive).
Missing keys in a pre-item blob read as the old rule; `resetLimits` leaves the
configuration alone.

**Auto-engage** is evaluated at the kill-switch gate hook, before the verdict,
so the order that first sees the threshold is the one refused. It compares the
day's *positive realised loss* (a green day never arms it) and refuses to guess
on an unmeasurable day (BUG-0499). A manual release records the UTC day and
suppresses auto-engage until the next one, so the human's explicit override is
not undone by the next click. Nothing releases the switch automatically —
pinned by a test that advances ten days.

The Settings status line names the real precondition (threshold, current loss,
or the concrete cause that makes today unmeasurable) instead of claiming the
switch is armed.

## Acceptance criteria

- [x] Settings shows what the switch blocks and what stays permitted, in both
      locales, matching `increasesExposure` exactly
- [x] Each block-scope toggle changes gate behaviour, proven by a test per
      toggle (gate refuses/permits the corresponding intent while engaged)
- [x] Confirm-before-engage on blocks accidental engagement, proven by a test
- [x] Auto-engage fires at the configured daily-loss threshold and not before,
      proven by a test; default off means no behaviour change for existing users
- [x] There is no automatic release path: a test engages the switch, then advances
      time and crosses every auto-engage threshold again, and asserts it stays
      engaged until an explicit user action releases it
- [x] Changing any setting never weakens the switch silently: the explanation
      text always reflects the active configuration
- [x] `npm run backlog:check` passes with this item (the index is generated on demand and never committed)

## Out of scope

- Changing the default rule itself. Defaults stay as `increasesExposure`
  defines them today; this item only exposes and explains them.
- Auto-release. Considered and dropped — see [Decisions](#decisions). There is
  no condition under which the switch releases itself.
- Server-side or cross-device sync of the configuration. Settings are Class A
  (`localStorage` only, ADR-0001) and stay there.
- The close-all panic placement (BUG-0513). That wires the exit; this item
  explains the gate in front of it.

## Decisions

- **Auto-release: none. Release is manual, always.** The proposal originally left
  the release condition open — "off by default; when on, under which condition" —
  and the acceptance criteria referred to "its stated condition" without one ever
  being stated. Decided 2026-09-27: there is no such condition, and no
  auto-release setting ships.

  A panic control that deactivates itself is a hazard rather than a convenience.
  The plausible conditions are all bad: releasing on a recovered daily P&L turns
  a number into an exposure decision made without the trader; a daily reset does
  the same thing on a schedule, at a moment nobody chose. A trader who engaged the
  switch because they were afraid of their own P&L should not find it re-opened
  while they are asleep.

  What already covers the case that auto-release would have: the switch is
  explainable and configurable (this item), and a trader who wants exposure back
  releases it themselves, which takes one deliberate action and leaves an audit
  trail. Making the restrictive direction automatic and the permissive direction
  manual is the whole point.

- **The auto-engage threshold's default value is the trader's to choose.** Carried
  over from the item's original open-questions section, which recorded it as a
  deliberate deferral rather than a gap. This item requires only that "unset"
  means "off", so a trader who never sets a value gets today's behaviour.

## Links

- `src/services/rmsService.ts::increasesExposure` — the rule being exposed
- `src/stores/riskLimits.svelte.ts::RiskManager` — engage/release ownership
- BUG-0513 — the close-all control that must stay reachable while engaged
- docs/adr/0001-local-first-boundary.md — Class A: settings never leave device
