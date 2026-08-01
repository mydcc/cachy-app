# Roadmap

What gets built, in what order, grouped by the release it is aimed at.

This document schedules; it does not specify. Every entry links to a backlog
item that holds the actual requirements. If you are about to write a paragraph
of detail here, it belongs in the item.

- **Why this order:** [`MILESTONES.md`](MILESTONES.md)
- **What each item requires:** [`backlog/INDEX.md`](backlog/INDEX.md)
- **Decisions waiting on a person:** [`TODO.md`](TODO.md)

> The previous roadmap — 4252 lines covering the engineering-foundation phase —
> is at [`archive/engineering-log-2026-h1.md`](archive/engineering-log-2026-h1.md).
> It is a work log rather than a plan, and it is worth reading before touching
> the exchange or calculation paths: it records what several changes turned out
> to break.

---

## How target versions work here

`semantic-release` owns the version numbers. Every `feat:` commit bumps the
minor automatically on merge to `develop`, so nobody decides that a release is
"1.3" — the commits decide.

The versions below are therefore **planning anchors, not promises**. Cachy will
pass through many minors inside one release group. What is fixed is the order
and the exit criteria; the number floats.

When a group completes, record the version it actually landed in. Drift is
information — a group that slipped six minors was bigger than it looked.

Current: **1.0.0-beta.6**.

---

## Release 1.0 — close out the beta

**Milestone [M0](MILESTONES.md#m0--stable-10).** No new features. The point is a
known-good line to measure everything else against.

| Item | Prio | What |
| --- | --- | --- |
| [BUG-0001](backlog/bugs/BUG-0001-bitget-ws-field-mismatch.md) | P0 | Bitget WS account sync sends fields the store never reads |
| [BUG-0002](backlog/bugs/BUG-0002-numeric-zero-target-price.md) | P0 | Trade state stores numbers where its type says strings |
| [BUG-0003](backlog/bugs/BUG-0003-oms-preserve-latest-unenforced.md) | P1 | Force-prune can evict an order it should protect |
| [BUG-0004](backlog/bugs/BUG-0004-legacy-aes-cbc-blobs.md) | P1 | Legacy credential blobs may decrypt to silent garbage |
| [BUG-0005](backlog/bugs/BUG-0005-gpu-chop-field-mismatch.md) | P2 | GPU Choppiness writes where nothing reads |
| [BUG-0006](backlog/bugs/BUG-0006-sentiment-response-unvalidated.md) | P2 | Sentiment response trusted without validation |
| [TODO 1](TODO.md) | P0 | Rotate the shared imgbb key and decide whether it stays |

**Two items need a decision before they can start.**
[BUG-0003](backlog/bugs/BUG-0003-oms-preserve-latest-unenforced.md) needs the
eviction rule chosen — the code's comments do not determine it, and guessing at
an eviction rule for live order state is worse than the current gap.
[BUG-0002](backlog/bugs/BUG-0002-numeric-zero-target-price.md) needs the
string-versus-number question settled one way or the other.

**Exit:** no open P0, the money-affecting defects fixed or accepted in writing,
`npm run check` clean, suite green, `npx eslint .` clean.

---

## Release 1.1 — safe execution

**Milestone [M1](MILESTONES.md#m1--safe-execution-foundation).** The floor
everything else stands on, and the reason nothing below this line ships first.

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0011](backlog/features/FEAT-0011-preflight-order-verification.md) | P0 | Verify every order against displayed state before transport |
| [FEAT-0013](backlog/features/FEAT-0013-risk-limits-and-kill-switch.md) | P0 | Hard risk limits and a kill switch at the execution boundary |
| [FEAT-0012](backlog/features/FEAT-0012-paper-trading-mode.md) | P0 | Paper trading on the live code path |
| [FEAT-0015](backlog/features/FEAT-0015-order-audit-trail.md) | P1 | Record every submission attempt locally |

**Build in that order.** The gate defines the seam; the limits plug into the
gate; paper mode is the same seam with a different transport; the audit trail
records what passed through it. Built the other way round, each one has to be
retrofitted into the next.

**Do the call-site enumeration once.** Both
[FEAT-0011](backlog/features/FEAT-0011-preflight-order-verification.md) and
[FEAT-0012](backlog/features/FEAT-0012-paper-trading-mode.md) need a complete
list of outbound order calls — including TP/SL and flash close, which take
different routes from ordinary orders. That list is the first task of the
release, not a step inside one item.

**Exit:** no order-placing path reaches an exchange except through the gate,
proven by a test that adds a bypassing call site and fails.

---

## Release 1.2–1.4 — broker abstraction

**Milestone [M2](MILESTONES.md#m2--broker-abstraction).** After M1, because the
verification gate defines what an adapter has to guarantee.

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0016](backlog/features/FEAT-0016-exchange-adapter-interface.md) | P1 | One adapter interface, one normalised internal shape |
| [FEAT-0017](backlog/features/FEAT-0017-exchange-capability-model.md) | P1 | Declare what each exchange can do; the UI reads it |
| [FEAT-0018](backlog/features/FEAT-0018-adapter-conformance-suite.md) | P1 | One conformance suite every adapter must pass |

[BUG-0001](backlog/bugs/BUG-0001-bitget-ws-field-mismatch.md) is fixed in 1.0 as
a stopgap and fixed *structurally* here — it exists because this abstraction is
missing.

**Exit:** a third exchange is added as an adapter plus fixtures, with no changes
to UI, stores or calculation code.

---

## Release 1.5–1.6 — trade panel

**Milestone [M3](MILESTONES.md#m3--trade-panel).** The milestone the Bitunix
reference screenshots describe. Third, because every control here is an
order-placing path (needs M1) and an exchange-specific behaviour (needs M2).

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0020](backlog/features/FEAT-0020-account-settings-panel.md) | P1 | Margin, position and asset mode; leverage |
| [FEAT-0021](backlog/features/FEAT-0021-order-types.md) | P1 | Market, limit, trigger, fixed-risk; TP/SL at entry |
| [FEAT-0023](backlog/features/FEAT-0023-position-management.md) | P1 | Flash close, partial close, trailing stop and TP/SL |
| [FEAT-0024](backlog/features/FEAT-0024-confirmation-policy.md) | P1 | Per-action confirmation policy |
| [FEAT-0026](backlog/features/FEAT-0026-multi-account.md) | P1 | Several accounts, unmistakable active one |
| [FEAT-0025](backlog/features/FEAT-0025-trading-notifications.md) | P2 | Fills, margin thresholds, connection loss |

**Start with [FEAT-0020](backlog/features/FEAT-0020-account-settings-panel.md).**
Margin mode and position mode change how everything else behaves — a position
sized for isolated margin means something different in a cross-margin account —
so building order types first means building them against an unknown.

**One question blocks [FEAT-0021](backlog/features/FEAT-0021-order-types.md):**
what happens when the entry fills and the attached stop is rejected. That leaves
a position unprotected, and the answer (retry, alert, auto-close) is a decision,
not an implementation detail.

**Exit:** a full session — open, adjust, partially close, close — on both
exchanges without opening the exchange's own UI.

---

## Release 1.7 — alerting

**Milestone [M4](MILESTONES.md#m4--alerting).**

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0027](backlog/features/FEAT-0027-alert-engine.md) | P1 | Local alert engine, price alerts |
| [FEAT-0028](backlog/features/FEAT-0028-indicator-alerts.md) | P2 | MACD, RSI, Bollinger, volume, MA crosses |
| [FEAT-0030](backlog/features/FEAT-0030-combined-alerts.md) | P2 | AND/OR conditions with a validity window |
| [FEAT-0029](backlog/features/FEAT-0029-drawing-alerts.md) | P2 | Alerts bound to chart drawings |

[FEAT-0029](backlog/features/FEAT-0029-drawing-alerts.md) is last and still an
`idea`: it needs persistent, addressable chart drawings, which do not exist. That
prerequisite is most of the work and probably its own item.

**Build [FEAT-0027](backlog/features/FEAT-0027-alert-engine.md)'s evaluation
core portable from the start** — plain TypeScript/WASM, no DOM dependency. Not
optional polish: it is the only way background alerting can ever leave the
browser without breaking [ADR-0004](adr/0004-spacetimedb-data-scope.md), since
a Cachy-operated server evaluating alerts is forbidden outright. See
[`IDEA-0037`](backlog/ideas/IDEA-0037-android-alert-companion.md).

**Exit:** an armed alert fires within one candle, with the tab backgrounded, and
does not fire twice for one crossing.

---

## Release 1.8 — Community & whitelabel edition

**Milestone [M5](MILESTONES.md#m5--community--whitelabel-edition).** Blocked by
M1–M3: shipping execution to an audience that did not build it requires the
safety layer to exist first.

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0014](backlog/features/FEAT-0014-edition-build-targets.md) | P1 | Community/Pro/Private build targets from one tree |
| [FEAT-0031](backlog/features/FEAT-0031-whitelabel-theming.md) | P2 | Branding as configuration |

[FEAT-0014](backlog/features/FEAT-0014-edition-build-targets.md) is what turns
[ADR-0003](adr/0003-edition-boundary.md) from prose into a lint rule and a CI
build. Until it exists, "the core runs without a server" is a claim nobody has
tested.

**One thing has to be settled before anything is sold:** Cachy is
AGPL-3.0-or-later, and that has real consequences for a whitelabel product.
That is a decision, so it belongs in [`TODO.md`](TODO.md) once someone opens it.

**Exit:** CI produces a serverless artefact every build; it runs with no
SpacetimeDB reachable; the suite passes against it.

---

## Release 2.0 — Pro modules

**Milestone [M6](MILESTONES.md#m6--pro-modules--plugins).**

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0032](backlog/features/FEAT-0032-plugin-contract.md) | P2 | Plugin contract, installation, licence validation |

Needs its own ADR before implementation — the contract defines what a plugin may
touch, and "not Class A data, not the order path" has to be structural rather
than a convention.

---

## Release 2.x — collaboration and AI analysis

Milestones [M7](MILESTONES.md#m7--collaboration) and
[M8](MILESTONES.md#m8--ai-analyst). Independent of each other; both need M5's
module boundary.

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0033](backlog/features/FEAT-0033-chat-hardening-and-reputation.md) | P2 | Chat moderation, rate limiting, peer reputation |
| [FEAT-0034](backlog/features/FEAT-0034-copy-trading.md) | P2 | Live setup sharing — price levels only |
| [FEAT-0019](backlog/features/FEAT-0019-agentic-web-search.md) | P2 | The assistant researches the web |

**Two of these are not the feature that was asked for, and the difference is
recorded rather than glossed over.** Success-based chat filtering cannot be
built — the ranking would derive from the journal, which
[ADR-0001](adr/0001-local-first-boundary.md) forbids as Class B metadata, and
it was already built once and removed for exactly that reason. Copy trading
shares price levels only, because sharing position size publishes the sharer's
account balance by arithmetic. Both are decided in
[ADR-0004](adr/0004-spacetimedb-data-scope.md) §3.

---

## Release 3.0 — autonomous execution

**Milestone [M9](MILESTONES.md#m9--autonomous-execution).**

| Item | Prio | What |
| --- | --- | --- |
| [FEAT-0035](backlog/features/FEAT-0035-autonomous-execution-agent.md) | P2 | An agent that trades inside limits it cannot exceed |

Hard-blocked by M1 and M8, and the item stays `idea` until both are done. An
agent placing orders on an unverified execution path is the one thing in this
plan that could do real harm if built early.

---

## Unscheduled

Real, wanted, not aimed at a release yet. In
[`backlog/INDEX.md`](backlog/INDEX.md) under "Unscheduled":
[BUG-0007](backlog/bugs/BUG-0007-hardcoded-ui-strings.md),
[BUG-0008](backlog/bugs/BUG-0008-toast-array-unbounded.md),
[BUG-0009](backlog/bugs/BUG-0009-symbolpicker-null-resolution.md),
[BUG-0010](backlog/bugs/BUG-0010-modal-extraclasses-ignored.md),
[FEAT-0022](backlog/features/FEAT-0022-settings-search.md),
[IDEA-0036](backlog/ideas/IDEA-0036-gamification-fork.md).

The two P3 bugs are `ready` and small — good filler work when a release is
waiting on a decision.

---

## Keeping this document true

- A backlog item's schedule lives **here**; its requirements live in the item.
  One fact, one place.
- When an item ships, update its front matter (`status: done`, the version it
  landed in) and run `npm run backlog:index`.
- When a release group completes, record the actual version next to its target
  in [`MILESTONES.md`](MILESTONES.md).
- When something is decided *not* to be built, mark the item `dropped` and say
  why. A dropped item that comes back a year later should meet its own tombstone.
