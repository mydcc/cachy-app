---
id: BUG-0694
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

# BUG-0694 — A provider failure in the AI chat is not retried, not shown, and its message is discarded

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
- [x] That message survives to the screen for a `429`/quota case too, and the
      view tells a rate limit from a rejected key by `aiState.errorStatus`
      rather than by looking for `"quota"` in the text.
- [x] When every attempt fails, the message names the last failure — not a generic one.

## Fix

`src/stores/ai.svelte.ts` and `AssistantView.svelte` in #4126:

- The retry is a `for` loop over at most `MAX_ATTEMPTS` (three attempts, so two
  re-sends); a non-retryable status (`isRetryableProviderStatus` → `false` for
  everything but `429` and `5xx`) throws a `ProviderRequestError` out of the
  loop immediately.
- `providerFailureMessage(status, body)` builds `HTTP <status>: <provider message>`,
  collapses the detail to one line and caps it at `MAX_PROVIDER_DETAIL` (300
  characters) — it is provider-controlled text. The browser-direct and Ollama
  paths use the same builder, so every egress path names status and detail.
- The loop leaves only on a response or on a throw, so no generic text can
  overwrite the provider's message; the remaining `if (!res)` is a type
  narrowing, not a failure path.
- `aiState.errorStatus` carries the provider status (`$state<number | null>`,
  cleared on send, on success and in `clearHistory`).
- `AssistantView.svelte` renders `aiState.error` as well, and for a rate limit it
  shows the translated headline **plus** the provider's line, instead of
  replacing it.

Accepted trade-off, recorded deliberately: a `5xx` may have been accepted
upstream before its answer was lost, so a re-send can repeat a paid request.
The window is bounded by `MAX_ATTEMPTS` and the alternative — not retrying a
`503 "model overloaded"` — is what users hit most often.

## Verification

`src/stores/ai.providerFailures.test.ts` drives `sendMessage` with a mocked
`appFetch`: a `402` gets exactly one request and leaves
`aiState.error === "HTTP 402: Insufficient quota"` and `errorStatus === 402`; a
`503` followed by a `200` completes on the second request; three `503`s name the
provider's last message (`HTTP 503: Service Unavailable`); a `429` backs off
under fake timers and completes on the retry; the message builder collapses and
caps a long detail. Each behaviour verified red against its own mutation (retry
count, `isRetryableProviderStatus → true`, the removed status assignment, the
removed cap).

The view condition still has no test: the file is a window view without a mount
harness (`AssistantView.test.ts` covers the provider gate, not the markup).
