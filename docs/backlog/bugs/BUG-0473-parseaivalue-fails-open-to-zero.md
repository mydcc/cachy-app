---
id: BUG-0473
title: parseAiValue fails open to zero on unparseable AI output
type: bug
status: ready
priority: P1
milestone: M9
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
---

# BUG-0473 — parseAiValue fails open to zero on unparseable AI output

## Symptom

When the model returns a value `parseAiValue` cannot understand (`null`, `undefined`, `""`, garbage strings, NaN), the function returns `Decimal(0)` — and callers write that `0` straight into leverage, risk percentage, account size, entry, SL and TP fields. A confused model can therefore zero out the risk setup instead of being rejected.

## Evidence

**Derived.** `src/utils/utils.ts:595-677`:

```typescript
export function parseAiValue(value: string | number | boolean): Decimal {
  if (typeof value === "number") return new Decimal(value);
  if (typeof value === "boolean") return value ? new Decimal(1) : new Decimal(0);
  if (!value) return new Decimal(0);
  // ...
  try {
    const d = new Decimal(str);
    if (d.isNaN()) return new Decimal(0);
    return d.times(multiplier);
  } catch {
    return new Decimal(0);
  }
}
```

Every failure path yields `0`, and `src/stores/ai.svelte.ts:1074-1180` assigns the result unconditionally, e.g. `tradeState.leverage = String(parseAiValue(...))`. The existing tests (`src/utils/utils.test.ts:203-237`) even pin the zero-fallback as intended behaviour.

## Cause

Fail-open default chosen for display convenience, applied to a financially-capable write path without distinguishing "missing" from "zero".

## Fix

1. Make the failure explicit: return `null` (or throw a typed error) on unparseable input instead of `0`; update the signature and all call sites.
2. `executeAction` must skip (and log) actions whose value is unparseable — never write `0` into trade state.
3. Update/extend tests: unparseable input is refused, valid inputs (incl. `k`/`m` suffixes, DE/EN formats) still parse.

## Acceptance criteria

- [ ] No code path writes a `0` derived from a parse failure into trade state (test fails without the fix)
- [ ] All existing valid-format cases still parse identically
- [ ] Refused values are logged via `logger.warn("ai", …)` for the audit trail

## Out of scope

- Changing number formatting rules for valid output
- Server-side validation of AI payloads

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), finding 3
- Related: [`BUG-0002`](BUG-0002-numeric-zero-target-price.md) (same zero-confusion family)
