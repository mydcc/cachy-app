---
id: FEAT-0377
title: Pass Gemini API key via x-goog-api-key header instead of URL query parameter
type: feature
status: in-progress
priority: P3
milestone: none
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
size: S
estimate: 1
assignee: antigravity
branch: feat/items-2608-2610-2592
---

# FEAT-0377 — Pass Gemini API key via x-goog-api-key header instead of URL query parameter

Found in the read-only security/privacy audit on 2026-09-02 (finding F-06).
Same class as BUG-0273 (imgbb key in URL), which was fixed the same way.

## Current state

The Gemini proxy builds the upstream URL with the user's BYOK key as a query
parameter (`src/routes/api/ai/gemini/+server.ts:102`):

```ts
const keyParam = apiKey ? `&key=${encodeURIComponent(apiKey)}` : "";
```

Gemini also accepts the key via the `x-goog-api-key` header — same
authentication, but the key no longer appears in the URL, where it can end up
in intermediary/proxy logs, browser history, or error reports.

## Fix

Send the key as the `x-goog-api-key` header on the upstream fetch; remove
`keyParam` from the URL. The no-key fallback path (`!apiKey && baseUrl`)
stays unchanged.

## Acceptance criteria

- [ ] Upstream Gemini call authenticates via the `x-goog-api-key` header; the
      key is no longer part of any URL.
- [ ] SSE streaming still works — header auth on the streaming endpoint must
      be verified once against the real API during implementation
      (`[uncertain]` whether `streamGenerateContent` accepts header auth).
- [ ] Existing gemini proxy tests updated to assert the header, not the URL
      param.
- [ ] `npm run check` passes.

## Out of scope

- The other AI proxies (anthropic, openai, openrouter, ollama) — quick check
  they already use headers; fix here only if the same defect shows up.

## Open questions

- None blocking.

## Links

- [BUG-0273](../bugs/BUG-0273-security-hygiene-sweep.md) — same class, imgbb
  key-in-URL fixed the same way
- Related audit findings: FEAT-0374 (CSP), BUG-0372 (chat logs)
