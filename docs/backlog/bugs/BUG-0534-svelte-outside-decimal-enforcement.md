---
id: BUG-0534
title: .svelte files are outside automated decimal enforcement
type: bug
status: done
assignee: opencode
branch: fix/bug-0534
priority: P3
shipped: unreleased
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0534 — `.svelte` files are outside automated decimal enforcement

Follow-up to the closed Jules audit PR #3589. That PR flagged four `.svelte`
sites using `parseFloat`/`Number` and filed them as four P1 bugs; verification
showed all four are display/visual paths that cannot move money (price
formatting, 24h-% display, visual-maths worker value, input step-size
bucketing), and the scan missed identical neighbours of its own hits. The PR
was closed without merge. The one genuine finding stands and is this item:
nothing automated stops the next native-number conversion on a financial value
inside a `.svelte` file.

## Symptom

A `parseFloat`/`Number()` on a financial value inside a component's `<script>`
block passes CI silently. The decimal rule is documented as non-negotiable,
but for `.svelte` it is enforced by reviewers' eyes only.

## Evidence

**Derived** — the two enforcement halves agree with each other, and both stop
at `.ts`:

- `scripts/audit-decimal.mjs` recursively yields every `.ts` file and checks
  the ones importing `decimal.js`; a `.svelte` file never enters the walk,
  and the `// audit: safe — <reason>` suppression marker only exists for
  lines the script already sees.
- `.github/workflows/audit.yml` discovers every `.ts` file importing
  `decimal.js` ("New financial files are included automatically") — same
  boundary, same blind spot.

The four closed-PR sites are the existence proof that the blind spot is
lived in, not theoretical: `MarketDashboardModal.svelte` (`parseFloat` on a
snapshot and on a display price), `TradeFlowBackground.svelte` (`Number()`
for visual maths), `TradeSetupInputs.svelte` (`parseFloat` for step-size
bucketing). All four verified display-only — they are triage input for the
fix below, not P1s.

## Cause

The audit script predates components carrying conversion logic, or was
written `.ts`-first and never extended: `.svelte` `<script>` blocks run the
same conversions with none of the coverage.

## Fix

Extend `scripts/audit-decimal.mjs` to walk `.svelte` files (script blocks;
markup expressions included if the detection stays cheap, otherwise script
first with a comment saying so) and extend the `audit.yml` decimal job's
discovery the same way, keeping the `// audit: safe — <reason>` marker as
the pressure valve. Then triage the four known sites: each one either
converted to `Decimal` or marked `audit: safe` with its reason (all four
look like marking candidates — display formatting, visual maths, step
bucketing — but the implementer verifies each, not this item).

Leave the closed PR's four P1 items alone — they were never merged and die
with #3589. Leave the `.ts` detection semantics untouched; this item widens
the net, it does not re-tune it.

## Acceptance criteria

- [x] The audit script flags a native-number conversion inside a `.svelte`
  script block (fixture or selftest proves it fails without the fix)
- [x] The CI decimal job covers `.svelte` files on a PR that touches one
- [x] Each of the four known sites is converted to `Decimal` or carries an
  `audit: safe` reason the script accepts
- [x] `npm run backlog:check` passes with the regenerated index

## What shipped

`scripts/audit-decimal.mjs` now walks `.svelte` next to `.ts`, and
`src/tests/architecture/audit_decimal_svelte.test.ts` runs the real script
against a fixture tree (`scripts/__fixtures__/audit-decimal/`) — six cases, one
directory each, so no assertion can be satisfied by a sibling. Against the
pre-fix script four of the seven tests fail, including both `.svelte` detection
cases.

**The selection rule is the finding, not the file extension.** A `.ts` file is
audited when it imports `decimal.js`. Extending that rule to `.svelte` would
have kept the blind spot exactly where it bites: **12 of the 22 `.svelte` files
with a native conversion do not import `decimal.js` at all** — including
`OpenOrdersList.svelte`, `OrderDetailsTooltip.svelte` and `TpSlList.svelte`.
A component that converts a price with `parseFloat` instead of using Decimal
does not import Decimal, so the import gate would skip precisely the file the
check exists to catch. Components are therefore audited unconditionally, and
the import gate stays exactly where it means what it says.

**The marker needed three forms, not one.** A conversion in a component sits in
one of three places and only one of them accepts a line comment: a `<script>`
block takes `//`, a template expression needs an HTML comment *after* the
expression, and an attribute expression — where most of these lines live —
accepts only a block comment inside its braces, because an HTML comment is
invalid inside a tag's attribute list. Before this, exempting a conversion in
markup would have broken the component instead of documenting it. The fixtures
pin all three positions.

**Triage: 67 lines across 22 components, every one verified, none converted.**
The item predicted the four known sites were marking candidates; the widened
scan found 67, and each was read rather than assumed. All are display, visual or
input-chrome paths: epoch-ms timestamps, page size, a row id, a notification
volume, a reconnect interval, background-animation parameters, chart series
data (the chart library's own number API), market-picker filtering and sorting,
price-change percentages for display, and a handful of sign/existence tests that
pick a colour class while the value itself is rendered as Decimal. The four sites
the closed audit PR #3589 named are among them. **No financial conversion was
found in a component**, so nothing was converted to `Decimal`; the honest answer
for all 67 is a reason.

**What the sweep did *not* claim.** A `Number(...)` comparison on a financial
field is not automatically a violation — a `> 0` test that decides whether to
draw a row cannot move money. That is why the marker requires a reason: each of
the 67 is a claim a reviewer can check, and the reason says what the number is
actually for.

## Out of scope

Converting display formatting to `Decimal` where `audit: safe` is the honest
answer — marking is the fix there. Re-litigating the four P1 severities.
Touching the `.ts` detection patterns.

## Links

- Supersedes the closed audit PR #3589 (human decision: close without merge)
- `scripts/audit-decimal.mjs`, `.github/workflows/audit.yml`
