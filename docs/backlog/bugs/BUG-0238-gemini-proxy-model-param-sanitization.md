---
id: BUG-0238
title: Gemini AI proxy passes unvalidated model parameter into API path
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
---

# BUG-0238 — Gemini AI proxy passes unvalidated model parameter into API path

## Symptom

A client calling `/api/ai/gemini` can provide an arbitrary `model` string that is directly interpolated into the Google Generative Language API endpoint URL without path escaping or character validation.

## Evidence

**Derived** from code inspection.

In `src/routes/api/ai/gemini/+server.ts`, line 68-71:
```typescript
let selectedModel = model || "gemini-3.5-flash";
const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;
```
If `model` contains path traversal characters (`..`, `/`, `?`, `#`), it alters the URL path or query structure sent to `generativelanguage.googleapis.com`.

## Cause

The Gemini proxy assumes the `model` parameter is a valid model identifier without applying regex constraints or URI encoding.

## Fix

1. Validate `model` against an allowlist or a strict identifier regex (`/^[a-zA-Z0-9._-]+$/`).
2. Apply `encodeURIComponent` before embedding into the URL path.
3. Reject invalid model formats with HTTP 400 Bad Request.

## Acceptance criteria

- [ ] A test verifies that `/api/ai/gemini` rejects model names containing path traversal characters (`../`, query params, etc.) with HTTP 400.
- [ ] Standard Gemini model names (e.g. `gemini-2.5-flash`, `gemini-1.5-pro`) continue to work seamlessly.

## Links

- `src/routes/api/ai/gemini/+server.ts`
