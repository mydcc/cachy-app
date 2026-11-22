---
id: BUG-0835
title: Browser-direct AI egress cannot reach loopback and may follow a redirect off-origin
type: bug
status: done
assignee: claude
priority: P2
milestone: none
editions: [pro, private]
area: security
data_class: A
adr: ADR-0019
depends_on: []
---

# BUG-0835 — Browser-direct AI egress cannot reach loopback, and may follow a redirect off-origin

## Symptom

Two independent defects in the one transport every AI feature shares
(`streamCompletion`). Both are about *where the request actually goes* versus
where the app says it goes, which is why they are filed together.

1. **A loopback provider is unreachable in the hosted build.** A trader who
   configures Ollama or any local server gets a failed request, and the error
   blames CORS and suggests the server relay — advice that is wrong for this
   cause and that would, for rule authoring, be refused on purpose.
2. **A provider redirect can carry the request to a second origin.** The panel
   names the recipient and its base URL before the request; a 307 or 308 that
   preserves the POST sends the body somewhere else, and nothing in the app
   says so.

The second one matters most for FEAT-0817, where what travels is Class A
strategy prose and the disclosed recipient is the feature's central promise.

## Evidence

**Demonstrated** by reading the two code paths against each other, on
2026-11-21, while implementing FEAT-0817. No incident has been observed; both
are a property of the shipped code rather than a report.

**1 — loopback.** `connect-src` in `src/config/cspDirectives.ts` is:

```
"connect-src": ["self", "https:", "https://s.cachy.app", …, "https://api.openai.com"]
```

There is no `http:` source and no `http://localhost` or `http://127.0.0.1`
entry. The local branch of `streamCompletion`
(`src/lib/ai/completion.ts`) defaults to exactly that:

```ts
const targetUrl = (target.baseUrl.trim() || "http://localhost:11434").replace(/\/$/, "");
```

A plain-HTTP cross-origin request is therefore refused by the browser before
the provider sees it. The catch block then reports the generic direct-request
failure, which names CORS and points at the relay.

**2 — redirects.** Both `fetch` calls in `streamCompletion` — the `direct`
branch and the `local` one — pass `method`, `headers`, `body` and `signal`,
and no `redirect`. The default is `follow`.

## Cause

- **Loopback:** the CSP was written for a hosted app that talks to HTTPS
  services. Browser-direct-to-localhost is a later capability
  ([`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md))
  and the directive was never widened for it. Whether it *should* be widened
  was the open question; the decision below answers it with no, and the
  reason is not the CSP but the browser permission and preflight header that
  sit in front of it.
- **Redirects:** `redirect` was never specified, so the default applies. The
  app discloses the configured origin, and the fetch is free to follow a
  provider's instruction to another one.

## Fix

Two changes, each small, each in shared code — which is why they want a human
read rather than being folded into a feature PR.

- Pass `redirect: "error"` (or `"manual"` with an explicit, named refusal) on
  the AI provider fetches, so a redirect fails loudly instead of quietly
  re-addressing the request. The error should name the configured recipient
  and say the provider tried to send the request elsewhere.
- Leave `connect-src` as it is. Per the decision below, the hosted build does
  not reach loopback; instead the failure must name the connection policy as
  the cause. The current catch block blames CORS and points at the relay,
  which is wrong for this cause and, for rule authoring, advice the app
  refuses on purpose (ADR-0030 decision 2). Recognise the case from the
  configured target with `isLoopbackBaseUrl`
  (`src/stores/settings/aiProviders.ts`), not from the error: a blocked
  request rejects `fetch` with a generic `TypeError` that looks the same as a
  CORS failure (training knowledge, not probed in this repository).
- Probe the four remote endpoints named under the decision below for a 307/308
  on POST before shipping `redirect: "error"`. If one relies on a redirect,
  the refusal names that provider rather than failing anonymously.
- Do not touch the AGENTS.md non-negotiables while here: COEP stays unset,
  `Permissions-Policy` stays delegated, and `frame-src` keeps its sources.

## Acceptance criteria

- [x] A test reproduces each defect and fails without the fix.
- [x] A provider that answers a chat or authoring request with a cross-origin
      307 does not receive the body at the redirect target; the trader is told
      which recipient refused and why.
- [x] A loopback provider configured in the hosted build fails with a message
      naming the connection policy as the cause, and that message does not
      suggest the server relay.
- [x] `ADR-0030` decision 1 is amended: its zero-egress configuration (a
      loopback entry) is not available in the hosted build. Whether it works
      anywhere else is established by the implementing PR with a probe, and
      the amendment says what was probed. It currently reads as an option
      available everywhere.
- [x] No new `connect-src` source is added at all, and the AGENTS.md
      non-negotiables are untouched: COEP unset, `Permissions-Policy`
      delegated, `frame-src` sources unchanged.

## Out of scope

- Changing which providers the registry offers.
- The authoring-specific relay refusal, which is ADR-0030 decision 2 and
  correct as it stands.
- Pinning provider certificates or any form of response signing.

## Decision

**The hosted build does not reach loopback — decided by the owner on
2026-11-22.** It names the connection policy as the cause of the failure, and
`ADR-0030` decision 1 is amended to say so.

The decision was taken as "loopback is the desktop build's story". No desktop
shell exists in this repository (no Tauri, Electron or Capacitor dependency,
and no mention in `docs/`), so that framing is not carried into the criteria.
Where loopback *does* work — a page served from a local address, such as the
dev server or a self-hosted instance — is unverified: the CSP would still
refuse a cross-port `http:` request there unless it differs from the hosted
one. The implementing PR probes that and records the result in the ADR
amendment rather than promising it here.

The deciding argument is that the first half of the alternative was never
Cachy's to promise. Chrome gates a public page's loopback access behind a
permission independent of `connect-src` — Local Network Access from Chrome 142,
split in Chrome 145 so loopback is its own `loopback-network` permission, and
extended to WebSocket and WebTransport in Chrome 147 — and its preflight
expects the *local server* to answer with `Access-Control-Allow-Private-Network`.
That header would have to come from Ollama. Widening `connect-src` would
therefore have widened the policy for every script the page loads while still
not making the feature work. The permission gate applies to a *public* page
reaching a local address; a page that itself sits in the local address space is
reported as unaffected by it (secondary source, not Chrome's guide). That is
not the same as same-origin — Ollama answers on another port — and it says
nothing about the CSP.

Checked 2026-11-22 against vendor and developer sources; Chrome's own guide was
not read, so treat the version numbers as reported rather than confirmed. The
decision does not depend on them: the preflight header is the blocker either
way.

The redirect half of this item does not depend on this decision. A
user-created provider entry may redirect whatever the built-ins do, so the
refusal path is needed regardless. The bounded set to probe is
`BUILTIN_AI_PROVIDERS` in `src/stores/settings/aiProviders.ts`:
`https://openrouter.ai/api/v1`, `https://api.openai.com/v1`,
`https://generativelanguage.googleapis.com/v1beta` and
`https://api.anthropic.com/v1`, plus Ollama (loopback: the preset's base URL
is empty and `src/lib/ai/completion.ts` falls back to
`http://localhost:11434`).

## Links

- `src/lib/ai/completion.ts` — `streamCompletion`, both fetch calls
- `src/config/cspDirectives.ts` — `connect-src`
- `src/stores/settings/settingsTypes.ts` — the default Ollama base URL
- [`ADR-0019`](../../adr/0019-multi-provider-registry-and-credential-transit.md)
  — browser-direct as the default transport
- [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md)
  — decision 1 (loopback as the zero-egress configuration) and decision 2
- [`FEAT-0817`](../features/FEAT-0817-ai-assisted-rule-authoring.md) — the
  feature whose disclosed recipient this undermines

## Resolution

- `streamCompletion` (direct and local branch) and the direct model listing now
  fetch with `redirect: "manual"` and refuse any redirect answer, naming the
  configured origin. `"manual"` rather than `"error"`: `"error"` rejects with a
  TypeError that cannot be told from a CORS failure. The model listing was not
  named in the item, but it sends the key in a header and had the same hole.
- A plain-HTTP loopback target (recognised from the configured address via
  `isPolicyBlockedLoopback`, not from the error) fails with a message that names
  the connection policy and mentions neither CORS nor the relay. The Ollama
  default and a custom loopback entry both use it. An HTTPS loopback address
  passes `connect-src` (`https:`), so it keeps the CORS guidance (found in
  review).
- Probed 2026-11-22: the four built-in remote endpoints answer an
  unauthenticated POST directly (no 3xx), so none is broken by the refusal; and
  the real `connect-src` blocks a loopback fetch even from a page served on a
  loopback address. Details and what was not probed are in the ADR-0030
  amendment.
- `connect-src`, COEP, `Permissions-Policy` and `frame-src` are untouched.
- Not covered: the Ollama `/api/tags` probe in `aiModelsService` follows
  redirects, but it is a GET with no key or body.
