---
id: BUG-0692
title: A provider failure in the AI chat is not retried, not shown, and its message is discarded
type: bug
status: done
assignee: opencode
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0692 — A provider failure in the AI chat is not retried, not shown, and its message is discarded

## Symptom

When the configured provider refuses a chat request — a key without credit
(`402`), a key without permission for the model (`403`), a rate limit (`429`), a
provider outage (`503`) — the assistant shows nothing useful. The console fills
with requests of mixed status, and the user cannot tell whether the key, the
plan or the model is the problem.

## Evidence

**Demonstrated** — reproduced in `src/stores/ai.providerFailures.test.ts`.

Three defects in one loop (`sendMessage`, relay path):

1. **The retry never ran.** `while (!res && attempt < MAX_RETRIES)` — but `res`
   is assigned *before* the failure is classified, so after the first non-ok
   answer the loop condition is already false. Only a `fetch` that *threw* ever
   reached a second attempt.
2. **The message was replaced.** After the loop, `if (!res || !res.ok)` threw
   `"Failed to connect to AI provider after retries."`, overwriting the
   provider's own message (and, for a `429`, the "Rate limited. Retrying…"
   notice the code had just set).
3. **Nothing was rendered.** The store catches the failure into `aiState.error`,
   but `AssistantView.svelte` wrapped its error block in `{#if errorMessage}`,
   which is set only from the view's own `catch` — so a store-side error stayed
   invisible.

## Acceptance criteria

- [x] A rejected key, a billing refusal and a permission error are asked for **once**.
- [x] Rate limits and server faults are retried, and a recovered request completes.
- [x] The failure keeps the provider's message and names the HTTP status (`HTTP 402: …`).
- [x] An error the store recorded is visible in the assistant without a second send.

## Fix

`src/stores/ai.svelte.ts` in #4125:

- The retry is a `for` loop over at most three attempts; a non-retryable status
  (`isRetryableProviderStatus` → `false` for everything but `429` and `5xx`)
  throws a `ProviderRequestError` out of the loop immediately.
- `providerFailureMessage(status, body)` builds `HTTP <status>: <provider message>`
  and is also what the pre-stream failure now surfaces, so the generic
  "after retries" text is gone.
- `AssistantView.svelte` renders `aiState.error` as well, so a failure recorded
  by the store is shown without the view having caught it itself.

## Verification

`src/stores/ai.providerFailures.test.ts` (new) drives `sendMessage` with a
mocked `appFetch`: a `402` gets exactly one request and leaves
`aiState.error === "HTTP 402: Insufficient quota"`; a `503` followed by a `200`
completes on the second request. Plus table tests for the classifier and the
message builder. Each behaviour verified red against its own mutation (retry
count `→ 1`, `isRetryableProviderStatus → true`).

The view condition has no test: the file is a window view without a mount
harness (`AssistantView.test.ts` covers the provider gate, not the markup).
