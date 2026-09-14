---
id: FEAT-0471
title: Single AI provider registry with five tabs and fetched model pickers
type: feature
status: done
priority: P2
milestone: M8
editions: [community, pro, private]
area: ai
data_class: A
adr: ADR-0019
depends_on: [FEAT-0467]
---

# FEAT-0471 — Single AI provider registry with five tabs and fetched model pickers

> **State:** `done`. Implemented and proven in #3311 (closes #3312); ships
> with the release that merges it. Follow-up of
> [`FEAT-0467`](FEAT-0467-multi-provider-management.md) (done, shipped in
> v1.6.0-beta.307), which left two parallel systems: per-vendor settings
> fields plus a separate custom list.

## Problem

After FEAT-0467, built-in providers (Ollama, OpenRouter, OpenAI, Gemini,
Anthropic) still live in their own settings fields and tab branches, while
user-added providers live in a parallel `userProviders` list. Gate
(`hasApiKey`), send path and model picker each resolve the active provider
differently, so the "setup required" overlay, the chat transport and the
model list can disagree. Model pickers only fetch through the server relay;
with relay off the model has to be typed by hand. OpenRouter occupies a
whole tab although it is just an OpenAI-compatible endpoint.

## Proposal

One registry, five tabs, always-fetched pickers, per
[`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md)
(amendment 2026-09-14):

- `userProviders` is the single source of truth. The four built-ins are
  seeded entries (`builtin-*`), migrated once from the legacy fields; the
  `builtin-` prefix keeps them clear of user UUIDs and of the reserved ids
  `sanitizeUserProviders` drops, so seeding is idempotent and never wipes
  edited entries.
- Provider switcher is five tabs: Ollama, OpenAI, Gemini, Anthropic, Custom.
  OpenRouter is not a tab — it is a preset in the add-dropdown, migrated
  from the legacy `aiProvider: "openrouter"` state on load.
- Adding a provider offers vendor presets (xAI, DeepSeek, Mistral, Groq,
  OpenRouter, OpenCode Zen, OpenCode Go, Command Code, local OmniRoute,
  blank) that pre-fill label, flavor and base URL; every field stays
  editable, including the URL.
- Model lists are always fetched, never typed: browser-direct per flavor by
  default (key never reaches Cachy's server), via the server model-list
  route only when the entry allows relay. Loopback roots are always
  browser-direct — the server proxy rejects reserved hosts by design, so
  relay is not offered for them (checkbox disabled).
- Gate, send path and picker resolve the same active registry entry
  (`resolveActiveProvider`); the legacy fields remain only as a transient
  fallback before the first ensure-run.
- Relayed OpenRouter traffic goes through the openai route (wire format
  picks the route); the route re-attaches the `X-Title` attribution header
  when the target is openrouter.ai.

## Acceptance criteria

- [x] Switcher shows the four built-ins plus Custom; OpenRouter is a preset,
  not a tab, and legacy `aiProvider: "openrouter"` state migrates to a
  preset entry preserving key and model.
- [x] Gate, send path and picker resolve one registry entry; a configured
  custom provider unlocks the assistant, a keyless one keeps the overlay
  (pinned by gate tests against `resolveActiveProvider`).
- [x] Seeding is idempotent: re-running the ensure never touches existing
  entries, so no credential or model edit is lost on reload.
- [x] Picker fetches for every entry (direct by default, server only with
  relay, loopback always direct); no manual model typing remains.
- [x] Browser-direct model-list requests carry the key in headers only
  (`x-goog-api-key` for Google, never the URL).
- [x] Server-relayed OpenRouter requests keep the `X-Title: Cachy`
  attribution header (route test).
- [x] Keys never transit the server unless relay is enabled for that entry;
  relay stays SSRF-guarded (BUG-0291 regression coverage intact).
- [x] ADR-0019 amendment records tabs, presets and model transport.

## Out of scope

- New AI *capabilities* (agents, embeddings, image/audio models); transport
  and provider management only, as in FEAT-0467.
- Removing the legacy per-vendor settings fields or the dedicated
  `/api/ai/openrouter` routes; both stay as fallback/compat.
- Server-side provider inference or any Cachy-operated model gateway.
- Reworking the chat UI beyond provider selection.

## Links

- [`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md)
  (amendment 2026-09-14), [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md)
- [`FEAT-0467`](FEAT-0467-multi-provider-management.md) — predecessor, done
- `src/stores/settings/aiProviders.ts`, `src/stores/ai.svelte.ts`,
  `src/components/settings/tabs/AiTab.svelte`,
  `src/components/settings/AiProviderManager.svelte`,
  `src/components/settings/ProviderCard.svelte`
- PR #3311, tracking issue #3312
