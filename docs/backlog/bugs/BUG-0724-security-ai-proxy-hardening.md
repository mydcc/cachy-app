---
id: BUG-0724
title: Security: AI proxy hardening (error leakage, prompt injection, unbounded inputs, model validation)
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
---

# BUG-0724 — Security: AI proxy hardening

> **State note.** Fixed on `fix/security-ai-proxy-hardening`. All six findings
> are addressed: every provider route answers a generic
> `AI provider request failed` (upstream status preserved) and logs a redacted
> detail; the sentiment route carries headlines as a JSON data block under an
> instruction that names them untrusted, and validates the model answer
> against a fixed schema before returning it; one shared guard caps the body at
> 1 MB and the schema caps messages, content, tools, model and base URL; model
> identifiers are validated against one alphabet on every provider; tools are
> validated as OpenAI-style function definitions instead of `z.any()`; log
> lines collapse control characters and scrub exact secrets of every length.
>
> Deliberate residual: prompt injection cannot be eliminated by escaping — the
> model still reads attacker-controlled headlines. The fix bounds what a
> successful injection can do: the prompt marks the data as data, the output
> shape is fixed, and nothing from the model is executed or forwarded.
>
> Verification: 116 tests across the AI routes, schemas, guard and sentiment;
> TypeScript and ESLint clean. `npm run backlog:check` is run with the PR.

## Symptom

Multiple medium/low findings in the AI proxy routes:

1. **Error message/key leakage**: AI proxy routes return raw exception messages (`e.message`, `err.error.message`) in HTTP error responses. Upstream errors may contain internal URLs, paths, or echoed API keys. Sentiment route has case-sensitive, short-key-skipping redaction.

2. **Prompt injection in sentiment**: Headlines concatenated into LLM prompt without escaping or structured input. Crafted headlines can override instructions.

3. **Unbounded request inputs**: `AiRequestSchema` has no `.max()` constraints on messages, content, tools, baseUrl. Sentiment headlines array unbounded. DoS/cost amplification.

4. **Model identifier not validated**: Only Gemini validates model format. Other providers pass arbitrary strings to upstream and logs.

5. **Arbitrary tool definitions**: `tools: z.array(z.any())` — malformed entries cause 500s, arbitrary fields forwarded upstream.

6. **Log injection**: Sentiment interpolates unvalidated model string into `console.warn`.

## Evidence

**Demonstrated** — all defects follow from reading the code. Fingerprints: `ai:proxy:errorBodyLeakage`, `sentiment:promptInjection:headlineInjection`, `ai:input:unboundedRequestSize`, `ai:model:unvalidatedIdentifier`, `ai:tools:unvalidatedSchema`

## Fix

1. Return generic error messages; log details server-side. Centralize redaction (case-insensitive, all key lengths).
2. Pass headlines as structured JSON input to LLM; validate/sanitize model output.
3. Add zod `.max()` constraints (message count, content length, tools count, baseUrl length, headlines count/length). Add request body size cap.
4. Apply same model regex validation to all providers.
5. Define zod schema for tool/function definitions.
6. Sanitize model strings before logging.

## Acceptance criteria

- [ ] AI proxy error responses return generic messages only
- [ ] Sentiment headlines passed as structured data, not raw prompt text
- [ ] Input size constraints on all AI routes
- [ ] Model validation consistent across all providers
- [ ] Tool definitions validated against schema
- [ ] No log injection via model string
- [ ] Regression tests

## Links

Security audit run-1: `~/security-audit-skill/cachy-app/run-1/`
