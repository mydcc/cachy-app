---
id: BUG-0492
title: ruleEvaluationGate.forget has no production caller, so editing or disarming a rule never clears its anchor
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: none
depends_on: []
---

# BUG-0492 — `ruleEvaluationGate.forget` has no production caller

## Symptom

A trader edits an armed rule — corrects a threshold, changes a size, switches
`evaluation_mode` — while the current candle is still open. The edited rule is
**not evaluated on that candle at all**. It stays silent until the next close,
with nothing in the UI saying why. On a 4h series that is up to four hours of a
rule the trader believes they just armed doing nothing.

The same happens after a disarm/re-arm cycle from the Automation tab: the bot
reads as armed and is skipped for the rest of the candle.

## Evidence

**Derived, from reading the code.** The gate documents an invalidation contract
that no caller honours.

`src/lib/rules/ruleEvaluationGate.ts:98` states the contract:

> Monotonic makes the whole class impossible rather than making one path
> careful, and costs nothing: a rule that legitimately needs to decide an anchor
> again is edited or disarmed, and **both call `forget`**.

Neither does. A repo-wide search for `.forget(` across `src/**/*.ts` and
`src/**/*.svelte`, excluding tests, returns **no matches**. Every store-write
path leaves the anchor record standing:

- `armRule()` — `src/services/alertEngine/armRule.ts:88` — replaces the document
  by `id` and returns; the record is keyed by that same `id`, so the *new*
  document inherits the *old* document's anchor.
- `removeRule()` — `armRule.ts:108` — filters and writes.
- `disarmRule()` — `armRule.ts:132` — sets `enabled: false` and writes.
- `setBotEnabled()` — `src/services/alertEngine/botStore.ts:68` — delegates to
  `armRule`.
- `deleteBot()` — `botStore.ts:88` — writes `localStorage` directly (see
  BUG-0493).

The gate's own dedupe is `anchorMs <= lastAnchorMs` (`ruleEvaluationGate.ts:104`),
so a stale record suppresses the whole remainder of the current candle.

## Cause

`forget` was written as the escape hatch that makes the monotonic dedupe safe,
and the monotonic dedupe was then shipped without wiring the escape hatch. The
comment asserting that callers exist is what kept it from being noticed: it
reads as a description of the system, not as an intention.

This is the failure mode `docs/` calls out elsewhere — a store nothing reads is
BUG-0382 with extra steps. Here it is an invalidation nothing calls.

## Fix

Call `forget(ruleId)` from the writes that change what a rule *means*:

- `armRule()` when the document replaces an existing entry (`index !== -1`) —
  an append is a new `id` with no record to clear.
- `removeRule()` and `deleteBot()`, so a deleted rule leaves no record behind
  for a later rule to inherit if ids are ever reused.
- **Not** from `disarmRule()`. Disarming is the one-shot path after a firing;
  clearing the record there would re-open the anchor the rule just fired on,
  which is BUG-0491's shape.

The layering needs a decision: `armRule` is a service and `ruleEvaluationGate`
is `src/lib/rules/`, so a direct import is fine, but the gate singleton is
shared with the loop. Confirm no cycle before wiring.

Correct the comment at `ruleEvaluationGate.ts:98` in the same change — a comment
that asserts a contract nobody implements is how this survived review.

## Acceptance criteria

- [ ] A test arms a rule, evaluates it on an anchor, edits it via `armRule`,
      and asserts the edited rule **is** evaluated on that same anchor
- [ ] The test fails without the fix
- [ ] A test asserts `disarmRule` does **not** clear the record, so BUG-0491's
      scenario is not widened by this fix
- [ ] The comment at `ruleEvaluationGate.ts:98` describes what the code does

## Links

- BUG-0491 — the other half of the anchor-record story
- BUG-0493 — `deleteBot` bypasses the write path this fix hooks into
