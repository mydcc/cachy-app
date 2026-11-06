---
id: FEAT-0813
title: Raise the condition limit and allow nested groups in the builder
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
parent: FEAT-0805
size: L
estimate: 8
---

# FEAT-0813 — Raise the condition limit and allow nested groups in the builder

## Problem

The combo builder stops at five conditions, joined only by AND or OR, and every
row must be an indicator compared against a constant, price, indicator or
window. The core already accepts a tree eight levels deep with any number of
members, and accepts price, pattern, position and account leaves in the same
group. So the panel cannot write rules the engine can evaluate — and a trader
who needs six conditions has to split one strategy into several alerts, which
loses the shared trigger instant.

## Proposal

Bring the builder up to the core, not the other way around:

- Raise `MAX_COMBO_CONDITIONS` from 5 to a configurable limit (12–16; the exact
  number is a decision, see Open questions). The cap exists to keep the panel
  usable, not because the evaluator cannot do more.
- Support **nested groups** in the UI: a group can contain conditions and other
  groups, joined by AND/OR, at least two levels deep (the core allows eight).
- Allow **mixed leaves** in one group: a price comparison, an indicator
  comparison and a pattern can sit side by side, instead of forcing everything
  through an indicator-vs-reference row.
- Keep the read-back sentence: a nested group must render in both locales, and
  the sentence is the acceptance surface for "did I build what I meant".
- Show the rule's warmup requirement (`MAX_RULE_WARMUP_CANDLES`) next to the
  builder, so a 500-candle window is visible before arming instead of silently
  withholding a verdict.

`none` (NOR) stays out unless the sentence renderer can say it without
ambiguity; the core supports it, the builder does not have to.

## Acceptance criteria

- [ ] A rule with 12 conditions can be built, saved, reloaded and edited in the
      panel without losing rows.
- [ ] A two-level nested group round-trips: build → document → read back →
      identical sentence.
- [ ] A group can mix a price comparison, an indicator comparison and a pattern;
      the core accepts it and the sentence names each leaf.
- [ ] A document with more conditions than the new cap opens read-only with a
      notice instead of being truncated or erased.
- [ ] The warmup requirement is shown for the current draft and updates as
      conditions change.
- [ ] The existing refusal anchoring still points at the offending leaf after
      nesting.
- [ ] Tests: build/read-back for nested groups, mixed leaves, the cap boundary,
      and a document the builder cannot represent (locked, not erased).

## Out of scope

- Changing the core's depth limit (8) or the warmup cap.
- Exposing `none`/NOR before the sentence renderer can express it.
- A drag-and-drop canvas or a visual strategy graph.
- Condition templates (FEAT-0818) and AI authoring (FEAT-0817).

## Open questions

- The exact new cap: 12, 16, or "unlimited with a warmup warning". Proposal: 16
  in the UI, with the core unchanged. Tracked in
  [`TODO.md`](../../TODO.md#35-condition-builder-limit-and-nesting).
- Whether the builder should show the tree as an indented list or as collapsible
  group cards. Proposal: group cards, because the sentence is already the
  read-back and the tree is the edit surface.

## Links

- [`FEAT-0805`](FEAT-0805-bot-system-v2-from-conditional-orders-to-strategies.md)
- [`FEAT-0814`](FEAT-0814-author-and-audit-veto-conditions.md)
- Code: `src/lib/alerts/comboConditionForm.ts`,
  `src/components/alerts/tabs/ComboTab.svelte`,
  `src/lib/rules/ruleSentence.ts`
- Core: `technicals-wasm/src/rule/condition.rs` (`MAX_CONDITION_DEPTH`)
