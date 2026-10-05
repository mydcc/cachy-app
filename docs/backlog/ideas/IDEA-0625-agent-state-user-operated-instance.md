---
id: IDEA-0625
title: Host autonomous agent state on a user-operated instance
type: idea
status: idea
priority: P3
milestone: M9
editions: [private]
area: sync
data_class: A
adr: required
depends_on: [FEAT-0014]
---

# IDEA-0625 — Host autonomous agent state on a user-operated instance

## Problem

Automation state — which strategies an agent may run, the capital it may
commit, the positions it holds, its decision log — lives on one device.
A second device sees none of it, and there is no inspectable record of why
the agent acted the way it did.

## Proposal

Run the agent's own state on a SpacetimeDB instance the user operates
themselves (ADR-0004 §1: user-configured host with no default, plain
disclosure at configuration, fully optional). The agent logic executes as
reducers close to that state and pushes to all of the user's own clients:
phone and desktop show the same strategies, limits and decision log.

This is the state half of M9, not the execution half: what a strategy
evaluates is settled by ADR-0012 (versioned rule documents on closed
candles); execution still passes M1's gate with no bypass. The autonomy
envelope, capital limits and failure modes need M9's own ADR
(FEAT-0035) before anything here is buildable.

## Out of scope

- Exchange credentials on the instance: keys stay on the device regardless.
- Any Class A data on a Cachy-operated instance (journal, settings, agent
  state alike).
- Settings/preset/form-draft sync: that is IDEA-0189, linked not duplicated.
- Journal sync in the first cut (same reasoning as IDEA-0189: start where a
  sync bug costs annoyance, not history).

## Open questions

- Conflict resolution for strategies edited offline on two devices.
- Decision-log retention and size bounds on the instance.
- Split or merge with IDEA-0189 once both are specced?

## Links

- docs/adr/0004-spacetimedb-data-scope.md §1, §4
- docs/adr/0003-edition-boundary.md
- docs/adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md
- docs/backlog/ideas/IDEA-0189-user-operated-sync.md
- docs/backlog/features/FEAT-0035-autonomous-execution-agent.md
- docs/backlog/features/FEAT-0014-edition-build-targets.md
