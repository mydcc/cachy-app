---
id: BUG-0591
title: The SpacetimeDB module resolves the wrong SDK major, so any typecheck of it fails
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

# BUG-0591 — The SpacetimeDB module resolves the wrong SDK major, so any typecheck of it fails

## Symptom

`server/spacetimeb/src/index.ts` — the only code that writes Class B data —
reports six type errors when typechecked from a clean checkout. Nothing fails in
CI, because no typecheck and no build step ever covers `server/spacetimedb/`:
the root `tsconfig.json` includes only `src/**`, and `npm run check` runs
`svelte-check` against that same tsconfig.

**The errors are not a defect in the module.** They are what you get when the
module is typechecked against the wrong version of its own SDK. The module
typechecks clean against the version it pins.

## Evidence

**Demonstrated** — both halves, on `origin/develop` at `d039a0f0`, 2026-09-29.

Against the root install, exit code 2, six errors, all in that one file:

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

Against the version the module pins, exit code 0, no errors:

```bash
cd server/spacetimedb && npm ci    # installs 1.11.4 per the module's lockfile
cd ../..
npx tsc -p server/spacetimedb/tsconfig.json
```

Removing `server/spacetimedb/node_modules/` again brings all six back. That
round trip is the proof: the source is correct, the resolution is not.

The mechanism is a version split that nothing reconciles:

| | pinned | locked | installed at the root |
|---|---|---|---|
| `server/spacetimedb/package.json` | `spacetimedb: ^1.11.2` | 1.11.4 | — |
| `package.json` | `spacetimedb: ^2.10.1` | 2.10.1 | 2.10.0 |

`server/spacetimedb/` is a separate package with its own committed
`package-lock.json`, and nothing installs it. So `tsc` walks up from
`server/spacetimedb/src/`, finds no local `node_modules`, and resolves
`spacetimedb` from the repository root — the 2.x major. The module's
`spacetimeb/server` and `spacetimeb` imports then get 2.x declarations, which
is where all six messages come from: `schema()`'s arity, the `table()` callback
form, and the `ReducerOptsWithOptionalName` shape all changed between the two
majors.

## Cause

1. The module's own dependencies are never installed, so type resolution falls
   through to the root, and
2. nothing in CI compiles that directory, so the consequence was never observed
   as a red build.

Two majors of the same package in one repository is the underlying hazard: the
root depends on the SDK for the browser client bindings, the module for the
server runtime, and they are not required to agree. Nothing documents that they
must not.

## Fix

1. Install the module's dependencies in the environment that typechecks it, and
   make that reproducible in CI:
   `npm ci --prefix server/spacetimedb` before the typecheck step.
2. Add the typecheck as its own gate, now that it can be green:
   `npx tsc -p server/spacetimedb/tsconfig.json`. It passes today against 1.11.4
   — the gate is green on arrival, which is the only reason to add it now.
3. Decide deliberately whether the 1.x/2.x split is intended. If both majors
   must exist, say so where the next reader will look and keep the lockfiles
   that enforce it. If it is not intended, that is a separate question and
   should not be answered as a side effect of step 1.
4. `docs/GLOBAL-CHAT.md` should name the command that actually typechecks this
   module, and state that it requires the module's own install.

Do not suppress any of the six with `@ts-expect-error` or `@ts-ignore`. They are
the only signal that the resolution is wrong; silencing them would hide a
mis-resolution behind a green build.

## Acceptance criteria

- [ ] A CI job runs `npm ci --prefix server/spacetimedb` and then
      `npx tsc -p server/spacetimedb/tsconfig.json`, and both succeed
- [ ] The gate fails if `server/spacetimedb/node_modules` is absent, rather than
      silently typechecking against the root's 2.x
- [ ] No `@ts-expect-error` or `@ts-ignore` was added to `server/spacetimedb/`
- [ ] The 1.x/2.x split is either removed or documented as intentional, with the
      reason
- [ ] `docs/GLOBAL-CHAT.md` names the command that typechecks the module,
      including the install it needs
- [ ] The SpacetimeDB CLI is available in that job, or the job is documented as
      a separate manual gate — a `spacetime build` that CI cannot run is not
      verification

## Out of scope

- Whether Global Chat should be published at all. `cloudEnabled` defaults to
  `false`, so no user reaches this code without opting in, and that decision is
  separate from whether it compiles.
- Upgrading the module to the 2.x SDK.

## Links

- `server/spacetimedb/src/index.ts` — the file the errors point at, and the one
  that compiles clean against 1.11.4
- `server/spacetimedb/package.json` + `package-lock.json` — the 1.11.2 pin and
  the 1.11.4 lock
- `package.json` + `package-lock.json` — the root's 2.10.1 pin, which is what
  the module actually resolves to today
- `tsconfig.json:15-23` — why `npm run check` never sees `server/`
- [ADR-0004](../../adr/0004-spacetimedb-data-scope.md) — the data scope this
  module is supposed to honour
