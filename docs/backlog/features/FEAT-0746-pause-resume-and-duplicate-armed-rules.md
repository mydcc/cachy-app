---
id: FEAT-0746
title: Pause, resume and duplicate armed rules
type: feature
status: done
assignee: opencode
branch: feature/feat-0746-pause-resume-duplicate
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

Before this item an armed alert had no way to be paused or copied. The row
offered delete, FEAT-0542's edit pencil and FEAT-0543's expansion. A trader who
wants silence for a week, or the same setup with one threshold changed, has to
delete the rule and rebuild every condition, parameter, timeframe and note from
memory. A rebuilt alert also starts as if it had never fired: it is a new
document with a new id.

The store cannot express either operation for alerts today: `armRule` writes a
document and `disarmRule` only turns one off, while `setBotEnabled`
(`botStore.ts`) works for `simulate` bots only. Nothing duplicates a rule.

## Proposal

1. **`setRuleEnabled(ruleId, enabled)`** next to `armRule`, mirroring
   `setBotEnabled`: read the one rule, flip only `enabled`, write through
   `armRule` so the evaluation anchors survive. `enabled` is outside the
   content hash, so pausing changes nothing a journal entry recorded. Refuse
   bots (`isBot`) — those have `setBotEnabled` — and return a refusal reason
   for an unknown id instead of throwing at a stale row.
2. **`duplicateRule(ruleId, name?)`**: copy the stored document, assign a fresh
   id with the same collision discipline as `promoteAlert.ts`, keep every
   condition and the order intent unchanged, and write it **disarmed**
   (`enabled: false`). `provenance.derived_from_hash` records the source's
   content hash and `provenance.source` carries the source's origin. An
   optional display name lets the UI compose the localised "copy" suffix; the
   store carries the resulting name but no locale logic. Without one, the copy
   keeps the original name and is distinguished by its id.
3. **Row actions** in `ManageTab.svelte`: pause/resume (`⏸`/`▶`) and duplicate
   (`⧉`), alongside delete and the edit affordance from FEAT-0542. Every write
   bumps `alertState.rulesVersion`, the way `arm()` and `deleteRow` already do,
   so the list re-derives from `localStorage`.
4. Accessible buttons with labels and pressed state; German and English
   strings under `dashboard.alerts.*`.

## Acceptance criteria

- [x] Pausing flips `enabled` and nothing else; a test hashes the document
      before and after and requires the same content hash.
- [x] A paused rule produces no firing on the next closed candle, and pausing
      does not forget the gate anchors, so a resumed rule cannot replay a seen
      candle. The loop test covers pause/resume; the store test spies
      `ruleEvaluationGate.forget` and requires it untouched.
- [x] Duplicate creates a rule with a new id, identical conditions and action,
      `enabled: false`, and `derived_from_hash` equal to the source's content
      hash. The source stays armed and unchanged.
- [x] The duplicate gets a new id and no fire state: a copy never inherits
      `fired_count` or the source's anchors, so duplicating from History yields
      a decidable paused rule.
- [x] Duplicating a bot through this path is refused; bots keep
      `setBotEnabled`.
- [x] Pause, resume and duplicate are keyboard reachable, labelled in both
      locales, and the pause toggle announces its state via `aria-pressed`.
- [x] Delete and FEAT-0542's edit flow are behaviourally unchanged.

## Decisions

- **A duplicate starts disarmed.** A copy that arms itself is an alert the
  trader did not review, and the whole point of duplicating is to change
  something before arming it (ADR-0012: nothing acts until a human arms it).
- **Pause is not a strategy edit.** It must not reset anchors or the firing
  count; otherwise disarm/re-arm becomes a way to fire the same candle twice.
- **A drawing-bound duplicate keeps its binding.** The copy gets its own anchor
  entry pointing at the same drawing; a failed anchor write removes the copy.
  Without that, a duplicated line alert would silently become a fixed-price
  alert at the level the line had when it was copied.
- **Pause disappears only when it cannot do anything.** A spent `once` rule in
  History has no pause toggle: `enabled` is already false and "Resume" would
  write a rule that can never announce; re-arming goes through FEAT-0542's edit
  path, which clears the fire state. A repeating rule that has fired stays
  enabled and keeps its pause control.
- **A duplicate is the same strategy under a new identity.** It shares the
  source's content hash, so any future journal or decision log must key entries
  by rule id, not by hash, if copies are to be told apart. No such journal
  exists today; `derived_from_hash` records the lineage but cannot distinguish
  the two.
- **The copy keeps the source's lifecycle, including `valid_until_ms`.** A copy
  reviewed past the original expiry is born expired; the trader edits it before
  arming. A suspension badge wins over an expired badge, because the suspension
  is why it cannot fire; the detail still shows the validity date.

## Out of scope

- Editing the rule (FEAT-0542) and inline full configuration (FEAT-0543).
- Bulk pause/duplicate of several selected rows; that can follow once the list
  has selection state, which no item specifies yet.
- Duplicating bots. Promotion already derives a bot from an alert; a bot-to-bot
  copy is its own item.
- Undo/history for destructive actions.

## Result

`setRuleEnabled(ruleId, enabled)` flips only `enabled` and writes through
`armRule`, passing the document it read as `expected` so a concurrent edit or a
firing-path disarm is a refusal rather than a silent revert. `strategyOf` strips
`enabled`, so the content hash, the gate anchors and the fired count stay where
they were. It refuses bots, returns a reason for unknown/unreadable/conflict,
and reads the write back because `safeLocalStorage.setItem` reports quota as
`false` rather than throwing.

`duplicateRule(ruleId, name?)` canonicalises and validates the source, copies it
with a fresh id, keeps conditions/action/lifecycle, sets `enabled: false`,
records the canonical source's content hash in `provenance.derived_from_hash`,
and writes a new `created_at_ms`. It refuses bots, `send`/non-notify rules, an
unavailable core, an invalid source and an unreadable store/ledger. The copy is
read back before the anchor is touched; a drawing-bound source gets its own
anchor entry pointing at the same drawing, and a failed ledger write removes
the copy. The source is never written back, and the copy inherits no fire state.

Manage rows gain pause/resume (`aria-pressed`, constant toggle name, dynamic
title) and duplicate buttons. Pause is hidden only when it cannot do anything —
a spent `once` row in History; a repeating rule that fired keeps it. Duplicate
stays available on History. Every successful write bumps
`alertState.rulesVersion`; the UI supplies the localised `"{name} (copy)"` name.
Duplicate success says the copy starts paused; every refusal names its reason.

Pinned by `ruleActions.integration.test.ts` (stored hash unchanged, persisted
anchors/fired count, gate anchor not re-decided, write failure, conflict path,
copy identity/hash, no inherited fire state, drawing anchor + rollback,
core-unavailable, invalid and bot refusals, id collision),
`ruleEvaluationLoop.test.ts` (paused rule skipped, resumed rule evaluated) and
`ManageTab.component.test.ts` (toggle label/pressed state, per-row duplicate,
fired-once vs fired-repeating, copy name, bump, all refusal toasts).

## Links

- `src/services/alertEngine/armRule.ts` — `armRule`, `removeRule`,
  `disarmRule`, and the strategy comparison that already treats `enabled` as
  non-strategy
- `src/services/alertEngine/botStore.ts` — `setBotEnabled`, the pattern to mirror
- `src/services/alertEngine/ruleActions.ts` — `setRuleEnabled`, `duplicateRule`
- `src/services/alertEngine/ruleIdentity.ts` — the shared id-collision loop
- `src/components/alerts/tabs/ManageTab.svelte` — the row actions
- `src/lib/rules/types.ts` — `enabled` and the hash-excluded lifecycle fields
- [`FEAT-0393`](FEAT-0393-rule-trigger-method-and-lifecycle.md) — lifecycle fields
- [`BUG-0486`](../bugs/BUG-0486-evaluation-gate-forget-is-never-called.md) and
  [`BUG-0491`](../bugs/BUG-0491-bot-reorders-same-candle-after-reload.md) — the
  anchor behaviour this must not reopen
