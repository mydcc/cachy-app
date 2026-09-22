---
id: BUG-0493
title: deleteBot writes localStorage directly and bypasses the shared rule-store write path
type: bug
status: done
priority: P2
assignee: opencode
branch: fix/BUG-0493-deletebot-write-path
milestone: none
editions: [community, pro, private]
area: execution
data_class: A
adr: ADR-0001
depends_on: []
---

# BUG-0493 — `deleteBot` bypasses the shared rule-store write path

## Symptom

Deleting a bot from the Automation tab behaves differently from every other
rule-store mutation. Two consequences, both invisible until they matter:

1. The deletion is not guarded by `readRuleStore()`'s refusal. A store that
   fails to parse makes `armRule` and `promoteAlertToBot` throw
   `RuleStoreUnreadableError` rather than overwrite — deliberately, so a
   corrupt store never costs the trader every armed rule. `deleteBot` reaches
   `localStorage.setItem` on a path that has already parsed with the same
   `readRuleStore()`, so today it inherits that guard, but the write itself is
   open-coded and the next edit to it will not.
2. Any invalidation the write path grows applies to every rule *except* a
   deleted bot — including the `forget()` call BUG-0486 adds.

## Evidence

**Derived, from reading the code.**

`src/services/alertEngine/botStore.ts:88`:

```typescript
export function deleteBot(botId: string): boolean {
  const rules = readRuleStore();
  const target = rules.find((r) => r.id === botId);
  if (!target || !isBot(target)) return false;

  localStorage.setItem(
    RULES_STORAGE_KEY,
    JSON.stringify(rules.filter((r) => r.id !== botId)),
  );
  return true;
}
```

`src/services/alertEngine/armRule.ts:108` already exports exactly this
operation:

```typescript
export function removeRule(ruleId: string): RuleDocument[] {
  const rules = readRuleStore();
  const next = rules.filter((rule) => rule.id !== ruleId);
  if (next.length !== rules.length) {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}
```

Two functions, one storage key, one operation, two implementations. Note
`removeRule` also skips the write when nothing changed; `deleteBot` writes
unconditionally once it passes its guard.

`deleteBot`'s own doc comment gives the reason it is separate — it must refuse
to delete a `notify` rule — and that reason justifies the **guard**, not the
open-coded write.

## Cause

The `isBot` guard and the removal were written together as one function because
they ship together. Composing `removeRule` under the guard was the smaller
change and was not taken.

## Fix

Keep the guard, delegate the write:

```typescript
export function deleteBot(botId: string): boolean {
  const target = readRuleStore().find((r) => r.id === botId);
  if (!target || !isBot(target)) return false;
  removeRule(botId);
  return true;
}
```

Leave the `isBot` refusal exactly as it is — the Automation tab must stay
unable to delete an alert, and that is what makes this function worth having.

This is a mechanism fix, not a line fix: after it, there is one write to
`cachy_rules_v1` for removal, so BUG-0486's `forget()` lands in one place
instead of two.

## Acceptance criteria

- [ ] `deleteBot` no longer calls `localStorage.setItem`
- [ ] A test asserts `deleteBot` on a `notify` rule's id returns `false` and
      leaves the store untouched
- [ ] A test asserts `deleteBot` on a bot removes exactly that document
- [ ] Whatever invalidation `removeRule` performs (BUG-0486) is observable
      through `deleteBot`

## Links

- BUG-0486 — the invalidation this consolidation lets land in one place
- `docs/adr/0001-local-first-boundary.md` — rules are Class A, localStorage only
