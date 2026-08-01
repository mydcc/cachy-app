---
id: FEAT-0014
title: Produce Community, Pro and Private builds from one tree
type: feature
status: specced
priority: P1
milestone: M5
editions: [community, pro, private]
area: build
data_class: none
adr: ADR-0003
depends_on: []
---

# FEAT-0014 — Produce Community, Pro and Private builds from one tree

## Problem

[ADR-0003](../../adr/0003-edition-boundary.md) says the core runs without a
server and editions are additive build targets. Right now that is prose. There
is no edition concept in the code at all — no build target, no module boundary,
no lint rule — so the serverless build is a claim nobody has tested and the core
could grow a SpacetimeDB dependency at any time without anyone noticing.

## Proposal

Make ADR-0003 mechanical.

- **A module boundary.** Server-backed features reach the server through a named
  port, not by importing generated SpacetimeDB bindings. Global Chat is the
  first one and defines the shape.
- **A lint rule** rejecting imports of `src/lib/spacetimedb/` and
  `cloudService.ts` from core code. This is the enforcement; without it the ADR
  stays prose.
- **Build targets** selecting which modules are compiled in. Community is the
  default, so a developer running `npm run dev` unconfigured gets it and notices
  a core dependency immediately.
- **CI builds the serverless artefact every run** and runs the test suite
  against it. A build nobody runs is a build that is already broken.

## Acceptance criteria

- [ ] A Community build contains no SpacetimeDB client code — asserted against
      the bundle, not the source
- [ ] The lint rule fails on a core file importing `cloudService.ts`, proven by
      adding one
- [ ] The Community build runs with no server reachable and the full suite
      passes against it
- [ ] CI produces the serverless artefact on every build
- [ ] Global Chat works in a build that includes it, unchanged for the user
- [ ] `npm run dev` with no configuration yields Community

## Out of scope

- Whitelabel theming ([`FEAT-0031`](FEAT-0031-whitelabel-theming.md)).
- The plugin contract ([`FEAT-0032`](FEAT-0032-plugin-contract.md)).
- Licensing.

## Open questions

- **Build-time or runtime module selection?** ADR-0003 prefers build-time so the
  code is absent rather than disabled. Vite conditional imports versus separate
  entry points — needs a spike.
- **Where does the port live** so that core code cannot reach past it?

## Links

- [`docs/adr/0003-edition-boundary.md`](../../adr/0003-edition-boundary.md)
- `src/services/cloudService.ts`, `src/lib/spacetimedb/`
