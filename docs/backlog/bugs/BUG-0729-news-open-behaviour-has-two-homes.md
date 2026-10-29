---
id: BUG-0729
title: The news open behaviour has two homes and no owner
type: bug
status: specced
priority: P3
milestone: none
created: "2026-10-22"
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0729 — The news open behaviour has two homes and no owner

## Symptom

`settings.newsOpenBehavior` ("News-Artikel öffnen" / "Open News Articles") is
rendered twice:

- **AI → Behaviour** — `src/components/settings/tabs/AiTab.svelte:343`, inside
  the AI behaviour section.
- **Visuals → Layout** — `src/components/settings/tabs/VisualsLayout.svelte:32`,
  without a section heading.

Both write the same setting. A trader who changes it on one tab finds it
changed on the other, and neither tab explains why the control is there. In the
Visuals tab it is the only control without a heading, which is why the
vocabulary and placement audit (§10/§11 of
[`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md)) could
not see it at first.

## Why it matters

- It is the same class the settings tidy-up exists to remove: one setting, two
  places, no stated owner (FEAT-0607 §8.8, which flagged it and deferred it to
  this item's vocabulary pass).
- Duplicated controls drift. Whoever edits one copy next (a rename, a new
  option, a disabled condition) will not know the other exists.

## Evidence

- `AiTab.svelte:343` and `VisualsLayout.svelte:32` both bind
  `settingsState.newsOpenBehavior`.
- §8.8 of the audit says "One of them should go when the settings vocabulary is
  harmonised (FEAT-0607 [sic: FEAT-0607])".
- The audit's §11 records it as the only header-less setting.

## Fix

Remove one copy and state the surviving home:

- If it is an AI preference (how the assistant's news links open), keep it in
  AI → Behaviour and delete the Visuals row.
- If it is a general reading preference, keep it in Visuals → Layout, give it a
  heading, and delete the AI row.

The AI reading is the better fit: the setting decides where a news item opens
from the assistant's answer, not how the app looks. It also avoids adding a
section for one control in Visuals.

## Acceptance criteria

- [ ] Exactly one tab renders `newsOpenBehavior`, and the other no longer
      imports or binds it.
- [ ] The surviving copy sits under a section heading that names its purpose.
- [ ] The audit's §11 row for it is updated to "match" with the surviving tab.
- [ ] No other setting is duplicated across two tabs (one grep over
      `settingsState.<key>` bindings per tab, recorded in the PR).

## Out of scope

- The general settings vocabulary (FEAT-0607, shipped).
- Any behaviour change to how news links open.
