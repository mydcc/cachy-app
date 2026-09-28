---
id: BUG-0534
title: .svelte files are outside automated decimal enforcement
type: bug
status: ready
priority: P3
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

- [ ] The audit script flags a native-number conversion inside a `.svelte`
  script block (fixture or selftest proves it fails without the fix)
- [ ] The CI decimal job covers `.svelte` files on a PR that touches one
- [ ] Each of the four known sites is converted to `Decimal` or carries an
  `audit: safe` reason the script accepts
- [ ] `npm run backlog:check` passes with the regenerated index

## Out of scope

Converting display formatting to `Decimal` where `audit: safe` is the honest
answer — marking is the fix there. Re-litigating the four P1 severities.
Touching the `.ts` detection patterns.

## Links

- Supersedes the closed audit PR #3589 (human decision: close without merge)
- `scripts/audit-decimal.mjs`, `.github/workflows/audit.yml`
