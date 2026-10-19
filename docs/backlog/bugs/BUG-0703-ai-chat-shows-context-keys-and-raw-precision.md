---
id: BUG-0703
title: The assistant lists context keys as sources and repeats raw float precision
type: bug
status: done
branch: fix/ai-chat-source-labels
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0703 — The chat's source footer reads like a debug dump

Reported after BUG-0702 shipped and the OpenCode provider answered for the
first time.

## Symptom

Two things in the answer read like developer output instead of a written
analysis:

1. The footer lists context keys verbatim:

   ```
   Quellen: REAL_TIME_PRICE, marketDetails.high24h, marketDetails.low24h,
   marketDetails.fundingRate, technicals.confluence, technicals.divergences,
   technicals.oscillators, technicals.movingAverages, technicals.pivots.classic,
   technicals.volatility, technicals.higherTimeframe
   ```

2. Levels and distances keep four decimals (`82209.4676`, `39.4333`).

## Cause

1. **The footer is a prompt instruction.** `src/lib/ai/prompts/safetyRules.ts`
   rule 2 tells the model to list the data **keys** ("List the data keys you
   relied on … Example: `Quellen: REAL_TIME_PRICE, latestNews.ago`"). The model
   follows it exactly; the words simply never had a translation.
2. **The precision is a contradiction in the prompt.** Rule 5 said "follow the
   rounding rules defined in TONE & STYLE" — and TONE & STYLE contained no such
   rule, only the opposite: `EXACT STRINGS: DO NOT round numbers yourself! …
   If the JSON says '72.3566', you must write '72.3566', not '72.35'`. The
   context serializes indicators with `indicatorState.precision` (default 4),
   so the model echoed four-decimal floats by instruction.

## Acceptance criteria

- [x] The footer shows words in the UI language, not keys.
- [x] A key the map does not know stays visible — hiding it would hide which
      data the model used.
- [x] Prose that happens to mention a key is not rewritten; only the footer line is.
- [x] The prompt asks for 2 decimals in the visible text and keeps exact values
      for calculations and JSON actions.
- [x] The context itself stays exact — no rounding of the data the model reasons
      about.

## Fix

- `src/lib/ai/sourceLabels.ts` (new) — `SOURCE_LABELS` maps the ~27 known
  context paths (plus their parents) to `assistant.sources.*` keys, and
  `humanizeSourceFooter()` rewrites the `Quellen:`/`Sources:` line: known key →
  localized label, unknown key → verbatim, leaf under a known parent → the
  parent's label, duplicates collapse. The map is prefix-aware so
  `marketDetails.orderbook.topBids` reads as "Orderbuch".
- `src/actions/markdown.ts` — applies it before `renderSafeMarkdown`, so every
  `use:markdown` consumer gets the same treatment and the keys stay in the
  stored message.
- `src/lib/ai/prompts/safetyRules.ts` — rule 5 and the TONE & STYLE formatting
  rule now separate the two jobs: exact values for calculations and JSON
  actions, at most 2 decimals in prose. Rule 8 says explicitly that rounding
  for the visible text is not a modification.
- `src/locales/locales/{de,en}.json` — `assistant.sources.*` (27 keys each).

## Verification

- `src/lib/ai/sourceLabels.test.ts` (new): known keys, unknown keys, parent
  fallback, markup wrappers (`<small>`, `**`, backticks), the English footer
  label, collapsing duplicates and untouched prose.
- `src/tests/ai/prompts.test.ts`: the prompt contains `NUMBER PRESENTATION` and
  the 2-decimal rule, and no longer contains `DO NOT round numbers yourself`.
- RED proof: the footer test fails when the mapping is skipped; the prompt test
  fails against the old `EXACT STRINGS` line.
- `npm run backlog:check`, `eslint`, `svelte-check` and the targeted Vitest run
  are recorded in the PR.

## Not covered

How closely a model follows the 2-decimal rule in prose is not testable here —
the prompt test pins the instruction, not a provider's compliance. The failure
mode is a long number on screen, never wrong data: the context is untouched.
