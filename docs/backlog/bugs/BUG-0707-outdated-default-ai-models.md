---
id: BUG-0707
title: Default AI models reference outdated model generations
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
size: XS
estimate: 2
assignee: opencode
branch: fix/ai-model-defaults-and-tp-overwrite
---

# BUG-0707 — Default AI models reference outdated model generations

## Symptom

A fresh install starts on the Gemini provider with `gemini-1.5-flash`; OpenAI
defaults to `gpt-4o`. Both are older generations. If the provider no longer
serves them (or retires them), the very first AI request fails with a
model-not-found/deprecated-model error even though the user changed nothing.
New users hit a broken AI feature before they had a chance to misconfigure
anything.

## Evidence

**Derived** — the failure was not observed against the live APIs in this
session; it follows from the shipped defaults. Whether the providers currently
reject these IDs must be checked against the providers' model lists at fix
time.

- `src/stores/settings/settingsTypes.ts` — `defaultSettings` ships
  `aiProvider: "gemini"`, `geminiModel: "gemini-1.5-flash"`,
  `openaiModel: "gpt-4o"`, `anthropicModel: "claude-sonnet-5"`.
- `src/stores/settings/aiProviders.ts` — the provider registry repeats the same
  IDs: `defaultModel: "gpt-4o"` (line 118), `"gemini-1.5-flash"` (line 127),
  `"claude-sonnet-5"` (line 136). Two independent places hold the same values.
- `src/stores/settings/migrations.ts:75-78` — a migration deliberately pins
  `geminiModel` to `gemini-1.5-flash` "for stability", so stored profiles that
  still carry an older value get forced onto the same outdated ID.
- `src/services/newsService.ts:462` and
  `src/routes/api/sentiment/+server.ts:142-143` carry additional fallback model
  IDs in the same generation.

## Cause

Model IDs are hard-coded in more than one place and were not revisited when
newer generations shipped. Because both the default provider and the default
model point at the Gemini path, the first request a new user makes is the most
likely to hit a retired model.

## Fix

1. Research the currently served, cost-effective default per built-in provider
   (Gemini, OpenAI, Anthropic) against each provider's own model list.
2. Make the provider registry (`aiProviders.ts`) the single source for
   `defaultModel`; `defaultSettings` derives from it, or a test pins the two
   equal so they cannot drift again.
3. Update the migration pin only if it would otherwise force a retired ID; do
   not rewrite user-saved models.
4. Add a guard test: every shipped default model is non-empty and appears in
   the registry's known-model list for that provider.

## Acceptance criteria

- [x] A fresh profile's default model per provider is one the provider
      currently serves (verified against the provider's model list at
      implementation time).
- [x] `defaultSettings` model values and the provider registry's `defaultModel`
      values come from one source or are pinned equal by a test.
- [x] No migration forces a retired Gemini model onto existing profiles.
- [x] A test fails when a default model is empty or absent from the known-model
      list.
- [x] No behaviour change beyond model IDs.

## Progress — 2026-10-21

Branch `fix/ai-model-defaults-and-tp-overwrite`. Checked against the vendors'
own model lists on 2026-10-21 (Google AI for Developers, OpenAI API docs,
Anthropic models overview):

| Provider | Was | Now |
| --- | --- | --- |
| Gemini | `gemini-1.5-flash` | `gemini-3.5-flash-lite` (current cost-effective Flash-Lite) |
| OpenAI | `gpt-4o` | `gpt-5.4-mini` |
| Anthropic | `claude-sonnet-5` | `claude-sonnet-5-5` |

`claude-sonnet-5` was superseded, not retired (Anthropic lists it active until
at least 2027-06-30); the change is a freshness upgrade. `gemini-1.5-flash`
and `gemini-2.0-flash` are shut down, `gpt-4o`/`gpt-4o-mini` are deprecated
with removal on 2027-01-14.

The old IDs also leave the news/sentiment fallbacks, the route defaults and the
migration pins. `KNOWN_MODELS` in `aiProviders.ts` lists what each built-in is
known to serve; `aiProviders.defaults.test.ts` pins `defaultSettings` to the
registry, requires a known entry for every shipped default, scans the live
fallback files for retired IDs, and checks the migration targets. Verified RED
by reverting the Gemini default, the news fallback and the migration pin.

Two review findings changed the shape of the fix:

- **`max_completion_tokens`**: OpenAI's GPT-5.x reasoning models reject
  `max_tokens`, so the shipped `gpt-5.4-mini` default would have failed its
  first request. The OpenAI route and `directRequest` now send
  `max_completion_tokens` when the host is `api.openai.com` and keep
  `max_tokens` for compatible relays that may not know the new name.
- **Existing profiles keep their stored default.** The migration only rewrites
  empty/placeholder/legacy IDs, per the "do not rewrite user-saved models" AC —
  so an install that persisted `gemini-1.5-flash` keeps it until the user picks
  a model. That is deliberate, not an oversight.

## Out of scope

- Adding providers, changing routing/fallbacks or prompt content.
- Rewriting user-saved model choices or changing the model-picker UI
  (FEAT-0471 owns the picker).
- Runtime model discovery beyond what the picker already performs.

## Open questions

- Which models are current, and what is the right cost/quality default per
  provider? (Research step at implementation time.)
- Should the sentiment/news fallback lists move to the registry as well, or is
  that a separate cleanup?

## Links

- `src/stores/settings/settingsTypes.ts` — `defaultSettings`
- `src/stores/settings/aiProviders.ts` — provider registry (`defaultModel`)
- `src/stores/settings/migrations.ts` — Gemini model pin
- `src/services/newsService.ts` — sentiment fallback model IDs
- `src/routes/api/sentiment/+server.ts` — Gemini fallback list
- FEAT-0471 — single provider registry with fetched model pickers
