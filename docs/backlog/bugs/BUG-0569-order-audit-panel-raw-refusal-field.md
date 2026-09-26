---
id: BUG-0569
title: Order audit panel shows the raw refusal field name
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0569 — Order audit panel shows the raw refusal field name

Found while reviewing BUG-0551 (PR #3675): a pre-existing shortcut that
gained two more field values, and was left out of that PR on purpose.

## Symptom

A refused order shows its reason in the audit panel
(`settings.audit.refusedField`) as `refused: qty` or `refused: accountState` —
the internal field name, not a word a trader reads. The toast for the same
refusal says "the position size", because it goes through `translateRefusal`.

## Evidence

`src/components/settings/OrderAuditSettings.svelte:141-146` interpolates
`entry.refusal.field` straight into the message. `translateRefusal`
(`src/services/orderGate.ts:2176-2205`) is the helper that maps a field name
through `orderGate.fields.*` and already falls back to the raw name for fields
outside that family.

The field vocabulary is not fully translated: `orderGate.fields.*` covers the
fields the gate itself produces (`qty`, `account`, `maxLossPerTrade`, …) but not
every field any code can store. BUG-0551 added two it does not translate —
`exchange` and `session` — and both are visible in this panel.

## Cause

The audit panel formats a refusal itself instead of going through the one
helper that knows the field vocabulary.

## Fix

Route the panel's refusal line through `translateRefusal` (or a thin wrapper
that maps the field the same way), so the panel and the toast cannot disagree
about what a field is called. Then either add the missing `orderGate.fields.*`
entries or accept the documented raw-name fallback for fields outside the
family — the fallback already exists, so the panel must not be the thing that
invents its own wording.

## Acceptance criteria

- [ ] A component test renders a refused entry with a field name from
  `orderGate.fields.*` and shows the translated label, not the raw key
- [ ] An entry whose field has no translation falls back to the raw name
  rather than showing a dotted key path
- [ ] The toast wording and the panel wording agree for the same refusal

## Out of scope

- Changing the stored `refusal.field` values themselves.
- The `field: "account"` used by `assertGatePass` for a provider change
  (recorded separately as a naming inconsistency between two code paths).

## Links

- `src/components/settings/OrderAuditSettings.svelte`
- `src/services/orderGate.ts` (`translateRefusal`)
- Found during the BUG-0551 review; that PR deliberately left it out of scope
