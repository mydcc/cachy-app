---
id: FEAT-0032
title: A plugin contract for paid modules
type: feature
status: idea
priority: P2
milestone: M6
editions: [pro, private]
area: extensions
data_class: none
adr: ADR-0005
depends_on: [FEAT-0014, FEAT-0040]
---

# FEAT-0032 — A plugin contract for paid modules

## Problem

The business model needs sellable capability that is not removed from the
core. There is no mechanism to add capability to an install.

## Proposal

Installation, enablement, disablement and revocation for paid extensions, plus
licence validation that fails closed **for the extension** while never gating
core functionality and never phoning home for it.

**The security design is no longer this item's job.**
[ADR-0005](../../adr/0005-extension-model.md) settles what an extension may
reach and how it is isolated: three tiers (data / computation / integration),
isolation decided up front rather than retrofitted, no access to Class A data,
and no order path except through
[`FEAT-0011`](FEAT-0011-preflight-order-verification.md)'s gate. A paid plugin
is an ordinary extension under that model with a licence attached — the
commercial layer, not a separate security model.

That ordering is deliberate: designing a sandbox while under pressure to ship
something sellable is how the sandbox ends up being "we review submissions".

## Acceptance criteria

- [ ] A plugin installs, enables, disables and revokes on a Community build
- [ ] A disabled or revoked plugin changes nothing about core behaviour
- [ ] A plugin cannot read Class A data or reach the order path, asserted by a
      test that tries and fails
- [ ] Licence validation failure disables the plugin only, never the core
- [ ] The app works fully offline with plugins installed, including when the
      licence server is unreachable
- [ ] A revoked plugin's stored data is removed or clearly orphaned — decide
      which

## Out of scope

- The extension mechanism itself — [`FEAT-0039`](FEAT-0039-data-extensions.md)
  and [`FEAT-0040`](FEAT-0040-computation-extensions.md).
- Payment processing and the distribution channel. They constrain the design
  but are not built here.

## Open questions

- **Where does licence state live?** It is not Class A, but it is
  user-identifying, so a Cachy-operated licence check is an ADR-0004 question
  before it is an implementation one.
- **Offline grace period.** A trading tool that stops working because a
  licence server is unreachable is worse than piracy.

## Links

- [`docs/adr/0005-extension-model.md`](../../adr/0005-extension-model.md)
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`FEAT-0014`](FEAT-0014-edition-build-targets.md)
