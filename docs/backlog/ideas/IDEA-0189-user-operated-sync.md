---
id: IDEA-0189
title: Multi-device sync of settings and presets via a user-operated instance
type: idea
status: idea
priority: P3
milestone: none
editions: [pro, private]
area: sync
data_class: A
adr: required
depends_on: [FEAT-0014]
---

# IDEA-0189 — Multi-device sync of settings and presets via a user-operated instance

## The thought

A trader with a desk machine, a laptop and a phone re-enters the same
settings, presets and form state three times. SpacetimeDB is already in the
stack and is exactly the right substrate for real-time state sync — and
[ADR-0004 §1](../../adr/0004-spacetimedb-data-scope.md) already draws the line
that makes this admissible: Class A data may live on a **user-operated**
instance, under its three conditions (user-configured host with no default,
plain disclosure at the point of configuration, fully optional).

So the feature is: a sync module (behind the ADR-0003 module boundary, absent
from the Community bundle) that mirrors settings, presets and the current
UI-form draft across the user's devices through an instance the user runs.
This is a genuine differentiator for the self-hosted editions: the
infrastructure cost and the data control both sit with the user.

## What it is explicitly not

- **Not order validation.** "Check the trade server-side in Rust before
  submission" was considered and decided in ADR-0004 §3: pre-flight
  verification is core and local ([`FEAT-0011`](../features/FEAT-0011-preflight-order-verification.md)),
  because it must work with the network down. A sync module never sits in the
  order path.
- **Not a Cachy-operated sync service.** On a Cachy-operated instance,
  settings/journal sync is a Class A → B move: `BREAKING CHANGE:`, its own
  ADR, and probably end-to-end encryption as a precondition. That variant is a
  different, later decision — this idea is the user-operated one only.
- **Not journal sync, in the first cut.** The journal is the highest-value and
  highest-sensitivity target; start with settings/presets where a sync bug
  costs annoyance, not history.

## Open questions

- Conflict resolution (last-writer-wins is probably wrong for presets edited
  offline on two devices).
- Whether the API credentials sync too. Tentatively no — keys stay per-device;
  syncing secrets multiplies the blast radius of one compromised device.
- Needs its own ADR before any build starts (`adr: required`): the sync
  schema is a data-boundary surface even on a user-operated instance.

## Links

- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §1, §3
- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- [`FEAT-0014`](../features/FEAT-0014-edition-build-targets.md)
