---
id: IDEA-0036
title: A gamified fork built on SpacetimeDB and the 3D layer
type: idea
status: idea
priority: P3
milestone: none
editions: [community]
area: experiment
data_class: none
adr: required
depends_on: []
---

# IDEA-0036 — A gamified fork built on SpacetimeDB and the 3D layer

## The thought

Two things already in the codebase point this way: the animated 3D background
(Three.js scenes, a physics wrapper, WebGPU) and SpacetimeDB, which exists
because it is good at multiplayer games. Together they make competitions,
leaderboards, achievements or a shared visual space cheap to build.

## Why it is recorded as an idea and not planned

[`VISION.md`](../../VISION.md) puts it out of scope on purpose. Trading is where
users lose real money, and an interface that rewards activity is an interface
that encourages overtrading. A leaderboard measuring returns rewards leverage,
which is the opposite of what this product is for.

If it happens, it happens as a **separate fork with a separate name**, sharing
the core but not the positioning. Not as a feature of the trading product, and
not as something a Cachy user discovers by accident.

## What would have to be true first

- The trading product's safety milestones (M1) done, so the fork inherits them.
- An ADR, because leaderboards and competitions need performance data on a
  server and that data is journal-derived — Class A, and the same wall
  [`FEAT-0033`](../features/FEAT-0033-chat-hardening-and-reputation.md) ran into.
  Any gamification touching trading performance hits it too.
- A clear answer to whether it encourages behaviour the product exists to
  discourage. If the answer is uncomfortable, that is the answer.

## Links

- [`docs/VISION.md`](../../VISION.md) — "What Cachy is not"
- `src/lib/physics/`, `src/workers/tradeFlow.worker.ts`, `src/shaders/`
