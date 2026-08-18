---
id: FEAT-0239
title: "Epic: AI Prompt Architecture & Safety Refactoring"
type: feature
status: done
priority: P1
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
estimate: 8
size: L
---

# FEAT-0239 — Epic: AI Prompt Architecture & Safety Refactoring

> **Tracking epic.** The work itself lives in seven focused sub-items:
> [`FEAT-0245`](FEAT-0245-prompt-templating-versioning.md),
> [`BUG-0246`](../bugs/BUG-0246-implicit-analysis-mode-coupling.md),
> [`BUG-0241`](../bugs/BUG-0241-custom-prompt-overwrites-safety.md),
> [`BUG-0243`](../bugs/BUG-0243-risk-reward-guard-non-blocking.md),
> [`BUG-0244`](../bugs/BUG-0244-fragile-prompt-leak-workaround.md),
> [`FEAT-0240`](FEAT-0240-prompt-caching.md), and
> [`FEAT-0242`](FEAT-0242-structured-function-calling.md).
> This item holds shared rules, safety constraints, and sequencing; it closes when all sub-items are `done`.

## Problem

The AI integration in `src/stores/ai.svelte.ts` has grown into a large inline monolith suffering from several structural and safety deficiencies:

1. **Safety rules overwritten:** Setting `customSystemPrompt` in settings replaces all base safety rules (anti-hallucination constraints, mandatory source citation, non-rounded decimal format enforcement) due to `settings.customSystemPrompt || baseRoleInstructions` (`BUG-0241`).
2. **Non-blocking R:R guard:** When the AI generates a trading setup with a dangerous or poor Risk:Reward ratio (< 1.5), the guard merely logs a warning and allows automated action execution to proceed even when user confirmation is disabled (`BUG-0243`).
3. **Fragile regex-based action parsing:** Trading actions are extracted by asking the LLM to output markdown JSON codeblocks and stripping them with regex. This is brittle, vulnerable to markdown/comment formatting quirks, and occasionally leaks raw JSON into chat messages (`FEAT-0242`).
4. **Fragile prompt leak heuristic:** Streaming responses from Gemini/Gemma use a magic chunk length check (`delta.length > 600`) to detect system prompt leaks caused by manual string prepending instead of native API fields (`BUG-0244`).
5. **No prompt caching:** Over 100 lines of static base instructions and constraints are re-sent with every single message alongside dynamic real-time market context, driving up latency and token cost unnecessarily (`FEAT-0240`).
6. **No prompt modularity or snapshot tests:** The complete prompt is assembled as a huge multiline template string inside `sendMessage()`, with no unit/snapshot test coverage against prompt regressions (`FEAT-0245`).
7. **Implicit magic empty string coupling:** `modeInstructions.risk` uses `""` (empty string) to mean "standard behavior", creating fragile fallback logic (`BUG-0246`).

## Proposal

Decompose the AI store and prompt pipeline into a modular, testable, and safety-hardened architecture across 7 distinct pull requests.

### Phased Sequencing

| Phase | Item | Focus | Area |
| --- | --- | --- | --- |
| **1. Foundation** | [`FEAT-0245`](FEAT-0245-prompt-templating-versioning.md) | Extract modular prompt builders & snapshot tests | ai |
| **1. Foundation** | [`BUG-0246`](../bugs/BUG-0246-implicit-analysis-mode-coupling.md) | Explicit mode configuration types & defaults | ai |
| **2. Safety** | [`BUG-0241`](../bugs/BUG-0241-custom-prompt-overwrites-safety.md) | Additive prompt architecture (immutable safety core) | ai |
| **2. Safety** | [`BUG-0243`](../bugs/BUG-0243-risk-reward-guard-non-blocking.md) | Block or require explicit confirmation for low R:R | execution |
| **2. Safety** | [`BUG-0244`](../bugs/BUG-0244-fragile-prompt-leak-workaround.md) | Native `systemInstruction` in Gemini proxy & remove length hack | ai |
| **3. Optimization** | [`FEAT-0240`](FEAT-0240-prompt-caching.md) | Provider prompt caching for static prefixes | ai |
| **3. Reliability** | [`FEAT-0242`](FEAT-0242-structured-function-calling.md) | Native Tool/Function calling for trading actions | ai |

### Rules across all sub-items

- **Local-First Boundary:** User API keys remain local (Class A); market context is Class C. Private journal notes are never sent without explicit opt-in.
- **Runes Only:** Svelte 5 runes (`$state`, `$derived`, `$effect`) only.
- **Precision:** Financial calculations (R:R, entry/SL distances) strictly use `decimal.js`.

## Acceptance criteria

- [ ] All 7 sub-items are completed and verified:
  - [ ] [`FEAT-0245`](FEAT-0245-prompt-templating-versioning.md)
  - [ ] [`BUG-0246`](../bugs/BUG-0246-implicit-analysis-mode-coupling.md)
  - [ ] [`BUG-0241`](../bugs/BUG-0241-custom-prompt-overwrites-safety.md)
  - [ ] [`BUG-0243`](../bugs/BUG-0243-risk-reward-guard-non-blocking.md)
  - [ ] [`BUG-0244`](../bugs/BUG-0244-fragile-prompt-leak-workaround.md)
  - [ ] [`FEAT-0240`](FEAT-0240-prompt-caching.md)
  - [ ] [`FEAT-0242`](FEAT-0242-structured-function-calling.md)
- [ ] No regression in chat streaming across OpenAI, Anthropic, Gemini, OpenRouter, and Ollama.
- [ ] Automated snapshot and unit tests exist for prompt generation and action handling.

## Out of scope

- Adding new AI providers or models beyond current supported set.
- Replacing the client-side chat interface components.

## Open questions

- None.

## Links

- Sub-items:
  - [`FEAT-0240`](FEAT-0240-prompt-caching.md)
  - [`BUG-0241`](../bugs/BUG-0241-custom-prompt-overwrites-safety.md)
  - [`FEAT-0242`](FEAT-0242-structured-function-calling.md)
  - [`BUG-0243`](../bugs/BUG-0243-risk-reward-guard-non-blocking.md)
  - [`BUG-0244`](../bugs/BUG-0244-fragile-prompt-leak-workaround.md)
  - [`FEAT-0245`](FEAT-0245-prompt-templating-versioning.md)
  - [`BUG-0246`](../bugs/BUG-0246-implicit-analysis-mode-coupling.md)
- GitHub Epic Issue: #2074
