# ADR-0003: The core runs without a server; editions are additive

- **Status:** Proposed
- **Date:** 2026-08-01
- **Deciders:** @mydcc

## Context

Cachy is heading in two directions at once, and they pull against each other.

**Direction one: give it away.** A Community edition — also the base for a
whitelabel product — should be deployable by anyone with a static host and no
operational skill. No database to provision, no module to publish, no
`spacetime` CLI. Self-hosting has to be genuinely easy, because "you can always
self-host" is the honest answer to "why is this feature paid".

**Direction two: build something a database is required for.** SpacetimeDB is
already integrated (`server/spacetimedb/src/index.ts`, generated bindings in
`src/lib/spacetimedb/`, wired through `src/services/cloudService.ts` into
`CloudTab.svelte`). It is a real-time database that executes code, designed for
multiplayer games, and it is the right substrate for the features the maintainer
actually wants: real-time collaboration, and eventually an AI agent that
observes markets and acts on them.

Today there is nothing in the codebase that keeps these apart. There is no
edition concept, no feature flag, no build target: a grep for `edition`,
`featureFlag` or `COMMUNITY_EDITION` across `src/` returns nothing. The only
thing preventing SpacetimeDB from growing into the core is that so far only one
feature uses it.

That is the situation ADR-0001 was written for at the data level — it says
*which data* may go server-side. It does not say anything about *which code* may
depend on a server existing. Global Chat happens to satisfy both, because it
degrades to "chat unavailable". Nothing written down makes that the rule.

The cost of getting this wrong is not theoretical. Once a store, a route or a
calculation reads through `cloudService`, the serverless build stops being a
build target and becomes a fork.

## Decision

**The core runs with no server, and that is a property of the code, not a
promise in a document.**

Three definitions, in order of how binding they are:

### 1. The core (binding, no exceptions)

The **core** is: the position-size calculator and risk engine, the journal,
presets, notes, settings, the exchange connections (REST and WebSocket), the
indicator/technicals engines, and every piece of UI needed to reach them.

The core may not import from `src/lib/spacetimedb/`, `src/services/cloudService.ts`,
or any future Cachy-operated-server client. Not behind a flag, not behind a
try/catch, not "only for telemetry". A pull request that adds such an import to
core code is rejected on that basis alone.

The exchange proxy routes under `src/routes/api/` are **not** a Cachy-operated
data server in this sense: they forward a user-initiated request to the user's
own exchange with the user's own credentials, and they are covered by ADR-0001's
Class A exception. They are part of the core.

### 2. Server-backed features are modules behind a port

Anything requiring a Cachy-operated server is a **module**: it declares its own
entry point in the UI, its own settings, and it must compile out or no-op
cleanly when the server is absent. Modules talk to the server through a named
interface, not by importing the generated SpacetimeDB bindings directly, so a
module's dependency is on a capability rather than on a vendor.

Global Chat is the first module and the reference implementation for the shape.

### 3. Editions are additive build targets, never forks

| Edition | Contains | Server required |
| --- | --- | --- |
| **Community** | Core only | No |
| **Pro** | Core + paid modules/plugins | Depends on the module |
| **Private** | Core + all modules, including AI-driven analysis and execution | Yes |

Every edition builds from the same `main`/`develop` branch and the same source
tree. An edition is a build configuration plus a set of enabled modules — never
a branch, never a copy of the repository. If a change can only be expressed by
forking, it is the wrong change.

Community is the **default** build. A developer running `npm run dev` with no
configuration gets Community: if the core silently depends on a module, it
breaks for the person most likely to notice.

## Consequences

### What this enables

- The Community/whitelabel edition is deployable as a static-ish SvelteKit app
  with no database, which is what makes both giving it away and selling a
  whitelabel copy practical.
- Self-hosting the full product stays possible, because the private edition is
  the same tree with modules switched on.
- ADR-0001's Class B conditions get a structural enforcement point rather than
  depending on review discipline alone: condition 4 ("non-essential") becomes
  "does not live in the core", which is checkable by an import rule.
- The AI-trading direction can be built without negotiating the architecture
  again, because it is a module by construction.

### What this costs

- **Indirection where none existed.** Global Chat currently reaches
  `cloudService` directly. Putting a port in front of it is work that produces
  no user-visible change.
- **Two things to keep working instead of one.** A serverless build that nobody
  runs will break. It has to be built in CI, or this ADR is a wish.
- **Some features get harder to build.** The obvious implementation of
  real-time copy trading is "put the trade draft in a table and subscribe" —
  which the core may not do. The feature is still possible; it costs a module
  boundary and, per ADR-0001, its own ADR.
- **A monetisation limit, accepted deliberately.** Because the core is complete
  and free, paid features can only be things that genuinely need a server or a
  service. Crippling the calculator to sell an uncrippled one is off the table.

### What is now forbidden

- Any import from `src/lib/spacetimedb/` or `cloudService.ts` in core code as
  defined above.
- Any core feature that fails, degrades or warns when the server is unreachable.
  ADR-0001 already forbids it for correctness; this forbids it for the build.
- Making Community a branch, a fork, or a stripped copy of the tree.
- Adding a module without stating which editions it belongs to.
- Shipping a paid feature by removing capability from the core.

## Alternatives considered

**No edition split — one product, SpacetimeDB required.** Simplest to build and
the one the maintainer's own usage points at. Rejected: it makes self-hosting a
database-operations task, kills the whitelabel product, and turns "Local-First"
into marketing.

**Two separate repositories, community and private.** The clean-looking answer,
and it is a trap: every core fix has to be applied twice, and they diverge
within months. Rejected.

**Runtime feature flags only, no build target.** Ship everything, disable at
runtime. Simpler than a build split, but the SpacetimeDB client, its bindings
and its dependencies stay in the bundle of a user who wanted a calculator — and
a runtime flag is one bug away from a Class A leak. Rejected as the primary
mechanism; runtime flags are still fine *inside* an edition, for switching a
module on and off.

**Define the boundary only in prose, enforce it in review.** This is the status
quo, and ADR-0001's own cost section already names the weakness: a rule that
depends on discipline rather than structure. Rejected — but honestly, this ADR
is also prose until the import rule and the serverless CI build exist. Those are
tracked as [`FEAT-0014`](../backlog/features/FEAT-0014-edition-build-targets.md).
