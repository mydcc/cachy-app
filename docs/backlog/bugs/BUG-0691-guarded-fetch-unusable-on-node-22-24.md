---
id: BUG-0691
title: Guarded fetch fails on every host on Node 22 and 24 because the runtime cannot drive an undici-8 dispatcher
type: bug
status: done
assignee: opencode
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: [BUG-0689, BUG-0690]
---

# BUG-0691 — Guarded fetch fails on every host on Node 22 and 24 because the runtime cannot drive an undici-8 dispatcher

## Symptom

Every `safeFetch` call — and therefore every `/api/ai/*` route,
`/api/external/article-content`, `/api/external/check-frame-support`,
`/api/rss-fetch` and the Ollama routes — answers `500 {"error":"fetch failed"}`
within ~0.15 s on the staging deployment, for every host, including plain
`http://example.com`. A plain `fetch` in the same process reaches upstream
normally.

## Evidence

**Demonstrated** — reproduced on the actual Node versions.

The staging host runs Node 22/24 (aaPanel's NVM; the repo's `engines` allows
`^22.22.2 || ^24.15.0 || >=26.0.0`), while `undici` comes from `node_modules`
(`^8.11.2`). Node bundles its own copy of undici, and the runtime's `fetch`
cannot drive a dispatcher from a *newer* standalone package:

| runtime | bundled undici | `fetch(url, { dispatcher: npmAgent })` | `undici.fetch(url, { dispatcher: npmAgent })` |
|---|---|---|---|
| Node 22.23.3 | 6.28.1 | **`fetch failed`** at once | 200 |
| Node 24.22.0 | 7.29.1 | **`fetch failed`** at once | 200 |
| Node 26.11.1 | 8.11.2 | 200 | 200 |

The failure's cause chain is
`TypeError: fetch failed` → `InvalidArgumentError: invalid onRequestStart method`
(`code: "UND_ERR_INVALID_ARG"`): the runtime validates the dispatcher against its
own base class and rejects it before any connection is attempted. That also
explains the bare message with no `[CODE]` suffix that BUG-0689 and BUG-0690
were chasing — and why 0.15 s was too fast for any network attempt.

## Cause

`safeFetch` installed its dial-time guard as a *per-request* `dispatcher`
option on the runtime's global `fetch`. That pairing only works when the
runtime's bundled undici is at least as new as the package. On Node 22 and 24 it
fails instantly for every request, so the guard has never carried a request
there — in any of its three implementations (bare `Agent`, `EnvHttpProxyAgent`,
and the path fallback). The proxy configurations in BUG-0689 and BUG-0690 were
never the cause: the request never reached a proxy.

## Fix

`src/lib/server/urlValidator.ts` in #4123:

- `performGuardedFetch()` wraps the request. The runtime's own `fetch` is
  preferred (it is what the rest of the app goes through), and when it rejects
  with `UND_ERR_INVALID_ARG` the `undici` package's own `fetch` takes over the
  same dispatcher — the pairing that works on every supported runtime.
- The takeover is sticky and announced once, so only the first request pays the
  rejected attempt.
- Nothing else changes: same guard, same dial-time private-range rule, same
  fail-closed construction.

An operator-side alternative would be to upgrade the runtime to Node 26, but
`engines` admits Node 22 and 24, so the code has to work there.

## Verification

- Unit test `moves to undici's own fetch when the runtime rejects the
  dispatcher`, verified red without the recovery: asserts the package fetch
  receives the same dispatcher instance, that the next request skips the
  runtime's fetch entirely, and that the warning is logged once.
- End-to-end with the real module on all three runtimes:
  `google models → 403` (a real upstream answer) and `example.com → 200` on
  Node 22, `403` on Node 24, `403` on Node 26 with no switch needed.
