---
id: BUG-0282
title: AI assistant sends journal, portfolio and trade setup to servers without explicit consent
type: bug
status: ready
priority: P1
milestone: none
editions: [community, pro, private]
area: ai
data_class: A
adr: required
depends_on: []
---

# BUG-0282 — AI assistant sends journal, portfolio and trade setup to servers without explicit consent

## Symptom

Using the AI assistant silently transmits Class A data off the device: up to 50
journal entries (`recentHistory`: symbol, entry/exit, PnL), `portfolioStats`,
open positions, account size and the live `tradeSetup` are embedded into prompts
proxied through `/api/ai/*` to OpenAI/Gemini/Anthropic/OpenRouter. ADR-0001
forbids exactly this; its only carve-out covers credentials of user-initiated
exchange requests. Additionally, Ollama "local" mode silently falls back to the
server proxy when the direct fetch fails — local mode leaks remotely.

## Evidence

**Derived** — from reading `src/stores/ai.svelte.ts` (`gatherContext`,
`sendMessage`) and the `/api/ai/<provider>` routes; no runtime capture was made.
The data flow is unambiguous in code: the prompt assembly includes the fields
above and POSTs them to the Cachy-operated proxy, which forwards to third-party
providers under their retention policies.

## Cause

The AI feature was designed around usefulness of context, not around the
local-first boundary; `aiConfirmActions` gates *actions*, not *data egress*.

## Fix

Needs a design decision first (hence `adr: required`):

1. Explicit, per-feature opt-in consent before any context leaves the device,
   with a clear statement of what is sent and to whom — plus an ADR recording
   that Class A may move A→B under consent (ADR-0001 amendment or new ADR).
2. Local aggregation/redaction so less-sensitive summaries travel instead of
   raw entries.
3. Ollama mode fails closed: if direct local fetch fails, show an error instead
   of proxying through the server.

The ADR decides which combination ships. Until then this item must not be
implemented.

## Acceptance criteria

- [x] With consent disabled/default-off, no request body leaving the device
      contains journal entries, portfolio stats, positions or trade setup —
      asserted against outgoing fetches in a test
- [x] Consent, when given, is specific about recipients (which provider(s))
      and revocable; revocation stops egress immediately
- [x] Ollama/local mode makes no request to any Cachy-operated endpoint under
      any failure condition, proven by a test that kills the local endpoint
- [x] German and English strings for the consent surface

## Out of scope

The credential-transit question for exchange requests
([`FEAT-0285`](../features/FEAT-0285-credential-transit-boundary.md)).
Prompt-engineering quality of the context payload.

## Links

- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- `src/stores/ai.svelte.ts`, `src/routes/api/ai/*`
- Security audit 2026-08-23, finding "journal/portfolio transmitted to third-party AI providers" (High)
