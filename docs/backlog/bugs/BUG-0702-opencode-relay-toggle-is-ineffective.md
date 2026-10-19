---
id: BUG-0702
title: The server-relay toggle offers a choice that OpenCode never allows
type: bug
status: done
branch: fix/opencode-force-relay
priority: P2
milestone: none
created: "2026-10-19"
editions: [community, pro, private]
area: ai
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# BUG-0702 — OpenCode showed a relay toggle that cannot be turned off

Found while finishing BUG-0701 (the OpenCode session header).

## Symptom

The custom-provider form offered "Allow server relay" for an OpenCode entry
too. Turning it off does not move the request to the browser — OpenCode's
gateway sends no CORS headers, so the direct request dies with a network error
before any header matters, and the model picker never loads a model list. The
toggle promised a choice that does not exist.

## Cause

The relay decision looked at `allowServerRelay` and at loopback base URLs
(which have to stay direct). OpenCode was not part of the rule, although it is
the one provider that *has* to go through the relay.

## Fix

- `src/lib/ai/opencodeTarget.ts::isOpenCodeUrl` — one rule for "this is
  OpenCode", shared by the client (the settings form) and the server (the
  relay routes). It replaces the server-only `isOpenCodeTarget`.
- The settings form hides the toggle and its description for an OpenCode base
  URL: there is no choice to offer, so nothing is shown in its place.
- The model picker and the provider card use the server transport for
  OpenCode, so the model list works.
- The store skips the browser-direct path for OpenCode, whatever the toggle
  says — an entry stored before this change keeps working.

## Verification

`src/lib/ai/opencodeTarget.test.ts` pins the host rule (subdomain, uppercase
and trailing dot match; lookalikes, other providers and empty input do not).
`src/stores/ai.providerFailures.test.ts` pins that an OpenCode entry with the
toggle off still goes through the relay and never through the browser.

Not covered: the settings form itself. The repository has no test harness for
settings components, and the branch is a plain condition on the provider's base
URL.

## Scope

Only OpenCode is affected. Every other provider keeps the toggle: a direct
request stays the default and the relay stays opt-in.
