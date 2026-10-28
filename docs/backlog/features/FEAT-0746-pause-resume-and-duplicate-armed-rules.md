---
id: FEAT-0746
title: Pause, resume and duplicate armed rules
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: alerts
data_class: A
adr: ADR-0012
parent: FEAT-0745
depends_on: []
size: S
estimate: 3
---

# FEAT-0746 — Pause, resume and duplicate armed rules

## Problem

An armed alert has exactly one row action: delete
(`ManageTab.svelte` → `removeRule`). A trader who wants silence for a week, or
who wants the same setup with one threshold changed, has to delete the rule and
rebuild every condition, parameter, timeframe and note from memory. Deleting
also discards the rule's firing state, so the rebuilt alert starts as if it
had never fired.

The store cannot express either operation for alerts today: `armRule` writes a
document and `disarmRule` only turns one off, while `setBotEnabled`
(`botStore.ts`) works for `simulate` bots only. Nothing duplicates a rule.

## Proposal

1. **`setRuleEnabled(ruleId, enabled)`** next to `armRule`, mirroring
   `setBotEnabled`: read the one rule, flip only `enabled`, write through
   `armRule` so the evaluation anchors survive. `enabled` is outside the
   content hash, so pausing changes nothing a journal entry recorded. Refuse
   `simulate` bots (`isBot`) — those have `setBotEnabled` — and return
   `undefined` for an unknown id instead of throwing at a stale row.
2. **`duplicateRule(ruleId, name?)`**: copy the stored document, assign a fresh
   id with the same collision discipline as `promoteAlert.ts`, keep every
   condition and the order intent unchanged, and write it **disarmed**
   (`enabled: false`). `provenance.derived_from_hash` records the source's
   content hash and `provenance.source` carries the source's origin. An
   optional display name lets the UI append a localised "copy" suffix without
   putting a locale string into the data store; without one, the copy keeps the
   original name and is distinguished by its id.
3. **Row actions** in `ManageTab.svelte`: pause/resume (`⏸`/`▶`) and duplicate
   (`⧉`), alongside delete and the edit affordance from FEAT-0542. Every write
   bumps `alertState.rulesVersion`, the way `arm()` and `deleteRow` already do,
   so the list re-derives from `localStorage`.
4. Accessible buttons with labels and pressed state; German and English
   strings under `dashboard.alerts.*`.

## Acceptance criteria

- [ ] Pausing flips `enabled` and nothing else; a test hashes the document
      before and after and requires the same content hash.
- [ ] A paused rule produces no firing on the next closed candle, and resuming
      it does not re-fire a candle it already saw (the BUG-0486/BUG-0491 shape
      stays closed). Proven by an evaluation-loop test, not by reading the code.
- [ ] Duplicate creates a rule with a new id, identical conditions and action,
      `enabled: false`, and `derived_from_hash` equal to the source's content
      hash. The source stays armed and unchanged.
- [ ] The duplicate does not appear in the source's journal linkage: it is a
      new document whose meaning may diverge on the next edit.
- [ ] Duplicating a bot through this path is refused; bots keep
      `setBotEnabled`.
- [ ] Pause, resume and duplicate are keyboard reachable, labelled in both
      locales, and announce their state (for example `aria-pressed` on the
      pause toggle).
- [ ] Delete and FEAT-0542's edit flow are behaviourally unchanged.

## Decisions

- **A duplicate starts disarmed.** A copy that arms itself is an alert the
  trader did not review, and the whole point of duplicating is to change
  something before arming it (ADR-0012, decision 5).
- **Pause is not a strategy edit.** It must not reset anchors or the firing
  count; otherwise disarm/re-arm becomes a way to fire the same candle twice.

## Out of scope

- Editing the rule (FEAT-0542) and inline full configuration (FEAT-0543).
- Bulk pause/duplicate of several selected rows; that can follow once the list
  has selection state (FEAT-0747).
- Duplicating bots. Promotion already derives a bot from an alert; a bot-to-bot
  copy is its own item.
- Undo/history for destructive actions.

## Links

- `src/services/alertEngine/armRule.ts` — `armRule`, `removeRule`,
  `disarmRule`, and the strategy comparison that already treats `enabled` as
  non-strategy
- `src/services/alertEngine/botStore.ts` — `setBotEnabled`, the pattern to mirror
- `src/services/alertEngine/promoteAlert.ts` — id-collision discipline
- `src/components/alerts/tabs/ManageTab.svelte` — the row actions
- `src/lib/rules/types.ts` — `enabled` and the hash-excluded lifecycle fields
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — lifecycle fields
- [`BUG-0486`](../bugs/BUG-0486-evaluation-gate-forget-is-never-called.md) and
  [`BUG-0491`](../bugs/BUG-0491-bot-reorders-same-candle-after-reload.md) — the
  anchor behaviour this must not reopen
