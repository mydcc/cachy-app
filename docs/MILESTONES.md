# Milestones

The long-term plan, in the order things have to happen. Each milestone has an
**exit criterion** — a checkable statement, not a feeling — and nothing counts
as done until that statement is true and proven.

- **Why this order:** [`VISION.md`](VISION.md), "The three commitments".
- **What to build next, concretely:** [`ROADMAP.md`](ROADMAP.md).
- **Individual work items:** [`backlog/`](backlog/README.md).

Status: 🟢 done · 🟡 in progress · ⚪ not started · 🔒 blocked by an earlier
milestone

---

## How versions relate to milestones

`semantic-release` owns the version numbers. Every `feat:` commit bumps the
minor, automatically, on merge to `develop`. Nobody decides that a release is
"1.3" — the commits do.

So the target versions below are **planning anchors, not promises**. Cachy will
pass through many minor versions inside a single milestone. What is fixed is the
*order* and the *exit criteria*; what floats is the number.

The rule that keeps this honest: when a milestone's exit criterion becomes true,
record the version it actually landed in, in this file, next to the target. A
target that drifted by six minors is information, not a failure — it says the
milestone was bigger than it looked.

Current version: **1.0.0-beta.6** (see `package.json`).

---

## Overview

| # | Milestone | Target | Status | Exit criterion, in one line |
| --- | --- | --- | --- | --- |
| **M0** | Stable 1.0 | `1.0.0` | 🟡 | The beta ships as stable with no known money-affecting defect open |
| **M1** | Safe execution foundation | `~1.1` | ⚪ | No order can reach an exchange unverified, and every order can be stopped |
| **M2** | Broker abstraction | `~1.3` | ⚪ | A third exchange is added without touching UI or calculation code |
| **M3** | Trade panel | `~1.5` | ⚪ | A trader can run a full session without opening the exchange's own UI |
| **M4** | Alerting | `~1.7` | ⚪ | Price, indicator and combined alerts fire locally and reliably |
| **M5** | Community & whitelabel edition | `~1.8` | 🔒 M1–M3 | A serverless build is produced by CI and deployable without a database |
| **M6** | Extensions & Pro modules | `~2.0` | 🔒 M5 | A user-written indicator runs isolated and traceable; a paid module installs and revokes |
| **M7** | Collaboration | `~2.x` | 🔒 M5 | Chat and copy trading run as optional modules within ADR-0004 |
| **M8** | AI analyst | `~2.x` | 🔒 M2 | The assistant forms and defends a market view from live data it gathered |
| **M9** | Autonomous execution | `~3.0` | 🔒 M1, M8 | An agent trades within limits it cannot exceed, with a full audit trail |

---

## M0 — Stable 1.0

**Goal.** Stop being a beta. The product as it exists today is coherent; what is
missing is the confidence to drop the suffix.

**Why now.** Every milestone after this one adds surface area. Shipping 1.0
first means there is a known-good line to compare against.

**Exit criterion.**

- No open `P0` backlog item.
- The known money-affecting defects are fixed or explicitly accepted in writing:
  the Bitget WebSocket account sync ([`BUG-0001`](backlog/bugs/BUG-0001-bitget-ws-field-mismatch.md)),
  the numeric-zero target price ([`BUG-0002`](backlog/bugs/BUG-0002-numeric-zero-target-price.md)),
  the order-map eviction rule ([`BUG-0003`](backlog/bugs/BUG-0003-oms-preserve-latest-unenforced.md)).
- `docs/TODO.md` item 1 (the shared imgbb key): ✅ **RESOLVED** (Aug 2, 2026).
  Hybrid approach: users must provide own imgbb key via Settings, default key
  provided as fallback with link to https://api.imgbb.com/. Key rotatable
  at any time.
- `npm run check` clean, full test suite green, `npx eslint .` clean.

**Explicitly not in scope.** New features. M0 is a closing milestone.

---

## M1 — Safe execution foundation

**Goal.** Make it structurally impossible to send an order the user did not
intend, and always possible to stop one.

**Why first.** This is commitment 2 from the vision, and it is the precondition
for literally everything else that touches an exchange. The user's own framing:
*risk-free trading has to work before the community gets execution, and long
before an AI gets it.*

**What it contains.**

- **Pre-flight verification.** Before any order leaves the client, an
  independent check recomputes the order from the displayed state and refuses on
  mismatch: symbol, side, size, entry, stop, leverage, margin mode. Runs
  locally, works offline, never calls a Cachy server (ADR-0004 §3).
- **Paper trading.** A simulated execution mode that runs *the same code path*
  as live, diverging only at the final transport call. A paper mode with its own
  code path proves nothing about the live one.
- **Risk limits.** Hard, user-configured ceilings enforced at the execution
  boundary rather than in the form: max position size, max leverage, max loss
  per trade, max loss per day, max concurrent positions.
- **Kill switch.** One action that blocks all outgoing order traffic
  immediately, survives a reload, and requires a deliberate action to clear.
- **Order audit trail.** Every submission attempt recorded locally with what was
  sent, what came back, and which checks passed. Class A, stays on the device.

**Exit criterion.** Every order-placing path in the codebase goes through the
verification gate — proven by a test that adds a bypassing call site and fails.
Paper mode and live mode differ at exactly one seam. The kill switch is proven
to block a live submission attempt.

**Depends on.** Nothing. This is the floor.

---

## M2 — Broker abstraction

**Goal.** Make "support another exchange" a bounded, repeatable task.

**Why here.** Bitunix and Bitget are currently woven directly into services,
stores and routes — `bitunixWs.ts` and `bitgetWs.ts` are parallel
implementations, and `accountState.updatePositionFromWs()` is shared between
them while reading Bitunix's field names, which is the direct cause of
[`BUG-0001`](backlog/bugs/BUG-0001-bitget-ws-field-mismatch.md). That bug is not
an accident; it is what the missing abstraction looks like.

Doing this *after* M1 rather than before is deliberate: the verification gate
defines what an adapter must guarantee, so building the gate first tells the
abstraction what shape to be.

**What it contains.**

- An `ExchangeAdapter` interface covering market data, account state, and order
  placement/modification/cancellation.
- A **capability model**, because exchanges genuinely differ: hedge mode,
  multi-asset margin, trailing stops and fixed-risk orders are not universal.
  The UI reads capabilities rather than assuming, and hides what an exchange
  cannot do instead of failing at submission.
- A normalisation layer, so one internal shape for positions, orders and
  balances replaces the per-exchange shapes flowing into shared stores.
- A **conformance test suite** every adapter must pass, run against recorded
  fixtures.
- Bitunix and Bitget migrated behind it, with the shared-store field mismatch
  fixed as part of the migration rather than separately.

**Exit criterion.** A third exchange is implemented as an adapter plus fixtures,
with zero changes to UI components, stores or calculation code. The conformance
suite passes for all three.

---

## M3 — Trade panel

**Goal.** A trader can open a position, manage it and close it without leaving
Cachy for the exchange's own interface.

**Why here.** This is the milestone the user's Bitunix screenshots describe, and
it is third because it is the one that most benefits from the two below it:
every control added here is an order-placing path (needs M1) and an
exchange-specific behaviour (needs M2's capability model).

**What it contains.** Grouped as they will be built, not as they appear on
screen:

- **Account state, displayed and editable:** margin mode (isolated/cross),
  position mode (one-way/hedge), asset mode (single/multi-asset), leverage per
  symbol.
- **Order types:** market, limit, trigger/conditional, fixed-risk, with TP/SL
  attached at entry.
- **Position management:** flash close, trailing stop, trailing TP/SL, partial
  close, position-level TP/SL modification.
- **Confirmations:** a per-action confirmation policy the user configures once —
  which actions require confirming, which are one-click. Interacts directly with
  M1: a confirmation is not a substitute for verification, it is the layer above
  it.
- **Notifications:** fills, liquidation warnings, margin-ratio thresholds,
  connection loss.
- **Multi-account:** several keyed accounts, switchable, with the active one
  unmistakable on screen. The failure mode here is placing a trade on the wrong
  account, so this is a safety feature wearing a convenience feature's clothes.

**Exit criterion.** A full trading session — open, adjust, partially close,
close — completed against a live exchange without opening the exchange's UI, on
both supported exchanges, with every action passing through M1's gate.

---

## M4 — Alerting

**Goal.** Cachy tells the trader when something they defined happens, without a
server and without the tab needing focus.

**What it contains.**

- Price alerts (level, crossing, percentage move).
- Indicator alerts on the existing engines: MACD, RSI, Bollinger, volume,
  moving-average crosses.
- Drawing-based alerts — support, resistance, channels — which require chart
  drawing objects to exist and be persisted first.
- Combined alerts: several conditions with AND/OR and a validity window.
- Delivery: in-app, browser notification, and optionally an external channel
  the user configures.

**Exit criterion.** An alert armed on one device fires within one candle of its
condition becoming true, with the tab in the background, and does not fire twice
for one crossing.

**Note on placement.** Alerts are locally evaluated by design — the alert
definition is Class A and does not go to a server. This is not a limitation to
work around later: server-side alerting that fires with the browser closed
would require a Cachy-operated server to hold the alert definition, which
[ADR-0004](adr/0004-spacetimedb-data-scope.md) forbids outright, not merely
defers. The actual path to background alerting with the browser closed is a
native companion running the same evaluation core on-device — see
[`TODO.md`](TODO.md) item 21 and [`IDEA-0037`](backlog/ideas/IDEA-0037-android-alert-companion.md).
Because of this, [`FEAT-0027`](backlog/features/FEAT-0027-alert-engine.md)'s
evaluation core is **Rust compiled to WASM** from the start, extending the
existing `technicals-wasm/` toolchain — the same crate cross-compiles for
Android, so the companion needs no second implementation.

**Optional: Android alert companion.** M4 itself (in-browser alerting) is complete
and ships as a PWA. Whether to build a native Android companion app is a separate
decision ([`TODO.md`](TODO.md) item 21): it would run the same alert engine on-device
to fire when the browser is closed, but it is neither blocking M4 nor required for
M0–M3. The scope is alert-only (calculator, journal and UI stay PWA), the platform
is Android (iOS cannot hold background WebSockets), and the timeline is unspecified.
This carries no risk to the core product and costs nothing elsewhere in the app.

---

## M5 — Community & whitelabel edition

**Goal.** Produce a build that anyone can deploy with no database, and that a
buyer can rebrand.

**Blocked by** M1–M3: shipping execution to an audience that did not build it
requires the safety layer to exist first. This is the user's own constraint and
it is correct.

**What it contains.**

- The edition build targets and the module boundary from
  [ADR-0003](adr/0003-edition-boundary.md), enforced by a lint rule against core
  imports and by a serverless build in CI.
- Whitelabel theming: branding, palette and naming as configuration rather than
  as edits to `src/themes.css`.
- Deployment documentation and a one-command path for a static host.
- Licensing and attribution, checked against AGPL-3.0 obligations — the current
  licence has consequences for a whitelabel product that need a real answer
  before anything is sold.

**Exit criterion.** CI produces a serverless artefact each build; it deploys and
runs with no SpacetimeDB reachable; the full test suite passes against it.

---

## M6 — Extensions & Pro modules

**Goal.** Users can extend Cachy — their own indicators, prompts, strategies —
and a capability can be sold and revoked, all without a fork.

**What it contains,** in the order [ADR-0005](adr/0005-extension-model.md)
requires, because each tier is the foundation for the next:

- **Tier 1, data** ([`FEAT-0039`](backlog/features/FEAT-0039-data-extensions.md),
  scheduled in M5): prompts, presets, themes and templates as validated data
  files. No executable code, so no security burden — and it establishes the
  import/validate/store path the later tiers reuse.
- **Tier 2, computation** ([`FEAT-0040`](backlog/features/FEAT-0040-computation-extensions.md)):
  user-written indicators, alert conditions and strategy logic running in a
  worker built without `fetch`, `localStorage` or DOM. Results carry a
  provenance tag, so an extension-derived number cannot silently size a
  position.
- **Tier 3, integration**: UI panels, exchange adapters, AI providers.
  Deliberately **not** built until Tiers 1 and 2 have been used in anger.
- **Paid plugins** ([`FEAT-0032`](backlog/features/FEAT-0032-plugin-contract.md)):
  licensing and revocation layered on the mechanism above, not a separate
  security model.

**The constraint that shapes this milestone.** A trading bot written as an
extension is a client of [M1](#m1--safe-execution-foundation), not an
exception to it: it may propose an order, and that proposal passes the same
verification gate, risk limits and kill switch as a human click. Extensions
never reach Class A data — enforced by isolation, not documentation. See
[ADR-0005](adr/0005-extension-model.md) for why the WordPress "drop a file in
a folder" model does not transfer.

**Exit criterion.** A user-written indicator runs, is proven unable to reach
`fetch`/`localStorage`/DOM by a test that tries each, and its output is
traceable to it. A paid module installs, enables, disables and revokes on a
Community build, and its absence changes nothing about core behaviour.

---

## M7 — Collaboration

**Goal.** The optional social layer, within the boundary
[ADR-0004](adr/0004-spacetimedb-data-scope.md) sets.

**What it contains.**

- Global Chat, hardened — moderation, rate limiting, abuse handling.
- Reputation from peer signals in the chat. **Not** the journal-derived success
  filter originally proposed: that mechanism was built once and removed as a
  Class A leak, and ADR-0004 §3 records why it cannot come back.
- Copy trading — price levels only, receiver-side sizing, per-session and
  default-off. Requires the `BREAKING CHANGE:` entry ADR-0001 mandates.

**Exit criterion.** Both features run as modules, absent from the Community
build, with a payload test asserting the exact permitted key set — the same
guard `chat.test.ts` already applies to chat messages.

---

## M8 — AI analyst

**Goal.** The assistant gathers its own information and forms a defensible view,
instead of summarising context handed to it.

**What it contains.** Agentic web search and news crawling; continuous market
observation; multi-timeframe and cross-asset analysis; strategy *proposals* with
stated reasoning and stated confidence; a record of what it proposed and what
happened, so it can be evaluated rather than believed.

**Depends on** M2, because an analyst reasoning over exchange-specific field
shapes is an analyst that breaks when a broker is added.

**Exit criterion.** The assistant answers "what is happening with this asset and
what would you do" using data it fetched itself, cites its sources, and its past
proposals are reviewable against outcomes.

**Boundary.** M8 proposes. It does not place orders. That is M9, and the
separation is the point.

---

## M9 — Autonomous execution

**Goal.** The agent trades on its own, inside limits it cannot exceed.

**Blocked by M1 and M8**, absolutely. This is the single hardest constraint in
this document: an agent that can place orders on an unverified execution path is
a way to lose money faster than a human can react.

**What it contains.** A strategy definition the user approves; a capital
allocation the agent cannot exceed; execution through M1's gate with no bypass;
a decision log recording what it did and why; and a stop that halts it
mid-strategy without unwinding positions unexpectedly.

**Exit criterion.** The agent runs a full strategy in paper mode for a sustained
period with a complete decision log; every limit is proven enforced by a test
that tries to exceed it; the kill switch stops it mid-execution. Only then does
live capital become a discussion.

---

## Not planned

- **Gamification in this product.** Technically easy given the 3D background and
  SpacetimeDB, and deliberately out of scope: trading is where users lose real
  money. If it happens it is a separate fork with a separate name.
- **Server persistence of Class A data on a Cachy-operated instance.** ADR-0001,
  ADR-0004.
- **Any core function that requires a server.** ADR-0003.
- **Selling capability removed from the core.** [`VISION.md`](VISION.md).
