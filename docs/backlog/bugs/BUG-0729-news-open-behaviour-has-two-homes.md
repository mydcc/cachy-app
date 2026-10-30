---
id: BUG-0729
title: The news open behaviour has two homes and no owner
type: bug
status: ready
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
Visuals tab it sits above the first heading without one of its own — as do the
sidebar-visibility and assistant toggles — which is why §11 of the
[UI audit](../assets/FEAT-0605/ui-zustandsaufnahme.md) has no row for it.

## Why it matters

- It is the same class the settings tidy-up exists to remove: one setting, two
  places, no stated owner (§8.8 of the
  [UI audit](../assets/FEAT-0605/ui-zustandsaufnahme.md), flagged after
  FEAT-0607's vocabulary pass shipped without removing it).
- Duplicated controls drift. Whoever edits one copy next (a rename, a new
  option, a disabled condition) will not know the other exists.

## Evidence

- `AiTab.svelte:343` and `VisualsLayout.svelte:32` both render a control over
  `settingsState.newsOpenBehavior`; the card that reads and writes it spans
  `AiTab.svelte:339-409` and `VisualsLayout.svelte:28-98`.
- Outside the two tabs the value has one consumer, the news surface:
  `NewsSentimentPanel.svelte:55-59` filters out articles that cannot be framed
  in in-app-window mode, and `:125` (`handleArticleClick`) calls `window.open`
  or `windowManager.openIframe()`; `IframeView.svelte:46-47` holds the
  reader-mode gate. No assistant path reads it.
- `NewsSentimentPanel` is the sidebar panel mounted in `+page.svelte:387` and
  `:797`, and the component of `NewsFrameWindow.svelte.ts:35`.
- §8.8 of the UI audit says "The news open behaviour is configured in two
  places (AI → Behaviour and Visuals → Layout) with identical options. One of
  them should go when the settings vocabulary is harmonised (FEAT-0607)."
- §11 records it as a headerless block and the only setting duplicated across
  two tabs.
- **Derived**, not demonstrated: both tabs write the same store field; no
  user-visible failure has been observed and no reproduction exists.

## Fix

Keep the Visuals → Layout copy and delete the AI copy.

The setting decides how a clicked article is displayed — in-app window, reader
mode, or a new browser tab. Its readers are the news panel and the reader-mode
gate, not the assistant. The AI tab's news control is
`enableNewsAnalysis` (`AiTab.svelte:426-438`), which decides whether the
assistant considers news headlines at all; that is a different decision and it
stays where it is.

Visuals → Layout already owns the window and presentation behaviour — the
minimised dock, window behaviour, the sidebars and density — so the news open
behaviour belongs beside them. Give the surviving copy its own heading group
after the sidebar-visibility and assistant toggles (`VisualsLayout.svelte:100-130`)
and before the density group (`:134`), following the `border-t` + `<h4>` pattern
those groups already use. Leaving it first would put a `border-t` rule at the
top of the section and make the new heading look like it owns the two toggles
below it.

The heading's label goes into both `src/locales/locales/de.json` and `en.json`,
and `npm run i18n:types` regenerates `src/locales/schema.d.ts` from `en.json` —
`$_(key)` is typed from that file, so a new key does not typecheck until the
types are regenerated.

This reverses the AI → Behaviour reading the item carried when it was specced.
That reading rested on the setting deciding "where a news item opens from the
assistant's answer", which no code path does.

## Acceptance criteria

- [ ] Exactly one tab renders `newsOpenBehavior`: `VisualsLayout.svelte`, under
      its own section heading. `AiTab.svelte` no longer reads or writes it.
- [ ] The heading is a real group header — a `border-t` block with an `<h4>`,
      matching the density, docking and window-behaviour groups in the same
      tab — not a bare card.
- [ ] The heading's label names the group's purpose and is added to both
      `src/locales/locales/de.json` and `en.json`, with no hardcoded string.
- [ ] No other setting is written from two tabs. Record the check in the PR: a
      search for `bind:` and assignment sites per tab, not every
      `settingsState.` read — status displays such as `decryptionFailures`,
      `deviceKeyLost` and `encryptionFailures` appear in two tabs by design
      and are not settings.

## Out of scope

- The general settings vocabulary (FEAT-0607, shipped).
- Any behaviour change to how news links open.
- The UI audit's §11 is a dated measurement (recorded 2026-10-22) and is not
  rewritten here. §9 says "Sections 1–6 and 10–11 are measurements. If a number
  drifts, the number is stale, not the code." The table has no row for this
  setting — only the prose note at `ui-zustandsaufnahme.md:1129-1133`, which
  goes stale once the fix lands. A dated supersession line against that note is
  the right correction; editing the table would rewrite the measurement.
