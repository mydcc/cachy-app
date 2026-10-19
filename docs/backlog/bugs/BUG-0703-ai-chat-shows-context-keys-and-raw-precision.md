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

Two things in an answer read like developer output instead of a written
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

1. **The footer is a prompt instruction.** `safetyRules` rule 2 tells the model
   to list the data **keys** ("List the data keys you relied on … Example:
   `Quellen: REAL_TIME_PRICE, latestNews.ago`"). The model follows it exactly;
   the words simply never had a translation.
2. **The precision is a contradiction spread over three rules.**
   - `safetyRules` rule 5 pointed at "the rounding rules defined in TONE &
     STYLE", where no such rule existed.
   - The TONE & STYLE formatting rule said the opposite: `EXACT STRINGS: DO NOT
     round numbers yourself! … If the JSON says '72.3566', you must write
     '72.3566', not '72.35'`.
   - `baseRole`'s `NEGATIVE CONSTRAINTS (CRITICAL)` said `NO ROUNDING: Never
     round numbers provided in the context` — and `baseRole` is concatenated
     **before** `safetyRules` into the same system prompt.
   - The pre-send checklist still demanded a `verbatim` match, so a correctly
     rounded prose value would have tripped the FATAL ERROR CHECK.

   The context serializes indicators with `indicatorState.precision` (default
   4), so the model echoed four-decimal floats by instruction.

## Acceptance criteria

- [x] The footer shows words in the UI language, not keys, and the footer's own
      word follows the UI language too.
- [x] A key the map does not know stays visible — hiding it would hide which
      data the model used.
- [x] Prose that happens to mention a key is not rewritten; only the footer is.
- [x] The prompt asks for 2 decimals in the visible text and keeps exact values
      for calculations and JSON actions — with no blanket prohibition left
      anywhere in the assembled prompt.
- [x] A value below 0.01 is never rounded to 0.01 (a 19 % error on a sub-cent
      price).
- [x] The context itself stays exact — no rounding of the data the model reasons
      about.

## Fix

- `src/lib/ai/sourceLabels.ts` (new) — `SOURCE_LABELS` maps the known context
  paths (plus their parents) to `assistant.sources.*`; `humanizeSourceFooter()`
  rewrites the footer. It handles the shapes a model produces: `Quellen:` or
  `Sources:`, a leading list/quote marker (`- `, `> `), `<small>` and bold
  wrappers, a list that starts on the next line as bullets, and a list wrapped
  at a comma — a wrapped list is folded into one line. Fenced code is skipped
  (a sample must stay a sample), unknown keys stay verbatim, a leaf under a
  known parent falls back to the parent's word, duplicates collapse, and labels
  are markdown-escaped before they enter the parser.
- `src/actions/assistantMarkdown.ts` (new) — the assistant-specific action:
  rewrites, renders, and re-renders when the UI language changes. The generic
  `markdown` action is back to plain rendering, so the other consumers
  (flashcards, pattern views, lessons) cannot inherit assistant domain logic.
- `src/lib/windows/implementations/AssistantView.svelte` — uses
  `use:assistantMarkdown`.
- `src/lib/ai/prompts/safetyRules.ts` — rule 5 and the TONE & STYLE rule now
  separate the two jobs: exact values for calculations and JSON actions, at
  most 2 decimals in prose, never below 0.01, ATR and percentages never
  rounded. The formatting rule is now `NUMBER PRESENTATION`; the FATAL ERROR
  CHECK accepts a rounded form in prose; the currency rule no longer says "the
  raw number as provided"; the numbering gap (5, 6, 8) is closed.
- `src/lib/ai/prompts/baseRole.ts` — `NO ROUNDING` became `NO FABRICATION`:
  inventing or modifying a context value stays forbidden, rounding for the
  visible text is allowed.
- `src/locales/locales/{de,en}.json` — `assistant.sources.*` (28 keys,
  including the footer word and a distinct "Marktkurs"/"Market price" so
  `REAL_TIME_PRICE` and `marketDetails.currentPrice` do not read as two names
  for one value).
- `src/locales/i18n.ts` — the indicator words are in `TECHNICAL_KEYS`, so
  "Force English Technical Terms" does not split one term across two languages
  on one screen.
- `src/stores/ai.svelte.ts` — `marketDetails.volume24h` is sent in the machine
  format the prompt requires instead of `toLocaleString()` (which produced
  `1.234.567` on a German device).

## Verification

- `src/lib/ai/sourceLabels.test.ts` — known keys, unknown keys, parent fallback,
  quoted keys, list/quote markers, wrapped lists, a list on the next line,
  fenced code, bold, empty lists, mid-line prose, label escaping, dedupe, the
  context-key coverage, and the "no two labels share a word" invariant in both
  languages.
- `src/actions/assistantMarkdown.test.ts` — through the real action and the real
  locale files: English output, German output, a language switch re-renders,
  and a code sample stays untouched. The old `markdown.test.ts` is gone with the
  moved responsibility.
- `src/tests/ai/prompts.test.ts` — the **assembled** prompt contains the
  exact-values rule, `**NUMBER PRESENTATION**`, the 0.01 floor, and no
  `NO ROUNDING` / `Never round numbers provided in the context` / `DO NOT round
  numbers yourself`.
- RED proofs by mutation: the baseRole prohibition restored, the 0.01 floor
  removed from the rule, the fence guard removed, the locale subscription
  removed, the rewrite not called.
- `npm run backlog:check`, `eslint`, `svelte-check` and the targeted Vitest run
  are recorded in the PR.

## Not covered

How closely a provider follows the 2-decimal rule in prose cannot be tested
here — the test pins the instruction, not a provider's compliance. The failure
mode is a long number on screen, never wrong data: the context is untouched.

The code-level guard for AI action values (entry, stop loss, take profit) is
separate work: `actionValidation.ts` checks the shape, not whether a value
matches the context. Tracked as BUG-0704.
