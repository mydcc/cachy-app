# ADR-0005: Extensions are tiered by capability, and isolation comes first

- **Status:** Proposed
- **Date:** 2026-08-02
- **Deciders:** @mydcc

## Context

The Community edition should let users extend Cachy the way WordPress lets
users extend a site: custom indicators, trading bots, AI prompts, personal
tweaks. The obvious implementation is the one WordPress uses — a `plugins/`
directory where users drop files that the app picks up.

That model does not transfer, for two independent reasons.

**It does not fit the deployment.** WordPress runs on a server with a
filesystem the site owner controls. Cachy is a SvelteKit app that runs in the
browser. A `plugins/` folder in the repository is consumed at **build time**,
so "installing a plugin" would mean editing the source tree and rebuilding —
that is a fork with extra steps, not a plugin system. For the hosted Community
PWA there is no filesystem to drop anything into at all. Any real extension
mechanism has to load at **runtime**, from IndexedDB, a URL, or a file picker,
and that is a different architecture with different constraints.

**It does not fit the threat model, and this is the part that matters.** A
compromised WordPress plugin compromises a website. A compromised Cachy
extension compromises a **trading account with real money**. Extension code
would run in the user's browser, in the user's session, with — unless
something prevents it — the same reach the app has:

- `localStorage` holds the API keys, the journal, presets and notes: the whole
  of Class A per [ADR-0001](0001-local-first-boundary.md).
- `fetch` reaches any origin CSP allows, which is enough to exfiltrate all of
  it.
- The order path places real trades.

Plugin vulnerabilities have been WordPress's dominant attack vector for a
decade, and WordPress does not hold anyone's exchange credentials. Adopting
that model here would break ADR-0001 by construction, not by accident.

The demand behind the request is nonetheless real and worth serving. The
mistake is treating "plugin" as one thing: custom indicators, trading bots and
AI prompts have almost nothing in common in what they need or what they risk.

## Decision

Extensions are **tiered by the capability they require**. Each tier gets a
different mechanism, and a tier is only built once the one below it works.

### Tier 1 — Data extensions

AI prompts, presets, themes, alert templates, indicator *parameter sets*,
symbol lists. Declarative data: JSON or text, no executable code.

Loaded at runtime, validated against a schema, stored like any other user
data. No isolation needed, because there is nothing to isolate — a malformed
file fails validation and is rejected.

**This tier ships first.** It carries no security burden and covers a large
share of what "individualise the app" actually means in practice.

### Tier 2 — Computation extensions

Custom indicators, custom alert conditions, scoring and strategy logic. Code,
but code with a narrow shape: **data in, numbers out**.

An indicator is a pure function. It does not need `localStorage`, the network,
the DOM, or knowledge of who the user is. So it runs in a **Web Worker created
without those capabilities**: klines are passed in, values come back, and the
worker has no route to anything else. The worst a hostile Tier 2 extension can
do is return wrong numbers or waste CPU — both bounded, neither reaching a
credential.

Results carry a **provenance marker** identifying them as extension-produced.
This matters because a community indicator feeding a position-size calculation
is a money path: the marker is what lets the UI show it and lets the
[`FEAT-0011`](../backlog/features/FEAT-0011-preflight-order-verification.md)
gate refuse to size a trade off an unverified source silently.

### Tier 3 — Integration extensions

UI panels, exchange adapters, AI providers, notification channels. These need
DOM or network access, so they carry genuine risk and require:

- an explicit **permission declaration** in a manifest (`market-data`,
  `ui-panel`, `network:<origin>`, …), granted by the user at install,
- isolation appropriate to the permission (an iframe with a constrained
  `sandbox` and its own CSP for UI; a worker with a declared origin allow-list
  for network),
- distribution through a channel where review is possible.

Tier 3 is **not** built until Tiers 1 and 2 exist and the permission model has
been exercised by something real.

### What holds across all tiers

1. **No extension reaches Class A data.** Not credentials, not the journal,
   not settings beyond its own namespace. This is enforced by isolation, not
   by documentation.
2. **No extension places an order except through the
   [`FEAT-0011`](../backlog/features/FEAT-0011-preflight-order-verification.md)
   gate**, subject to the same verification, the same risk limits and the same
   kill switch as a human click. A "trading bot" extension is not an exemption
   from M1; it is a client of it. An extension may *propose* an order; it may
   never bypass the check.
3. **Extensions are versioned against a declared API, never against internals.**
   The extension API is a separate, versioned surface. Extensions may not
   import from `src/services/`, `src/stores/` or any internal module.
4. **The core works with every extension disabled**, per
   [ADR-0003](0003-edition-boundary.md).
5. **An extension may not make Cachy contact a Cachy-operated server**, per
   [ADR-0004](0004-spacetimedb-data-scope.md).

### The constraint that cannot be deferred

**Isolation is decided now, not later.** If extensions ever run in the main
realm with ambient access to `localStorage` and `fetch`, that cannot be walked
back — every extension written against that freedom breaks when it is removed,
and an ecosystem is precisely what makes a breaking change impossible. The
reverse is cheap: start isolated and grant specific capabilities later, as
each one is designed.

Everything else in this ADR can be revised. This cannot.

## Consequences

### What this enables

- Community extension of the things people actually want to extend —
  indicators, prompts, strategies — without putting credentials or the order
  path within reach.
- A path that can start small: Tier 1 is a schema and a loader, and it is
  genuinely useful on its own.
- Paid plugins ([`FEAT-0032`](../backlog/features/FEAT-0032-plugin-contract.md),
  M6) become a distribution and licensing question on top of an existing
  mechanism, rather than a security design done under commercial pressure.
- A stated reason to refuse the request that will eventually arrive — "my
  plugin needs the API key" — that is architectural rather than a matter of
  taste.

### What this costs

- **Slower than a plugins folder, and less capable at the start.** Tier 1
  cannot do what a WordPress plugin does, and that will disappoint someone.
- **A versioned public API is a commitment.** Once extensions depend on it,
  changing it breaks them; internals stay free to change only because the two
  are separated, which means maintaining the separation.
- **Worker isolation costs ergonomics.** An indicator author cannot reach for
  a library that touches `window`, and debugging inside a worker is worse than
  on the main thread.
- **Provenance marking touches the calculation path**, which is the part of
  the codebase where changes are most expensive to get wrong.
- **Tier 3 may never be worth building.** That is an acceptable outcome, and
  better than discovering it after shipping an insecure version of it.

### What is now forbidden

- Any extension mechanism that executes third-party code in the main realm.
- Any extension API that exposes `localStorage`, credentials, journal entries
  or settings outside the extension's own namespace.
- Any order path reachable by an extension that bypasses
  [`FEAT-0011`](../backlog/features/FEAT-0011-preflight-order-verification.md).
- Extensions importing internal modules rather than the declared API.
- Building Tier 3 before Tiers 1 and 2 exist and the permission model has been
  used in anger.
- Shipping an extension mechanism whose isolation story is "we review
  submissions".

## Alternatives considered

**A `plugins/` folder, WordPress-style.** What was asked for, and the reason
this ADR exists. Rejected: at build time it is a fork rather than a plugin
system, and at runtime without isolation it hands every extension the user's
API keys and journal. The deployment model and the threat model each rule it
out on their own.

**One uniform plugin API with a permission list.** Simpler to explain than
three tiers. Rejected because the tiers are not bureaucratic layers — they
have genuinely different isolation mechanisms (none, worker, iframe), and a
single API would have to assume the weakest, which means Tier 1's zero-risk
prompt file would carry Tier 3's machinery.

**No extensions; accept forks instead.** Honest, and it is the status quo.
Rejected: the app is AGPL and forks already happen, but a fork cannot receive
upstream fixes, which is worse for users than a constrained extension point.

**Server-side execution of untrusted extensions in a sandbox.** Removes the
browser-credential problem by moving execution off the device. Rejected: it
requires a Cachy-operated server on the path of a core feature, which
[ADR-0003](0003-edition-boundary.md) forbids, and it would mean sending market
context to that server for every calculation.
