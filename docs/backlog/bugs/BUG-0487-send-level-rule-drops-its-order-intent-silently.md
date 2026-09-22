---
id: BUG-0487
title: A send-level rule fires, drops its order intent and reports nothing
type: bug
status: done
priority: P2
assignee: opencode
branch: fix/BUG-0487-send-level-refusal
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0012
depends_on: []
---

# BUG-0487 — A send-level rule fires, drops its order intent and reports nothing

## Symptom

A `RuleDocument` with `action.consequence_level: "send"` is accepted by the core, stored,
armed, and evaluated. When its conditions hold it announces itself as an ordinary alert —
and its `OrderIntent` is discarded without a word. No order, no refusal, no toast, no log
line. From the trader's side it is indistinguishable from an alert that was never meant to
trade.

This is the exact failure mode ADR-0012 decision 2 forbids: "a capability a level does not
have is refused explicitly … never emulated by a second dialect". Here it is neither
refused nor emulated — it is dropped.

## Evidence

**Derived.**

`src/services/alertEngine/botStore.ts`:

```ts
export const BOT_CONSEQUENCE_LEVEL: ConsequenceLevel = "simulate";

export function isBot(rule: RuleDocument): boolean {
  return rule.action?.consequence_level === BOT_CONSEQUENCE_LEVEL;
}
```

Equality against `simulate`, not `>= simulate`. `withBotOrders`
(`src/services/alertEngine/botOrders.ts`) uses it as the only gate on submission:

```ts
inner(firing);
if (!isBot(firing.rule)) return;
```

So a `send` document takes the `return` branch. `submitBotOrder` never runs, which is also
why none of its seven `BotOrderRefusal` reasons — each of which *does* reach the trader as
a toast via `reportBotOrderRefusal` — can apply.

The core is not the problem. `technicals-wasm/src/rule/consequence.rs` validates a `send`
document properly: `RuleAction::validate` refuses a `send` level with no order, refuses a
non-positive size, refuses a percentage over 100, and `validate_stop` refuses a long stop at
or through the entry. A `send` document is fully formed by the time it reaches this gate.

How one gets stored is not exotic: `Ord` on `ConsequenceLevel` exists so a document may be
authored at a higher level, `promoteAlert.ts` exists to promote documents, `provenance.source`
may be `model`, and the rule store is plain JSON in `localStorage` that the trader owns.

## Cause

`isBot` answers "does this belong on the Automation tab", and `withBotOrders` reuses it to
answer "does this submit". The two questions coincided while `simulate` was the only level
that submitted anything, and nothing marks the point where they stop coinciding.

## Fix

Give `send` an explicit refusal rather than a silent drop. `BotOrderRefusal` is the channel
that already exists for "fired and submitted nothing", it is already surfaced as a toast,
and it is already deduplicated per rule and reason — a new member (`level-not-supported`, or
similar) costs one entry in `BOT_REFUSAL_KEYS` and one message in both locales, and the
typed `Record<BotOrderRefusal, TranslationKey>` makes that a build error until both exist.

Keep `isBot` as the Automation-tab predicate it is documented to be. The submission gate
should ask its own question.

Out of scope: actually submitting at `send`. That is [`FEAT-0035`](../features/FEAT-0035-autonomous-execution-agent.md),
and this item must not become a foothold for it.

## Acceptance criteria

- [ ] A test fires a `send`-level rule and asserts a refusal is reported — failing before
      the fix
- [ ] No order reaches `place()` from a `send`-level rule
- [ ] The refusal message exists in both locales and is reached through `BOT_REFUSAL_KEYS`
- [ ] `simulate` rules are unchanged, asserted by the existing `botOrders.test.ts` cases
- [ ] `isBot` still answers only the Automation-tab question

## Links

- `src/services/alertEngine/botStore.ts` — `isBot`, `BOT_CONSEQUENCE_LEVEL`
- `src/services/alertEngine/botOrders.ts` — `withBotOrders`, `BotOrderRefusal`
- `src/stores/alerts.svelte.ts` — `BOT_REFUSAL_KEYS`, `reportBotOrderRefusal`
- `technicals-wasm/src/rule/consequence.rs` — the level ladder and `RuleAction::validate`
- [`FEAT-0035`](../features/FEAT-0035-autonomous-execution-agent.md) — where `send` is meant to land
