---
id: BUG-0481
title: Every alert that is not a plain price rule announces itself with an empty value
type: bug
status: done
priority: P1
assignee: opencode
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: none
depends_on: []
---

# BUG-0481 — Every alert that is not a plain price rule announces itself with an empty value

## Symptom

A trader arms "RSI(14) crosses below 30 on 4h" from the Indicators tab. It fires. The
toast and the browser notification read:

```
BTCUSDT reached
```

No indicator, no level, no direction — a trailing space where the number should be. The
same for every candlestick-pattern alert, every Combo alert, every Template, and every
price alert whose right-hand side is a `window` operand ("breaks above its 20-candle
high"). Only the Price tab's constant-threshold rules produce a readable line.

The panel gets this right: `AlertPanelView.svelte` renders the rule through
`ruleSentence.ts` in German and English, which is the "a rule a trader cannot read back
is a rule they cannot trust" promise in `docs/alert-system.md`. The notification — the
one surface the trader actually reads, hours later, with a decision in front of them —
does not use it.

## Evidence

**Derived.** Two pieces of code disagree:

- `src/stores/alerts.svelte.ts:firingMessage` builds every message from
  `ruleThresholdOf(rule) ?? ""` and the key `dashboard.alerts.priceReached`.
- `src/services/alertEngine/migrateAlertsToRules.ts:102` — `ruleThresholdOf` reads
  exactly one shape:

  ```ts
  if (!conditions || typeof conditions !== "object" || !("right" in conditions)) return undefined;
  const right = (conditions as { right: unknown }).right;
  if (!right || typeof right !== "object" || !("value" in right)) return undefined;
  ```

  A `group` condition has no `right`. A `pattern` condition has no `right`. An
  `indicator`, `window` or `percent_change` operand on the right has no `value` — only
  `{ kind: "constant"; value }` does.

`ruleThresholdOf` was written for FEAT-0388's legacy migration, where every document
*was* a price-vs-constant rule. It has been the notification's only text source since,
while the panel grew five more builders on top of it.

`ruleSentence.ts` (413 lines, fully tested in `ruleSentence.test.ts`) already renders any
document as a sentence. Its only consumers today are `AlertPanelView.svelte` and
`AutomationTab.svelte`.

## Cause

`firingMessage` never grew past the one condition shape the migration produced.

## Fix

Build the message from `ruleSentence` for any document `ruleThresholdOf` cannot answer,
and keep the existing short form where it can — a price alert reading
`BTCUSDT reached 65000` is better than a full sentence, and changing it would alter text
every existing trader already recognises.

Leave alone: the `intrabar` provisional caveat and the note suffix, which already wrap
whatever the base message is and are correct.

## Acceptance criteria

- [ ] A test arms an indicator rule, fires it, and asserts the message names the
      indicator and the level — failing before the fix
- [ ] The same for a `pattern` rule and for a `group` (Combo) rule
- [ ] A plain price rule's message is unchanged, asserted against the current string
- [ ] The message is produced in both locales, with no locale falling back to English
- [ ] The `intrabar` caveat and the trader's note still wrap the new message

## Links

- `src/stores/alerts.svelte.ts` — `firingMessage`, `notifyingRuleSink`
- `src/services/alertEngine/migrateAlertsToRules.ts` — `ruleThresholdOf`
- `src/lib/rules/ruleSentence.ts` — the renderer that already exists
- `docs/alert-system.md` — "the rule written out in plain language, in German and English"
