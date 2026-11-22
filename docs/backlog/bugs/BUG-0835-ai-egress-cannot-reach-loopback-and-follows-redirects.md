---
id: BUG-0835
title: Browser-direct AI egress cannot reach loopback and may follow a redirect off-origin
type: bug
status: specced
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
  is the open question below, not a foregone conclusion.
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
- Decide the loopback question (below) and, if widening is the answer, add the
  narrowest sources that work — a port-scoped `http://localhost:*` and
  `http://127.0.0.1:*` rather than `http:`.
- Do not touch the AGENTS.md non-negotiables while here: COEP stays unset,
  `Permissions-Policy` stays delegated, and `frame-src` keeps its sources.

## Acceptance criteria

- [ ] A test reproduces each defect and fails without the fix.
- [ ] A provider that answers a chat or authoring request with a cross-origin
      307 does not receive the body at the redirect target; the trader is told
      which recipient refused and why.
- [ ] A loopback provider either works in the hosted build, or the failure
      names the connection policy as the cause instead of suggesting the
      relay.
- [ ] `ADR-0030` decision 1's zero-egress option is either true in the hosted
      build or the ADR records that it is desktop-only. It currently reads as
      an available configuration.
- [ ] No new `connect-src` source wider than the loopback host and port range
      actually needed.

## Out of scope

- Changing which providers the registry offers.
- The authoring-specific relay refusal, which is ADR-0030 decision 2 and
  correct as it stands.
- Pinning provider certificates or any form of response signing.

## Open questions

- **Should the hosted build reach localhost at all?** It is the trader's own
  machine and their own model, and ADR-0030 decision 1 sells it as *the*
  zero-egress answer — but a hosted page that may open connections to
  arbitrary local ports is also a scanning primitive, and widening
  `connect-src` widens it for every script the page loads, not only for the
  AI transport. The alternative is to say plainly that the loopback story is
  the desktop build's, which costs ADR-0030 one of its arguments.
- Does any provider in the registry rely on a redirect today? If one does,
  `redirect: "error"` breaks it and the refusal has to name that provider.

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
