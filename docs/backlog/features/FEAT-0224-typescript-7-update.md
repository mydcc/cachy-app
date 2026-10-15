---
id: FEAT-0224
title: Evaluate and migrate to TypeScript 7
type: feature
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
start_date: 2026-08-17
size: S
estimate: 2
---


# FEAT-0224 — Evaluate and migrate to TypeScript 7

## Problem
A major update to `typescript` (^7.0.2) is available. However, `svelte-check` currently throws an error indicating that TS7 requires a complex dual-installation with TS6 (`npm install --save-dev typescript@~6 @typescript/native@npm:typescript@7`) and the `--tsgo` flag.

## Proposal
Wait until SvelteKit and `svelte-check` offer native, out-of-the-box support for TypeScript 7. Once the tooling ecosystem catches up, perform a clean update without workarounds.

## Acceptance criteria
- [ ] `typescript` updated to `^7.0.0`
- [ ] No dual-installation hacks required in `package.json`
- [ ] `npm run check` passes completely

## Out of scope
- Forcing the update using the `--tsgo` alias hack.

## Open questions
- Wann unterstützt SvelteKit TypeScript 7 nativ ohne Aliase?

## State (2026-10-15)

Re-checked while surveying the remaining majors. Two additions:

- The blocker is wider than `svelte-check`. With `typescript@7.0.2` installed,
  `require('typescript')` exposes only `{ version, versionMajorMinor }` — the
  classic compiler API is gone (the new one lives under `typescript/unstable/*`)
  — and typescript-eslint fails hard with `typescript-eslint does not support
  TS 7.0` (peer `>=4.8.4 <6.1.0`). The acceptance criteria therefore need
  typescript-eslint on board too, not just SvelteKit/svelte-check.
- Measured payoff of the alias path, for whenever the stance is revisited:
  keeping `typescript@6` plus `@typescript/native@npm:typescript@7` and running
  `svelte-check --tsgo-experimental-api --tsconfig ./tsconfig.json` produced
  identical diagnostics (0 errors, the same 6 warnings) and ran ~2.2x faster
  (20.9 s / 22.0 s vs 44.4 s / 49.0 s, two runs each). Recorded as data, not as
  a proposal — the flag is labelled experimental and stays out of scope here.
