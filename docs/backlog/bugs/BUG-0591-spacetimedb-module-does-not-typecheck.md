---
id: BUG-0591
title: The SpacetimeDB module does not typecheck, and no CI job ever looked at it
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# BUG-0591 — The SpacetimeDB module does not typecheck, and no CI job ever looked at it

## Symptom

`server/spacetimedb/src/index.ts` — the only code that writes Class B data —
does not compile against the `spacetime` SDK the module pins. Six type errors,
all in that one file. Nothing fails, because no typecheck and no build step ever
covers `server/spacetimedb/`: the root `tsconfig.json` includes only `src/**`,
and `npm run check` runs `svelte-check` against that same tsconfig.

So the module that holds Global Chat messages, the retention sweep and the
per-sender rate-limit window is, as far as the build is concerned, unchecked
source.

## Evidence

**Demonstrated** — the errors reproduce from a clean checkout:

```bash
npx tsc -p server/spacetimedb/tsconfig.json
```

Verified on `origin/develop` at `d039a0f0`, 2026-09-29, exit code 2, six
errors:

```
index.ts:58  TS2322  Type 'string' is not assignable to type
                    '() => ReducerExport<any, …> | ProcedureExport<any, …>'
index.ts:65  TS2554  Expected 1-2 arguments, but got 3        (schema(...))
index.ts:73  TS2349  This expression is not callable
index.ts:104 TS2559  Type '"delete_expired_messages"' has no properties in
                    common with type 'ReducerOptsWithOptionalName<…>'
index.ts:124 TS2559  Type '"delete_my_messages"' … no properties in common …
index.ts:139 TS2559  Type '"send_message"' … no properties in common …
```

Every one of them is an API-shape mismatch, not a logic error: the module is
written against a different `spacetime` API than the one resolved here.
`server/spacetimedb/package.json` pins `"spacetime": "^1.11.2"` — its own
package, separate from the root `package.json`, which does not depend on
`spacetime` at all.

## Cause

Two contributors, and which dominates is not yet established:

1. The module's API usage does not match the resolved SDK version, and
2. nothing in CI compiles that directory, so the drift accumulated silently
   rather than at a red build.

The second is the reason this is a bug at all rather than a known-broken
module. Whether the SDK moved under a caret range (`^1.11.2` admits any 1.x) or
the module was written against a different major is not established — check
the installed version against the SpacetimeDB changelog before assuming.

## Fix

1. Decide which API the module targets, then align it: pin the SDK to a version
   whose types match, or update the module to the pinned SDK's API. Do not
   change both at once — the errors are the only evidence of which side is
   wrong.
2. Install the module's own dependencies (`server/spacetimedb/` is a separate
   package; `npm ci` at the root does not cover it).
3. Add the typecheck to CI once it is green — as a separate commit from the
   fix, so a red gate cannot be mistaken for a broken fix.
4. State the intended command in `docs/GLOBAL-CHAT.md`, which currently claims
   `npm run check` covers this module. It does not.

Do not suppress the errors with `@ts-expect-error` to make a gate green. If a
specific error turns out to be unavoidable, say why in the code.

## Acceptance criteria

- [ ] `npx tsc -p server/spacetimedb/tsconfig.json` exits 0 with no
      `@ts-expect-error` or `@ts-ignore` added to silence these six
- [ ] The chosen SDK version is pinned exactly, and the pin is stated in
      `server/spacetimedb/package.json`
- [ ] A CI job runs that typecheck and passes
- [ ] `docs/GLOBAL-CHAT.md` no longer claims `npm run check` typechecks the
      module, and names the command that does
- [ ] The SpacetimeDB CLI is available in that CI job, or the job is
      documented as a separate manual gate — a `spacetime build` that CI cannot
      run is not verification

## Links

- `server/spacetimedb/src/index.ts` — the six errors
- `server/spacetimedb/package.json` — the `spacetime` pin
- `tsconfig.json:15-23` — why `src/**` only
- `docs/GLOBAL-CHAT.md` — the incorrect claim about `npm run check`
- [ADR-0004](../../adr/0004-spacetimedb-data-scope.md) — the data scope this module
  is supposed to honour
