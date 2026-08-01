---
id: FEAT-0032
title: A plugin contract for paid modules
type: feature
status: idea
priority: P2
milestone: M6
editions: [pro, private]
area: build
data_class: none
adr: required
depends_on: [FEAT-0014]
---

# FEAT-0032 — A plugin contract for paid modules

## Problem

The business model needs sellable capability that is not removed from the core.
There is no mechanism to add capability to an install.

## Proposal

A plugin contract defining what a plugin may reach: UI extension points,
read-only market data, its own settings and storage. What it may **not** reach,
by default and without exception: Class A data, credentials, and the order path.
A plugin that needs any of those requires its own ADR — hence `adr: required` on
this item, which also covers the contract itself.

Plus installation, enablement, disablement and revocation, and licence
validation that fails closed for the plugin while never gating core
functionality or phoning home for it.

## Acceptance criteria

- [ ] A plugin installs, enables, disables and revokes on a Community build
- [ ] A disabled or revoked plugin changes nothing about core behaviour
- [ ] A plugin cannot read Class A data or reach the order path, asserted by a
      test that tries
- [ ] Licence validation failure disables the plugin only
- [ ] The app works fully offline with plugins installed
- [ ] An ADR covering the contract exists before implementation starts

## Open questions

- Sandboxing: iframe, worker, or trust plus review? This determines whether the
  "cannot reach Class A" guarantee is structural or a convention.
- Distribution and payment — out of scope here, but it constrains the design.

## Links

- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`FEAT-0014`](FEAT-0014-edition-build-targets.md)
