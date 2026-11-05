---
id: FEAT-0802
title: Move AI and System disclosure copy into tooltips
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [FEAT-0800, FEAT-0801]
assignee: opencode
branch: feature/feat-0802-ai-system-tooltips
---

# FEAT-0802 — Move AI and System disclosure copy into tooltips

## Problem

After the Trading and Visuals waves, three explanations still cross the agreed
tooltip threshold (more than ~180 characters or more than two sentences) and
sit as permanent paragraphs:

| Key | Length | Where |
|---|---|---|
| `settings.ai.customProviders.relayDesc` | 253 | relay switch in the custom-provider card |
| `settings.system.telemetryDesc` | 252 | telemetry opt-out card in System |
| `settings.ai.customProviders.desc` | 213 | section intro above the provider list |

Two of them describe where data goes, so the marker alone is not enough: the
direction of the flow has to stay readable without hovering.

## Proposal

- `customProviders.desc` moves fully into an `InfoTip` next to the section
  title. It introduces the feature; nothing in it is a guarantee.
- `relayDesc` and `telemetryDesc` move into an `InfoTip` next to the control,
  with a new visible one-liner that keeps the data-flow fact:
  - `settings.ai.customProviders.relayNote` — off means the browser talks to
    the provider directly, on means prompts travel via Cachy.
  - `settings.system.telemetryNote` — anonymous usage events only, never
    journal, settings or API keys.
- Reuse `InfoTip` / `Tooltip`. No new component, no new pattern.

## What deliberately stays visible

- `settings.ai.shareTradeContextDesc` (206 chars) — this is the Class A
  disclosure for the toggle that sends setup, positions and journal history to
  a provider. A hover is the wrong place for a consent statement.
- `settings.ai.ollamaBaseUrlDesc` — states that the local endpoint never
  leaves the device; privacy fact in 76 characters.
- `settings.hotkeys.info` — the only usage instruction for the recorder and it
  carries styled `{alt}` / `{ctrl}` markup that a tooltip cannot render.
- `settings.ai.customBaseUrlDesc`, `settings.calculation.timeframeReco` — input
  hints under the threshold.
- `settings.confirmations.verificationNote` — security statement.

## Acceptance criteria

- [ ] The three keys above are no longer rendered as visible paragraphs; each
      is reachable through an `InfoTip` attached to its heading or control.
- [ ] `relayNote` and `telemetryNote` are visible in both languages and carry
      the data-flow fact the full text states.
- [ ] The keys listed under "deliberately stays visible" are still visible copy.
- [ ] No new component; DE/EN parity holds.
- [ ] Targeted tests pass; `npm run check` reports no new errors.

## Out of scope

- The alert panel: its remaining long text is status copy
  (`cutoverNoticeBody`, `orphanWithheldHint`) and must stay visible.
- The Bots tab: both explanations are under the threshold.
- Chart, Connections and Cloud settings, unless a key crosses the threshold.

## Open questions

None.

## Links

- `src/components/settings/AiProviderManager.svelte`
- `src/components/settings/tabs/SystemTab.svelte`
- `src/components/settings/tabs/AiTab.svelte`
- `src/components/shared/InfoTip.svelte`
- PR: #4537 (squash-merged into `develop`)
