---
id: FEAT-0747
title: Manage list with search, filters and firing log
type: feature
status: done
assignee: opencode
branch: feature/feat-0747-manage-list
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
parent: FEAT-0745
depends_on: [FEAT-0543, FEAT-0746]
size: M
estimate: 5
---

# FEAT-0747 — Manage list with search, filters and firing log

## Problem

`ManageTab.svelte` renders one row per rule as a symbol plus
`formatCondition()`, which can only phrase a single price comparison. A
combination, indicator, candlestick or drawing rule reads as a bare symbol. The
row carries no name, no timeframe, no evaluation mode and no lifecycle, and the
tab strip knows only "Aktiv" and "Verlauf" — with no count, no search, no
filter and no sort. Past a handful of rules the list stops being an overview,
which is exactly the complaint this epic starts from.

The firing data already exists and is never shown. `shadowLedger.ts` persists
up to 500 records under `cachy_shadow_firings_v1`, and the real firing sink
writes a `source: "rule"` record on every announcement
(`alerts.svelte.ts` → `notifyingRuleSink` → `recordFiring`). The panel reads
none of it.

## Proposal

1. **Rows that answer the question.** Type icon, symbol, rule name, the
   plain-language sentence from `renderRuleSentence`, a status badge with
   text — armed / paused / expired / broken / fired — timeframe, evaluation
   mode (close vs. intrabar, with the provisional marker), lifecycle summary
   (frequency, valid until), and the row actions from FEAT-0746/0542/0543.
   A rule the sentence renderer cannot phrase still gets a row, with its
   symbol and status, so it stays deletable (the BUG-0485 behaviour).
2. **Header.** `Alerts (n)` and `Log (n)` counts that match the visible list;
   a search field over symbol, name and note; filter chips for status, type,
   timeframe and evaluation mode; sort by symbol, last firing and expiry.
   Filters compose; the filtered set is built in `$derived`, never in the
   `{#each}` expression.
3. **Log tab.** Read the `source: "rule"` records from the existing ledger:
   wall-clock time, symbol, timeframe, candle anchor, verdict, and a link to
   the rule while its id still exists. Deleting a rule does not delete its
   log entries — the ledger is the record of what was announced. The log is
   bounded by the ledger's existing 500-record cap; no new store key.
4. **Empty states** that name the next action ("No alerts armed — create one
   from the chart or the bell"), and no dead-end tab.
5. German and English strings, keyboard reachable rows and filters.

## Acceptance criteria

- [x] Every row renders a sentence for price, indicator, combo, candlestick and
      drawing rules in both locales; a rule the renderer cannot phrase still
      appears with symbol and status. (`manageView.sentenceFor`; the drawing
      kind is read from the anchor ledger and its rule is an ordinary
      constant-threshold sentence.)
- [x] The counts equal the rows currently visible, and filtering by status and
      type composes (AND across filter groups). (`filterManageRows`, pinned by
      unit tests and by the tab-label test after a search.)
- [x] Search matches symbol, rule name and note, case-insensitively.
- [x] A rule with `fired_count > 0` appears in the Log with its time and candle
      anchor; a rule that never fired has no Log entry. (Ledger records carry
      both; a fire that predates the ledger is listed from
      `last_fired_anchor_ms` with its wall clock explicitly absent.)
- [x] Log entries survive deleting the rule and are capped by the existing
      ledger; the tab states the cap rather than silently dropping rows.
- [x] Paused, expired and broken rows carry distinct text badges; the broken
      reason remains available as detail (BUG-0485).
- [x] Sorting and filtering run in derived state, not in the template.
- [x] The list is keyboard reachable, filter chips expose their pressed state,
      and both locales resolve every string.

## Out of scope

- Editing (FEAT-0542) and inline full configuration (FEAT-0543) — this item
  consumes both.
- Exporting the log, clearing it, or filtering it by date range. A clear action
  is a follow-up; the ledger is deliberately append-only evidence today.
- New persistence. This item reads `cachy_shadow_firings_v1`; if a record needs
  the announcement text, that is a ledger schema change and its own item.
- Rules with `consequence_level` above `notify` — bots stay in their own tab
  (FEAT-0749).

## Decisions

- **The Log is the firing ledger, not a second history.** "Verlauf" today means
  "rules that fired", which conflates a rule's state with an event. The ledger
  already separates the two; the tab reads it.
- **Delete does not cascade into the log.** A trader deleting an obsolete rule
  is not asking to erase the evidence that it fired.
- **The Aktiv/Verlauf switch became status chips.** The two tabs were a
  hard-coded split on "has ever fired", which BUG-0754 shows is the wrong
  question. Counts, search and the other filters cannot coexist with a binary
  switch that pre-filters the list, so the same distinction is now the status
  filter group: `Fired` means spent, `Armed`/`Suspended`/`Expired` mean the rule
  is still on the desk.
- **A fire the ledger never saw still gets a Log row.** `fired_count` predates
  the ledger on some devices, and a ledger write can fail. The fallback entry
  reads `last_fired_anchor_ms` and leaves `recordedAtMs` null, so the UI says
  "candle time, no wall clock" instead of inventing one.
- **The log re-reads on `alertState.firingsVersion`.** A repeating rule fires
  without writing a rule, so `rulesVersion` alone would leave the Log frozen on
  exactly the announcements it exists to show. The counter is bumped by the
  firing sink beside the ledger write.

## Open questions

- Should the Log show `shadow` and `legacy` records behind a developer toggle?
  Proposal: no in this item; the UI is for traders, and those records exist for
  the cutover comparison.

## Links

- `src/components/alerts/tabs/ManageTab.svelte` — the list being replaced
- `src/services/alertEngine/ruleLifecycleView.ts` — `alarmRows`, statuses
- `src/services/alertEngine/shadowLedger.ts` — the persisted firing records
- `src/lib/rules/ruleSentence.ts` — the sentence to reuse
- `src/stores/alerts.svelte.ts` — `notifyingRuleSink` writes the `rule` record
- [`FEAT-0543`](FEAT-0543-show-full-rule-configuration-on-manage-rows.md)
- [`FEAT-0542`](FEAT-0542-view-and-edit-armed-alert-from-manage.md)
- [`BUG-0485`](../bugs/BUG-0485-broken-alert-record-is-built-and-never-read.md)
