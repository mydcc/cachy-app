---
id: BUG-0658
title: Galaxy reset hands live state a reference into the shared defaults
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: persistence
data_class: A
adr: none
depends_on: []
assignee: opencode
---

# BUG-0658 — Galaxy reset hands live state a reference into the shared defaults

Follow-up to the FEAT-0342 review swarm (M1, L1). Transcribed 1:1 from the
hand-written code, so no new guilt — but the schema is the natural place to
end it.

## Symptom

After a galaxy-background reset, mutating the live `galaxySettings` (e.g.
camera position / rotation) also mutates `defaultSettings` for the rest of
the session: every later load miss and every later reset inherits the
contamination. The sibling `resetTradeFlow` does not have this problem.

Separately, the `backgroundOpacity` reset pin is vacant: `resets.ts` sets `1`
and the default is `1.0`, so the test passes whether the reset reads the
default or a hardcode.

## Evidence

**Derived**, verified against `develop` (`8af24c67b`):

- `resetGalaxy` does `target.galaxySettings = { ...defaults.galaxySettings }`
  (`resets.ts:77-88`) — a top-level spread. Nested objects (`camPos`,
  `galaxyRot`, …) stay shared with the default.
- `mergeGalaxySettings` (`persistenceSchema.ts:333`) does the same
  (`{ ...defaults, ...(stored || {}) }`) under a comment claiming "Deep
  merge".
- The sibling `mergeTradeFlowSettings` right below documents exactly this
  hazard ("a spread would otherwise hand the live state the very same object
  as `defaultSettings`"), and `resetTradeFlow` uses `structuredClone`
  (`resets.ts:93`). The pattern and the precedent are both in the tree.

## Cause

Top-level spread where a deep copy is needed. Same class as the `or`-mode
aliasing (M4 / review finding 1): only `customHotkeys` got the fresh-literal
treatment so far.

## Fix

- `resetGalaxy` and `mergeGalaxySettings`: `structuredClone` (1 line each),
  following the `resetTradeFlow` precedent.
- `backgroundOpacity` pin: fixture with a non-`1` default, mirroring the
  existing `backgroundBlur` 0-vs-5 pin.

What to leave alone: the `or`-mode aliasing itself — that is M4's item, and
changing load semantics rides separately, not silently in this fix.

## Acceptance criteria

- [x] Tests reproduce the aliasing (reset path, merge path, and every object-valued manager init) and fail without the fix — all proven red by removing the clone
- [x] `structuredClone` used in both galaxy paths (reset + merge) and in all 14 object-valued manager inits (plus the previously spread-only `aiAllowedActions` and `feeRates` unified onto it)
- [x] The `backgroundOpacity` pin fails against a hardcoded value (non-`1` default fixture) and passes reading the default
- [x] Settings reset/persistence suites stay green

## Links

- FEAT-0342 (M1/L1 in the review swarm)
- `src/stores/settings/resets.ts`, `src/stores/settings/persistenceSchema.ts`
