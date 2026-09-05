# The alert system

How a trader arms a rule in Cachy, what happens when it fires, and why the same
machinery serves both an alarm and a bot.

This document describes the **system**. The decision behind it lives in
[`adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md`](adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md);
the work is tracked in [`backlog/`](backlog/INDEX.md) under `area: alerts`. Neither
is repeated here.

## One document, three surfaces

A strategy in Cachy is a `RuleDocument` — data, validated on the way in, never
executable code. What it is allowed to *do* is a single field:

```
action.consequence_level:   notify  <  simulate  <  send
```

The ladder is ordered and load-bearing. `RuleDocument::authorise(requested)` refuses
when a caller asks for more than the document grants, so a `notify` rule cannot place
an order — not because a screen hides the button, but because the document says no.
`may_read_account_state()` is false below `simulate`, so an alarm rule cannot even
read the position book.

That is why alerts and bots are not two systems:

| Surface | Shows rules with | Where |
|---|---|---|
| **Super-Alert panel** | `notify` | Bell in the left control panel, chart right-click, indicator settings |
| **Automation tab** | `simulate` | Settings → Automation (paper bots) |
| **Automation tab** | `send` | Settings → Automation, behind the order gate |

One condition language, one evaluator, one set of tests. A backtest and a live alarm
cannot disagree about what "RSI(14) below 30 on the 4h close" means, because there is
only one implementation of it.

## The data

`RuleDocument` is **Class A** — it lives in `localStorage` and never leaves the
device, model-proposed rules included. See
[`adr/0001-local-first-boundary.md`](adr/0001-local-first-boundary.md).

| Field | What |
|---|---|
| `schema_version` | Migrated on read, refused if unreadable |
| `symbol`, `trigger_timeframe` | The market and the evaluation anchor |
| `conditions` | A tree: `Compare`, `Cross`, `Group{all\|any\|none}`, `Position`, `Account`, `ExternalFeed` |
| `veto` | Optional suppression. The only place a third-party feed is legal |
| `action` | `consequence_level` and, above `notify`, an `OrderIntent` |
| `provenance` | `human` or `model`, plus a caller-supplied timestamp |

Two rules that mean the same thing have the same **content hash**. Renaming a rule,
arming it, or disarming it does not change the hash; changing its symbol, timeframe,
conditions or consequence level does. That is what makes a journal entry able to say
*which* strategy produced a trade.

## Evaluation

A rule is evaluated **once per close of its trigger timeframe**. Every condition then
reads the last candle of *its own* timeframe that had already closed at that instant.

Two rules follow from this, and both are enforced rather than documented:

- A condition may not name a timeframe **finer** than the trigger. A 4h-triggered rule
  reading a 15m candle has no well-defined answer, so it is refused by name.
- A rule produces no verdict at all until `warmup_candles()` of trigger-timeframe
  history exists. An indicator answering from a half-filled buffer is worse than an
  indicator not answering.

Closed-candle evaluation is the default because an alarm that fires on a value which
reverts before the candle closes teaches a trader to distrust every alarm.

### Cutover note for alerts armed before this system

Alerts armed through the legacy price-alert panel (`AlertDefinitionsModal`, stored under
`cachy_alerts_v1`) evaluated on **every incoming price tick** — a threshold crossed
intra-tick fired immediately. Once [`FEAT-0388`](backlog/features/FEAT-0388-migrate-alerts-to-rule-documents.md)
converts a stored alert into a `RuleDocument`, that alert instead fires **once per
closed candle of its `trigger_timeframe`**, per the rule above. A price that touches the
threshold and reverts within the same candle no longer fires it, and a fire can lag the
old tick-based behaviour by up to one candle.

This is a deliberate behaviour change, not a regression: it is the same trade-off
described above, now also applied to alerts that predate it. A trader relying on
sub-candle timing for an existing alert should re-arm it with a finer
`trigger_timeframe` after the migration ships; the migration itself does not alter
`symbol` or threshold (see `FEAT-0388`'s acceptance criteria).

## Where a trader arms a rule

| Entry point | Gives |
|---|---|
| Bell → Super-Alert panel | The full builder: templates, combos, price, indicators, candlestick patterns |
| Right-click on the chart | "Alert here", price pre-filled from the click |
| Indicator settings | "Alert on this indicator", parameters carried over as they are configured |
| Settings → Automation | Bots, one document each |

The panel is a **side panel, not a modal**: alarms are set while reading the chart,
and a dialog that covers the chart forces a close-and-reopen cycle for every
adjustment.

### Panel tabs

| Tab | Builds |
|---|---|
| Templates | A ready `RuleDocument` from a named strategy, editable before arming |
| Combo | Up to five conditions joined with AND/OR |
| Price | Rises above / falls below / rise reaches / fall reaches, last or mark price |
| Indicators | Indicator, trigger object, rule (cross, threshold, divergence), parameters |
| Candlesticks | Single, multiple and structural patterns |
| Manage | Armed rules and history |

Every builder ends in the same footer — trigger method, frequency, validity period,
note — and above the arm button, **the rule written out in plain language, in German
and English**. A rule a trader cannot read back is a rule they cannot trust.

## When a rule fires

The verdict goes to `notificationService`, which owns channel policy. Built-in channels
(in-app, browser notification, sound) never reach the network — the rule and its evaluation
stay on the device. External channels (Email, Discord, Telegram) are **opt-in** via
[`FEAT-0397`](backlog/features/FEAT-0397-notification-channels.md): the trader configures
credentials, the service calls external APIs only if those channels are armed. The trigger
method chosen on the rule selects which channels announce it.

Above `notify`, the verdict instead becomes an order intent, and every existing
guard — the order gate, the risk limits, the confirmation settings — applies
unchanged. The rule engine proposes; it does not send.

## Related

- [`adr/0012-…`](adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — why a strategy is data
- [`adr/0001-local-first-boundary.md`](adr/0001-local-first-boundary.md) — why rules never leave the device
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — where the code lives
- [`backlog/INDEX.md`](backlog/INDEX.md) — filter `area: alerts`
