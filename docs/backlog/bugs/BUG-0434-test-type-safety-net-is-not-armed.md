---
id: BUG-0434
title: The exhaustive WindowType record cannot fail the build because tsconfig excludes test files
type: bug
status: specced
priority: P2
milestone: M4
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0434 — The exhaustive WindowType record cannot fail the build because tsconfig excludes test files

## Symptom

`src/lib/windows/WindowRegistry.test.ts` carries a `Record<WindowType, true>` whose
documented purpose is to break the build when a member is added to the `WindowType`
union without a matching entry. Its comment states that `npm run check` "fails to
compile this file (missing key)".

It does not. `tsconfig.json` lists `src/**/*.test.ts` under `exclude`, so
`svelte-check` never type-checks the file. The guard is inert, and reads as a
guarantee that does not exist.

## Evidence

**Demonstrated.**

- `tsconfig.json` → `exclude` contains `src/**/*.test.ts` and `src/**/*.spec.ts`.
- `alertpanel` was added to the `WindowType` union (`src/lib/windows/types.ts:207`)
  and registered (`src/lib/windows/WindowRegistry.svelte.ts:137`), but the record in
  the test was never updated. `npm run check` stayed green throughout:
  `COMPLETED 2197 FILES 0 ERRORS 6 WARNINGS`.
- Vitest does not close the gap either — it transpiles without type checking, so the
  missing key produced no failure there.
- The missing entry was found by code review, which is exactly the manual step the
  mechanism was built to replace.

## Impact

Every future `WindowType` member can be added without a registered config and without
any automated signal. The failure mode is a window type that silently falls back to the
generic `window` config — wrong size, wrong flags, wrong singleton behaviour — with no
build or test failure to point at it.

The same hole covers every other compile-time invariant expressed in a `.test.ts` file.

## Proposal

Move the exhaustiveness check to a file the compiler actually reads. Options, cheapest
first:

1. **Co-locate the invariant with the registry.** Assert exhaustiveness inside
   `WindowRegistry.svelte.ts` (a `satisfies Record<WindowType, WindowConfig>` on the
   config source, or a small `windowTypes.ts` holding the record). The registry is
   already type-checked, so the guard arms itself with no config change.
2. **Make the test a runtime check.** Derive the list of types at runtime from the
   registry and assert against it in Vitest. Weaker — it can only catch a type that was
   registered, not one that was added to the union and forgotten.
3. **Type-check tests too.** Remove `src/**/*.test.ts` from `exclude`. Correct in
   principle, but the blast radius across the existing suite is unmeasured and this is
   not the place to discover it.

Option 1 is the recommendation: it closes the class rather than the instance, and it
does not depend on anyone remembering to keep two lists in sync.

## Acceptance criteria

- [ ] Adding a member to the `WindowType` union without a registered config fails
      `npm run check`.
- [ ] The claim is verified by demonstration: add a throwaway union member, show the
      check goes red, remove it.
- [ ] The misleading comment in `WindowRegistry.test.ts` is corrected or removed, so no
      file claims a guarantee it does not provide.
