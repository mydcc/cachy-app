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
