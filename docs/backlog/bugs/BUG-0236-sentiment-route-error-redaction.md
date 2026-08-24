---
id: BUG-0236
title: Sentiment route returns unsanitized error messages risking API key exposure
type: bug
status: done
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
start_date: 2026-08-18
size: S
estimate: 2
---


# BUG-0236 — Sentiment route returns unsanitized error messages risking API key exposure

## Symptom

If an upstream OpenAI or Gemini API call fails in `/api/sentiment`, the raw exception message is logged to `console.error` and returned to the client in the JSON response without stripping the API key.

## Evidence

**Derived** from code inspection.

In `src/routes/api/sentiment/+server.ts`, the catch block extracts and returns raw error messages:
```typescript
} catch (e: unknown) {
    console.error('Sentiment API Error:', e);
    let message = 'INTERNAL_ERROR';
    if (e instanceof Error) {
        message = e.message;
    } else if (typeof e === 'string') {
        message = e;
    } else if (typeof e === 'object' && e !== null && 'message' in e) {
        message = String((e as { message: unknown }).message);
    }
    return json({ error: message }, { status: 500 });
}
```
If an SDK or HTTP error includes query parameters containing the API key (e.g. Gemini's `...models/...:generateContent?key=AIzaSy...`), the user's secret key is leaked in the response body and unredacted server logs.

In comparison, `src/routes/api/external/news/+server.ts` explicitly redacts keys and sanitizes errors:
```typescript
if (apiKey && apiKey.length > 4) {
    errorMsg = errorMsg.split(apiKey).join("***");
}
errorMsg = sanitizeErrorMessage(errorMsg);
```

## Cause

The sentiment endpoint lacked the error sanitization and credential masking patterns implemented in other proxy endpoints.

## Fix

1. Sanitize error messages in `src/routes/api/sentiment/+server.ts` using `sanitizeErrorMessage` from `src/types/apiSchemas`.
2. Mask the user's `apiKey` before logging or returning error responses (`errorMsg.split(apiKey).join("***")`).

## Acceptance criteria

- [ ] A test verifies that when upstream throws an error containing the API key, `/api/sentiment` responds with the key redacted to `***`.
- [ ] No raw secret material is logged to the console.

## Links

- `src/routes/api/sentiment/+server.ts`
- `src/routes/api/external/news/+server.ts`
- `src/types/apiSchemas.ts`

## What shipped

Shipped in merge main into develop for release 1.6.1.
