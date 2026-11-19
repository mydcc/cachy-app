---
id: BUG-0832
title: The bot editor flattens any exit it cannot represent as a price comparison
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0832 — The bot editor flattens any exit it cannot represent as a price comparison

## Symptom

A bot carries an exit the editor's row cannot express — an indicator
condition ("RSI above 70"), a nested group, a cross. The trader opens the
editor for an unrelated reason, changes one field, and saves. That exit is
now a price comparison on the trigger timeframe with whatever the fallback
seeded. The bot leaves its position on a different condition than the one
the trader authored, and nothing said so.

## Evidence

**Derived.** Not reachable today, and that is the whole reason to record it
rather than fix it in FEAT-0811.

Two pieces of code disagree about what an exit is:

- `src/lib/rules/types.ts` — `ExitRule.when` is a full `Condition`: the same
  language the trigger speaks, so indicators, groups and crosses are all
  legal exits as far as the document is concerned.
- `src/components/alerts/bots/BotExitsEditor.svelte` — the seeding falls
  back to field `close`, op `gte`, value `""` for any exit whose `when` is
  not a `compare`, whose left side is not a `price`, or whose right side is
  not a `constant`. `exitOf` then rebuilds *every* row as
  `compare/price/constant` on the rule's trigger timeframe, and `publish()`
  maps all rows — so one edit rewrites rows the trader never touched.

Reachability, checked against the tree at the time of writing: the editor is
the only code that writes `document.exits`. Every other reference reads or
evaluates it (`botExits.ts`, `ruleSchema.ts`, `ruleLoopWiring.ts`,
`BotsList.svelte`). So no exit the editor cannot represent can exist yet, and
the flattening cannot fire.

It becomes reachable as soon as any of these lands:
[FEAT-0813](../features/FEAT-0813-condition-builder-v2-more-conditions-and-nested-groups.md)
(nested groups), [FEAT-0814](../features/FEAT-0814-author-and-audit-veto-conditions.md)
(veto conditions), [FEAT-0815](../features/FEAT-0815-volatility-regime-and-session-operands.md)
(new operands) or
[FEAT-0818](../features/FEAT-0818-curated-literature-strategy-templates.md)
(templates that carry exits).

## Resolution

Fixed in the same PR that found it
([FEAT-0811](../features/FEAT-0811-superbot-editor-for-exit-conditions.md),
PR #4597), after an independent reviewer showed the "not reachable" reading
above was only derived from a grep for writers of `document.exits`, not
proven against every way a document can arrive.

`BotExitsEditor.svelte` now decides per row whether it can say the stored
exit without loss — a price comparison against a constant, on the rule's own
timeframe, on the last-traded price. Anything else keeps its original and is
published verbatim; the row shows its sentence and a remove button and
edits nothing. Note the strictness: a *price* comparison with a mark-price
`source` looks representable and was being rewritten too.

Covered by three component cases in `BotEditor.component.test.ts` — a
mark-price exit and a coarser-timeframe exit surviving an unrelated edit
byte-identical, the read-only rendering, and removal of exactly that row —
each red before the change.

## Cause

The row model is narrower than the document model, and the editor treats its
own row model as the whole truth on save: it republishes every row from the
rows it can render, rather than carrying unrepresentable rows through
untouched.

## Fix

Keep the original `ExitRule` for any row the editor cannot represent, and
render it read-only through `renderExitConditionSentence` — the sentence
already exists and is already what the row shows. The trader sees the exit,
reads it in the same vocabulary, and can remove it; they cannot silently
rewrite it by editing a neighbour.

Leave alone: the row model itself. Widening the row to author indicator
exits is FEAT-0813's work, not this item's.

## Acceptance criteria

- [x] A test builds a bot whose exit is not a price comparison, edits an
      unrelated field through the editor, saves, and fails without the fix
      because the exit was rewritten
- [x] The test passes with the fix: the unrepresentable exit round-trips
      byte-identical through a save that touched another field
- [x] An unrepresentable row renders its sentence read-only, with its remove
      button still available
- [x] No new condition kind becomes authorable here

## Out of scope

- Authoring indicator, group or cross exits in the editor — FEAT-0813.
- Any change to `ExitRule` or the core's exit evaluation.

## Links

- Found during the review of
  [FEAT-0811](../features/FEAT-0811-superbot-editor-for-exit-conditions.md)
  (PR #4597), recorded rather than fixed there because it is not yet
  reachable.
- Code: `src/components/alerts/bots/BotExitsEditor.svelte`,
  `src/lib/rules/types.ts`
