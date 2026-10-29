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
Visuals tab it is the only control without a heading, which is why the
vocabulary and placement audit (§10/§11 of
[`ui-zustandsaufnahme.md`](../assets/FEAT-0605/ui-zustandsaufnahme.md)) could
not see it at first.

## Why it matters

- It is the same class the settings tidy-up exists to remove: one setting, two
  places, no stated owner (§8.8 of the
  [UI audit](../assets/FEAT-0605/ui-zustandsaufnahme.md), which flagged it and
  deferred it to this item's vocabulary pass).
- Duplicated controls drift. Whoever edits one copy next (a rename, a new
  option, a disabled condition) will not know the other exists.

## Evidence

- `AiTab.svelte:343` and `VisualsLayout.svelte:32` both bind
  `settingsState.newsOpenBehavior`.
- Outside the two tabs the value has one consumer, the news surface:
  `NewsSentimentPanel.svelte:55` (in-app window) and `:125`
  (`handleArticleClick`, which calls `window.open` or
  `windowManager.openIframe()`), plus the reader-mode gate in
  `IframeView.svelte:46-47`. No assistant path reads it.
- `NewsSentimentPanel` is the sidebar panel mounted in `+page.svelte:387` and
  `:797`, and the component of `NewsFrameWindow.svelte.ts:35`.
- §8.8 of the UI audit says "The news open behaviour is configured in two
  places (AI → Behaviour and Visuals → Layout) with identical options. One of
  them should go when the settings vocabulary is harmonised (FEAT-0607)."
- The audit's §11 records it as the only header-less setting.

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
behaviour belongs beside them. Give the surviving copy its own heading group,
following the `border-t` + `<h4>` pattern the density, docking and
window-behaviour groups already use, and add the label to both locale files.

This reverses the AI → Behaviour reading the item carried when it was specced.
That reading rested on the setting deciding "where a news item opens from the
assistant's answer", which no code path does.

## Acceptance criteria

- [ ] Exactly one tab renders `newsOpenBehavior`: `VisualsLayout.svelte`, under
      its own section heading. `AiTab.svelte` no longer imports or binds it.
- [ ] The heading follows the existing `border-t` + `<h4>` group pattern and
      its label exists in both `src/locales/locales/de.json` and `en.json`.
- [ ] No other setting is bound in two tabs. Record the check in the PR: a
      search for `bind:` and assignment sites per tab, not every
      `settingsState.` read — status displays such as `decryptionFailures`,
      `deviceKeyLost` and `encryptionFailures` appear in two tabs by design
      and are not settings.

## Out of scope

- The general settings vocabulary (FEAT-0607, shipped).
- Any behaviour change to how news links open.
- The UI audit's §11. It is a dated measurement — §9 says "Sections 1–6 and
  10–11 are measurements. If a number drifts, the number is stale, not the
  code." — it has no row for this setting, only the prose note at
  `ui-zustandsaufnahme.md:1129-1133`, and its result line records that
  FEAT-0607 moved no control. Editing it after the fact would rewrite a
  measurement, so this item leaves it alone.
