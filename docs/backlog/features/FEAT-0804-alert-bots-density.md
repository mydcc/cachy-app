---
id: FEAT-0804
title: The alert builder and the bots tab lead with sentences, not paragraphs
type: feature
status: done
shipped: v1.6.0-beta.527 (PR #4542)
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
assignee: opencode
branch: feature/feat-0804-alert-bots-density
---

# FEAT-0804 — Cut the help paragraphs out of the two alarm windows

## Problem

Both windows the tooltip series was opened for still carried their help as
running prose above the first control:

- **Bots tab** (`src/components/alerts/bots/BotsTab.svelte`) — three paragraphs
  before anything actionable: what a bot is (145 characters), that it only
  simulates (166), and what promoting an alert does (148). Together about 460
  characters of explanation between the tab opening and the bot list.
- **Indicator builder** (`src/components/alerts/tabs/IndicatorsTab.svelte`) —
  the window reference explained in two sentences and a negation (159).

Char count alone was the wrong filter here, which is why the earlier waves
passed over both windows: every one of those strings is under 180 characters.
Length is not the symptom — four stacked explanations are.

## Fix

Each of the four moves its explanation behind the shipped `InfoTip` marker and
keeps one sentence visible. Which sentence stays is the decision, not an
accident:

| Where | Stays visible | Behind the marker |
| --- | --- | --- |
| Bots | "An alert promoted to act instead of announce." | what a bot watches, and that it is the same engine |
| Bots | "Simulated account only — nothing reaches an exchange." | that live execution is separate, with its own gate |
| Bots | "The alert stays armed; the bot is a copy." | that promoting writes beside the alert, so both run |
| Indicators | "The window includes the current candle." | what `≥ highest` / `≤ lowest` mean, and that this is not divergence |

The simulated-only sentence is the one that must never become a hover: it is
the claim a trader relies on before trusting any number on that page. Only its
explanation is folded away.

Helper text that is already a single short sentence — the group hints (47–64
characters), the dimension hint, the closed-candle hint — stays as it is. A
marker next to a sentence that fits on one line is worse than the sentence.

## Acceptance criteria

- [x] The bots tab opens with three one-line statements, none of them a
      paragraph, and the simulated-only claim is one of them.
- [x] The indicator builder's window hint is one sentence, with the operator
      semantics behind the marker.
- [x] The four new strings exist in `de.json` and `en.json`, and
      `schema.d.ts` is regenerated.
- [x] With tooltips enabled, each long text is reachable by hover, focus and
      screen reader through the marker. **With tooltips off the three
      explanations are gone** — that is `InfoTip`'s contract, not an oversight;
      the visible sentence is what remains.
- [x] The simulated-only sentence is rendered as plain copy, so it survives
      `showTooltips: false`; a test pins that configuration.
- [x] Component tests pin both halves: the short line is rendered, the long
      paragraph is not, and focusing the marker reveals it. Removing the short
      key from either component, or the marker itself, turns the suite red.

## Review follow-ups

Raised by the code review of PR #4542 and fixed in the same branch:

- **The short safety line overstated its scope.** "Nothing reaches an exchange"
  read as a product-wide guarantee, and `src/services/alertEngine/botOrders.ts:423`
  does handle `consequence_level: "send"`. It now says "nothing from this page",
  which is what the tab can promise.
- **"the bot is a copy" invited a wrong reading** — a live duplicate beside the
  alert. It now says "promoting adds a bot".
- **The tests pinned `aria-label` on a non-focusable span**, which is not how
  the text is announced. They now focus the marker and read the revealed
  tooltip, so removing the marker fails the test for the right reason.
- **Invalid nesting:** `<div role="tooltip">` inside a `<p>`. The three new
  lines are `<div>`/`.hint` containers instead, so the markup stays valid for a
  future SSR pass.
- Left as they are: `introShort` drops the "same conditions, same data, same
  engine" detail (the marker carries it), and `windowHintShort` sits above
  `closedCandleHint` without a bridging clause — the second line already says
  when evaluation happens, and a bridge would repeat it.

## Out of scope

- Re-wording the long strings themselves. They read fine once they are not
  competing for space.
- The group hints and the two one-line hints in the builder: no marker, no
  change.
- Anything in the Settings window — that series is closed
  (FEAT-0800/0801/0802).

## Links

- `src/components/shared/InfoTip.svelte` — the marker this reuses, including its
  24 × 24 hit area and its behaviour when tooltips are switched off
- FEAT-0749 — the tabs themselves
- FEAT-0800, FEAT-0801, FEAT-0802 — the settings waves that established the
  pattern
