---
id: BUG-0575
title: TP/SL refusal message renders a doubled article in both locales
type: bug
status: done
assignee: opencode
branch: fix/issue-3693-tpsl-doubled-article
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0575 — TP/SL refusal message renders a doubled article in both locales

Mirrors GitHub issue #3693 (recorded there first so the finding was not lost;
found while reviewing the BUG-0569 fix, PR #3689).

## Symptom

A refused take profit or stop loss reads with a doubled article in **both**
languages:

```
EN  Order refused: the the take profit price -5 is not valid for this long position
                  with entry price 50000. The order was not sent.
DE  Order abgelehnt: Der der Take-Profit-Preis -5 ist für diese long-Position mit
                    Einstiegskurs 50000 ungültig. Die Order wurde nicht gesendet.
```

## Evidence

**Derived** — the template and the label each carry an article, verified in
the catalogue:

- `orderGate.invalidTpSl` supplies its own: `the {field} price …` /
  `Der {field}-Preis …` (`src/locales/locales/en.json:4151`,
  `de.json:4107`).
- The value it receives is `orderGate.fields.takeProfit` = "the take profit" /
  "der Take-Profit" (or `stopLoss`), via `translateRefusalField`
  (`src/services/orderGate.ts:2188`).

Template article plus label article gives "the the" and "Der der". No test
asserts the doubled text today (no `the the` / `Der der` anywhere in `src/`).

## Cause

`invalidTpSl` is the one template where the label article is genuinely wrong:
it is a compound ("the X price" / "Der X-Preis") while every other `{field}`
consumer uses the label bare or in an oblique case (`Für {field} ist ein Limit
konfiguriert`, `das gespeicherte Limit für {field}`, `the account state
({field})`, `so {field} cannot be measured`). The label dictionary cannot drop
its articles without breaking those thirteen.

## Fix

A bare-label sub-dictionary `orderGate.fieldsBare.*` holding article-free
values (`takeProfit` → "take profit" / "Take-Profit"), with `translateRefusal`
resolving through it exactly when `messageKey` is `orderGate.invalidTpSl`.
Fallback chain bare → `fields.*` → raw name, the same totality contract
`translateRefusalField` already keeps. `orderGate.fields.*` stays untouched.

Deliberately out: unifying the bypassing surfaces (modals and chart pass raw
"TP"/"SL", paper trading passes raw field names or no values at all). None of
them doubles today; changing their visible text is a separate i18n decision,
recorded here so the next groom can take it.

## Acceptance criteria

- [x] `orderGate.invalidTpSl` renders without a doubled article in `de.json`
      and `en.json`, for both `takeProfit` and `stopLoss`
- [x] The other templates consuming `orderGate.fields.*` are unchanged and
      still read correctly — a regression test over the full set of `{field}`
      templates proves it
- [x] `orderGate.fields.*` keeps its article, so `riskLimitUnmeasurable`,
      `riskLimitInvalidState`, `availableMarginUnmeasured`, `stale` and the
      rest keep their oblique-case articles

## What shipped

Exactly the prescribed shape: `orderGate.fieldsBare.*` holds two article-free
labels per locale (`take profit` / `Take-Profit`, `stop loss` / `Stop-Loss`),
and `translateRefusal` resolves through the new `translateRefusalBareField`
exactly when `messageKey` is `orderGate.invalidTpSl` — the single template
with its own article. Fallback chain bare → `fields.*` → raw name, the same
totality contract `translateRefusalField` keeps. No call site touched; the
choke point both surfaces share was enough for the gate path.

TDD: the four exact-string tests failed pre-fix with `the the take profit` /
`Der der Take-Profit` (RED), all green post-fix. The full-set regression
renders every `{field}` template under `orderGate` in both locales with the
real article label and pins it verbatim — green before and after, as a guard
should be. 142/142 gate tests, 53/53 TP/SL + errorUtils tests, 8/8 refusal
component tests green; `validate-i18n`, `lint-i18n` and the regenerated
`schema.d.ts` (3819 keys) clean.

Scope note from the investigation, for the next groom: the modals and the
chart pass raw `"TP"`/`"SL"` straight into the template (`the TP price`),
and paper trading passes raw field names or no values at all — none doubles
today, but none reads a translated label either. Unifying those surfaces onto
`fieldsBare` is a separate visible-text change, deliberately left out here.

## Links

- GitHub issue #3693 (symptom, cause, reach table, awkwardness analysis)
- `src/services/orderGate.ts` (`translateRefusal`, `translateRefusalField`)
- BUG-0569 (same dictionary block; its Resolution section tracks #3693)
