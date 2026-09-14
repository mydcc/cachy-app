---
id: FEAT-0467
title: User-managed AI providers with per-provider endpoints and API formats
type: feature
status: done
priority: P2
milestone: M8
editions: [community, pro, private]
area: ai
data_class: A
adr: ADR-0019
depends_on: []
size: XL
estimate: 20
assignee: opencode
---

# FEAT-0467 — User-managed AI providers with per-provider endpoints and API formats

> **State:** `done`. Shipped across #3274, #3277, #3278, #3279, #3284, #3286,
> #3288 and #3291 (v1.6.0-beta.307); every slice landed.

## Problem

Cachy supports exactly five AI providers (Ollama, OpenRouter, OpenAI, Gemini,
Anthropic). Each is hardcoded in four places — the `AiProvider` union and its
settings fields, the settings UI, the model-list route, and the `sendMessage`
branch in `src/stores/ai.svelte.ts`. A trader who wants an aggregator such as
OpenCode Zen, OpenCode Go or Command Code can only abuse the *OpenAI* provider's
custom `baseUrl`, and:

- the OpenAI `/models` route filters IDs with `/^(gpt-|o1|o3|o4|chatgpt)/i` and
  an exclusion regex, so `deepseek-*`, `glm-*`, `kimi-*` and every `*-free`
  model the provider returns are hidden (`src/routes/api/ai/openai/models/+server.ts`);
- the streaming parser only understands OpenAI Chat Completions
  (`choices[0].delta`), so models served over OpenAI *Responses*, Anthropic
  *Messages* or Google `generateContent` produce an empty stream;
- a loopback/private custom `baseUrl` is now correctly rejected by the SSRF
  guard, so a local gateway cannot be reached through the hosted server at all.

There is no generic way to add a provider, and keys still transit the Cachy
proxy hop described in [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md).

## Proposal

Turn providers into a registry keyed by wire-format flavor, per
[`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md),
and ship it in reviewable slices:

| # | Slice | Scope |
| --- | --- | --- |
| 1 | Provider registry | New pure module `src/stores/settings/aiProviders.ts`: `AiApiFlavor`, `ProviderConfig`, built-in presets, validation, migration from the fixed fields. |
| 2 | Multi-provider management UI | Add/edit/remove providers (pattern of `AccountList`/`AccountCard`), flavor picker, base URL, key, model, per-provider "test connection". |
| 3 | Encrypted provider keys | Arbitrary provider keys are Class A: encrypt via `secretsLoader`, keyed by provider id like `encryptedAccountKeys`. |
| 4 | Flavor stream adapters | `src/lib/ai/streamAdapters.ts` with one adapter per flavor (chat-completions, responses, messages, google-generate) normalizing text, tool calls and usage. |
| 5 | Browser-direct transport + opt-in relay | Client talks to the provider directly by default; the existing server proxy is retained only as a per-provider, default-off, SSRF-guarded, no-log relay. |
| 6 | Consumption display | Surface tokens (and cost when the provider returns prices, e.g. OpenRouter) per message/provider; "n/a" when unknown. |
| 7 | Model discovery | Flavor-agnostic `/models` parsing with provider pricing; remove vendor-specific allowlists. |

## Acceptance criteria

- [x] A user can add a custom provider (label, flavor, base URL, API key, model)
      and chat through it; OpenCode Zen, OpenCode Go and Command Code each work
      end-to-end, including at least one free model.
- [x] The model picker lists every model the provider returns for custom
      endpoints, with free models identifiable and prices shown when offered.
- [x] OpenAI Chat Completions, OpenAI Responses, Anthropic Messages and Google
      `generateContent` streaming all render text and tool calls correctly
      (fixture-backed adapter tests).
- [x] Provider API keys never transit the Cachy server unless the user has
      enabled the per-provider relay for a provider that cannot be reached
      cross-origin; the relay is default-off, SSRF-guarded and never logs the
      key or prompt.
- [x] The per-provider server proxy still rejects reserved/loopback hosts with
      403 (regression coverage for the completed `BUG-0291`).
- [x] Existing built-in provider settings migrate into the registry with no
      credential loss; an encrypted-key round-trip test passes.
- [x] Sending Class A context still requires `aiShareTradeContext` consent
      (`ADR-0011`), unchanged.

## Out of scope

- New AI *capabilities* (agents, embeddings, image/audio models); this is about
  *transport and provider management*.
- Server-side provider inference or any Cachy-operated model gateway.
- Reworking the chat UI beyond what provider selection and consumption display
  require.
- Changing the position-size / risk math or the tool-call action schema.

## Links

- [`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md)
- [`ADR-0011`](../../adr/0011-ai-context-consent-and-local-boundary.md), [`ADR-0013`](../../adr/0013-client-side-exchange-signing.md), [`ADR-0018`](../../adr/0018-user-directed-egress-of-class-a-announcements.md)
- [`FEAT-0306`](FEAT-0306-allow-custom-baseurl-for-all-ai-providers.md) — custom base URL, now constrained by the SSRF guard
- [`BUG-0291`](../bugs/BUG-0291-ssrf-ai-proxy-baseurl.md) — reserved-host guard, completed for all proxy routes
- `src/stores/ai.svelte.ts`, `src/services/aiModelsService.ts`, `src/components/settings/tabs/AiTab.svelte`
- `src/routes/api/ai/*`, `src/lib/server/urlValidator.ts`, `src/lib/server/aiEndpoint.ts`
