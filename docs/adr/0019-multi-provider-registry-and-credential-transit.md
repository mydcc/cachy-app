# ADR-0019: User-managed AI providers, wire-format flavors, and the credential-transit boundary

- **Status:** Accepted
- **Date:** 2026-09-13
- **Deciders:** @mydcc

## Context

Cachy's AI chat supports a fixed set of providers (`AiProvider` in
[`settings.svelte.ts`](../../src/stores/settings.svelte.ts)): Ollama, OpenRouter,
OpenAI, Gemini and Anthropic. Each has its own settings fields, its own proxy
route under `src/routes/api/ai/`, and its own branch in the send path. A trader
who wants to use an OpenAI-compatible aggregator (OpenCode Zen, OpenCode Go,
Command Code, a corporate gateway, LiteLLM, OmniRoute) can only point the
*OpenAI* provider at a custom `baseUrl` — and, as of the SSRF fix that completed
[`BUG-0291`](../backlog/bugs/BUG-0291-ssrf-ai-proxy-baseurl.md), only when that
host is publicly reachable from the Cachy server. Adding a provider today means
touching five places, and non-GPT models are hidden by an OpenAI-specific model
filter.

Three facts constrain the design:

1. **Wire formats differ.** Most aggregators speak OpenAI *Chat Completions*
   (`/v1/chat/completions`), but frontier models are increasingly served over the
   OpenAI *Responses* API (`/v1/responses`), Anthropic *Messages*
   (`/v1/messages`), or Google's `generateContent`. A provider is therefore a
   *flavor* plus an endpoint, not a single hardcoded shape.
2. **Keys are Class A.** [`ADR-0001`](0001-local-first-boundary.md) puts API keys
   in the class that never leaves the device. [`ADR-0013`](0013-client-side-exchange-signing.md)
   removed raw exchange credentials from server transit; [`ADR-0018`](0018-user-directed-egress-of-class-a-announcements.md)
   forbids routing a Class A credential through a Cachy-operated relay, because
   the relay would see the secret. The current AI proxy routes do exactly that:
   the browser sends `x-api-key` to `/api/ai/*`, which forwards it.
3. **`baseUrl` is server-side fetch.** Once a URL reaches the server, it must
   pass the reserved-host guard (`src/lib/server/urlValidator.ts`); a local
   gateway on the user's machine is not reachable from a hosted Cachy server
   anyway.

## Decision

1. **Providers become a registry keyed by wire-format flavor.** A provider is
   `{ id, label, flavor, baseUrl, model, apiKey, allowServerRelay }`, where
   `flavor ∈ { openai-chat, openai-responses, anthropic-messages, google-generate }`.
   The built-in providers are presets of this registry, not a separate union, and
   a trader may add, edit and remove their own entries. All existing provider
   settings migrate into the registry.

2. **Credentials are Class A and default to browser-direct transport.** The
   client talks to the chosen provider from the page, so the key never reaches
   Cachy infrastructure. This is the default for every provider, new and
   built-in, wherever the provider answers a cross-origin request.

3. **A per-provider, opt-in server relay is the sanctioned fallback.** When a
   provider does not accept a browser cross-origin request, the trader may
   explicitly enable a relay for that provider. The relay is default-off, labeled
   as a credential hop in the UI, restricted to the configured endpoint,
   guarded by the shared reserved-host validator (including dial-time DNS), and
   never logs the key or the prompt. Consent to send Class A *context* remains
   governed by [`ADR-0011`](0011-ai-context-consent-and-local-boundary.md) and is
   unchanged.

4. **The model list is flavor-agnostic.** Each flavor's adapter parses its own
   `/models` (or equivalent) response and surfaces pricing when the provider
   offers it; no provider-specific allowlist may hide models a provider returns.

5. **Streaming is parsed per flavor.** One adapter per flavor normalizes SSE
   chunks into text, tool calls and usage, so multi-format providers
   (e.g. OpenCode Zen serving some models over Chat Completions and others over
   Responses/Messages) work without provider-specific send logic.

## Consequences

### Positive

- Any OpenAI-, Anthropic- or Google-compatible provider works, including the
  free tiers of aggregators such as OpenCode Zen.
- The default path removes Class A keys from Cachy server transit, consistent
  with ADR-0013 and the principle in ADR-0018.
- Provider behavior lives in one registry and four adapters instead of five
  parallel hardcoded branches.
- Consumption (tokens, and cost when prices are known) can be surfaced from the
  usage each provider already returns.

### Negative / Trade-offs

- Browser-direct requests require the provider to send permissive CORS headers;
  providers that do not need the explicit relay opt-in to function at all.
- The sanctioned relay is a deliberate, user-visible exception to the zero-transit
  default — documented here rather than silent, with the SSRF guard as its
  hard constraint.
- More surface: a provider registry, an encryption path for arbitrary provider
  keys, and four stream adapters to test.

### What is now forbidden

- Adding a provider by hardcoding a new field on `Settings` and a new branch in
  `sendMessage`, rather than a registry entry plus a flavor.
- A server relay that is enabled by default, that forwards to a host other than
  the provider's configured endpoint, or that writes the key or prompt to a log.
- A model picker that filters out IDs the provider returned because they do not
  match a vendor-specific pattern.

## References

- [`ADR-0001: Local-First boundary`](0001-local-first-boundary.md)
- [`ADR-0011: AI context consent and local-first egress`](0011-ai-context-consent-and-local-boundary.md)
- [`ADR-0013: Client-side exchange signing`](0013-client-side-exchange-signing.md)
- [`ADR-0018: User-directed egress of Class A announcements`](0018-user-directed-egress-of-class-a-announcements.md)
- [`FEAT-0467`](../backlog/features/FEAT-0467-multi-provider-management.md)
- `src/lib/server/urlValidator.ts`, `src/lib/server/aiEndpoint.ts`
