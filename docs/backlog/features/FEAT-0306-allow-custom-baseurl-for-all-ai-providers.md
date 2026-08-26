---
id: FEAT-0306
title: Allow custom baseUrl configuration for all AI providers
type: feature
status: specced
priority: P2
milestone: M8
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
start_date: 2026-08-25
size: S
estimate: 1
---


# FEAT-0306 Allow custom baseUrl configuration for all AI providers

## Problem

Currently, only the Ollama provider proxy (`/api/ai/ollama`) respects a user-configured
`baseUrl` (mapped via `AiRequestSchema`, `src/types/ai.ts:33`). The other providers
(OpenAI, Anthropic, Gemini, OpenRouter) have hardcoded base URLs in their respective
proxy routes.

A trader running a local OpenAI-compatible routing server (like OmniRouter, LiteLLM, or
a corporate gateway) cannot point Cachy at it if they select the OpenAI or Anthropic
provider — those requests always go to the default public endpoints.

## Proposal

Extend the AiRequestSchema and the provider configurations so that any AI provider
can optionally use a custom `baseUrl`. If configured in the user's AI settings, this
URL is passed to the proxy route, which then uses it in place of the default vendor
endpoint.

Because API keys stay local and are only sent to the proxy (per ADR-0001 / ADR-0011),
pointing the OpenAI provider to a local OmniRouter instance means credentials,
system prompts, and rule proposals safely remain in the user's trusted environment
instead of traveling to `api.openai.com`.

## Acceptance criteria

- `AiRequestSchema` (`src/types/ai.ts`) extends `baseUrl` to all providers, not just Ollama.
- Provider proxy routes (`src/routes/api/ai/*/+server.ts`) read and use the `baseUrl` from the body if provided.
- The AI Settings UI exposes an "Override API endpoint (Base URL)" field for all providers.
- A test verifies that calling the OpenAI backend with a custom `baseUrl` routes the fetch call to the custom URL, appending the correct `/chat/completions` path suffix.

## Out of scope

- Changes to request body mapping. The custom endpoint must accept the provider's native format (e.g., Anthropic format for the Anthropic proxy, OpenAI format for the OpenAI proxy).

## Open questions

- None.

## Links

- `src/types/ai.ts:33` (`AiRequestSchema`)
- `src/routes/api/ai/openai/+server.ts`
