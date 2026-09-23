---
id: BUG-0498
title: A lost drawing anchor silently turns a line alert back into the constant it was created with
type: bug
status: done
assignee: opencode
branch: fix/bug-0498-drawing-anchor
shipped: unreleased
priority: P1
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0001
depends_on: []
---

# BUG-0498 — A lost drawing anchor silently freezes the level

## Symptom

A trader arms an alert on a support line at 100,000, then over the next days
drags that line down to 95,000 as the structure shifts. The chart shows one
line, at 95,000.

If the anchor ledger was not written, or can no longer be read, the rule fires
at **100,000** — a level that is nowhere on the chart, and that the trader
last saw days ago. Nothing says so. The alert list shows an ordinary price
alert, because by then that is exactly what it is.

With FEAT-0396 the same rule can carry an order intent, so the failure does not
stop at a wrong notification: it sizes and submits at a level the trader
abandoned.

## Evidence

**Derived, from reading the code.** Two sibling stores answer the same question
— "could this be read?" — and only one of them is allowed to say no.

The resolver treats a missing *drawing* with full rigour. An unreadable drawing
store is its own refusal reason, distinct from a deletion, and it makes the rule
inert rather than letting it fire on something stale —
`src/services/alertEngine/drawingThreshold.ts:112`:

```typescript
const reason = ports.storePresent() ? "drawing-missing" : "drawing-store-unreadable";
return { kind: "unresolvable", reason, drawingId: anchor.drawingId };
```

The *ledger* one line earlier has no such distinction —
`src/services/alertEngine/drawingThreshold.ts:105`:

```typescript
const anchor = ports.ledger()[rule.id];
if (!anchor) return { kind: "not-anchored" };
```

`not-anchored` means "evaluate the document unchanged", i.e. against the
constant stored at creation time. The ledger reaches that branch two ways, and
`readDrawingAnchorLedger` is candid about the first —
`src/services/alertEngine/drawingAnchors.ts:98`:

```typescript
logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger unreadable", e);
return EMPTY;
```

Its own comment states the consequence and accepts it: *"leaves every rule
evaluating on its stored constant — stale, but armed."* That is the correct
default for **arming**; it is the wrong default for **silence**. The trader is
never told the line stopped being followed.

The second way is the write path, and it is more reachable than corruption.
`persist` swallows a failed write — `src/services/alertEngine/drawingAnchors.ts:115`:

```typescript
logger.warn("alerts", "[FEAT-0029] Drawing anchor ledger could not be written", e);
```

`recordDrawingAnchor` nevertheless returns "the ledger as written", and
`createDrawingAlert.ts:129` calls it without inspecting anything. The chart then
reports success — `CandleChartView.svelte`, `alertOnSelectedDrawing`:

```typescript
toastService.success($_("chartView.drawings.alertArmed"));
```

So on a device whose `localStorage` quota is full — a plausible state for a
Local-First app holding a journal, drawings and rules — the trader is told the
alert is armed on the line, and it never was.

## Cause

Anchoring is stored as a **side record** rather than as part of the rule, so the
binding can be lost independently of the thing it binds. Once lost, the rule is
still a perfectly valid document — it simply describes a constant — and no layer
can tell the difference between "this was never a drawing alert" and "this was
one, and the evidence is gone".

The resolver is not at fault: given an empty ledger it does the only correct
thing. The defect is that an empty ledger is indistinguishable from an honest
one, in a module that elsewhere goes to real trouble to keep exactly that
distinction.

## Fix

Make anchor loss observable, in both directions. Two changes, neither large:

1. **Read side.** Let `readDrawingAnchorLedger` report failure instead of
   flattening it to `EMPTY` — a `{ present: boolean; ledger: … }` snapshot, the
   shape `readDrawingStoreSnapshot` already uses for the sibling store. Give
   `DrawingThresholdRefusal` a `"drawing-anchor-ledger-unreadable"` member and
   return `unresolvable` for a rule whose ledger could not be read. Keep every
   *non*-anchored rule evaluating normally: an unreadable ledger must not make
   ordinary price alerts inert.
2. **Write side.** Have `persist` report whether it wrote, and have
   `armDrawingAlert` refuse rather than succeed when it did not. A trader who is
   told "could not arm on this line" will retry; one who is told it worked will
   not.

Leave the `EMPTY`-on-unreadable *default for arming* alone. The point is not to
disarm more aggressively — it is that the trader hears about it.

The stronger variant, worth considering but not required here: carry the
`drawingId` inside the rule document so the binding cannot outlive or predecease
the rule at all. That closes the class rather than reporting it, but it is a
schema change and a migration, so it belongs in its own item.

## Acceptance criteria

- [ ] A test makes `localStorage.getItem(RULE_DRAWING_STORAGE_KEY)` return
      invalid JSON and asserts the anchored rule is reported **unevaluable**,
      not evaluated against its stored constant
- [ ] The test fails without the fix
- [ ] A rule that was never drawing-anchored still evaluates normally while the
      ledger is unreadable
- [ ] A test makes `localStorage.setItem` throw during `armDrawingAlert` and
      asserts the trader sees a refusal, not `chartView.drawings.alertArmed`
- [ ] The refusal reason reaches the alert panel through the existing
      unevaluable channel — no second dialect

## Accepted deviation (review, PR #3579)

While the anchor ledger is unreadable, the hold applies to every rule with
the drawing-alert shape (single top-level compare against a constant) —
which is also the shape of an ordinary price alert. Such a rule cannot be
told apart from a lost drawing alert without a schema change (the "stronger
variant" above), and evaluating it on a possibly abandoned constant risks a
silent firing at a level the trader moved away from, so holding it with an
explanatory reason is the money-safe direction. Do not "fix" the hold back
into silent evaluation; close the gap with the schema change instead.

## Links

- `docs/backlog/features/FEAT-0029-drawing-alerts.md` — the feature this
  weakens
- `docs/backlog/features/FEAT-0396-*` — why a wrong level can become an order
- BUG-0485 — the other place an alert record is written and never read back
- `src/services/alertEngine/reconcileDrawingRules.ts` — the deletion case,
  handled correctly, and the model this fix should follow
