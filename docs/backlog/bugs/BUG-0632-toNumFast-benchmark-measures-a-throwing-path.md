---
id: BUG-0632
title: The toNumFast benchmark measures a code path that always throws
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:            # required while status: in-progress (who is working this)
---

# BUG-0632 — The toNumFast benchmark measures a code path that always throws

## Symptom

`tests/benchmarks/toNumFast.bench.ts` fails in every run:

```
× Current - DecimalLikes (Method)
Error: [DecimalError] Invalid argument: [object Object]
 ❯ new Decimal node_modules/decimal.js/decimal.mjs:4398:11
 ❯ tests/benchmarks/toNumFast.bench.ts:23:20
```

It fails under both benchmark projects, so it is not a project-collection
artefact.

## Evidence

*Demonstrated* — `npm run benchmark:technicals` on `chore/vitest-5`:

```
Tests  5 failed | 86 passed | 4 skipped (91)
```

## Cause

The benchmark exists to compare the legacy converter against the current
`toNumFast`. The fixture is a synthetic Decimal-like object:

```ts
const decimalLikes = Array(1000).fill(0).map(() => ({ s: 1, e: 1, d: [123], toNumber: () => 0.123 }));
```

and the legacy branch under measurement does:

```ts
if (val && typeof val === 'object' && decimalLike.s !== undefined && decimalLike.e !== undefined) {
    return new Decimal(val as Decimal.Value).toNumber();   // line 23
}
try { return new Decimal(val as Decimal.Value).toNumber(); } catch { return 0; }
```

The duck-typing branch recognises the shape and then hands the object to the
`Decimal` constructor anyway, which rejects it. The `try/catch` only protects
the line below, so nothing catches this. The branch's stated purpose — "Duck
typing for Decimal-like objects to avoid try/catch" — is not achieved by the
code as written.

Worth noting how this stayed invisible: on Vitest 4 a throwing benchmark did
not fail the run. On Vitest 5 a benchmark is a test, so it does.

## Fix

Not decided. Two candidates:

- Make the fixture something the legacy path can actually convert, so the
  comparison measures a working path. The fastest path is removed, but the
  measured code stays untouched.
- Give the legacy branch the `try/catch` it appears to intend. That changes the
  code under measurement, which changes what the benchmark reports.

Prefer the first: this benchmark's job is to compare two implementations, not
to repair the old one.

## Acceptance criteria

- [ ] `npm run benchmark:technicals` reports no failure for
      `Current - DecimalLikes (Method)`
- [ ] The `Optimized (Imported) - DecimalLikes (Method)` benchmark still runs and
      still compares the same pair, so the measurement did not become trivial
- [ ] No production code is changed — the file under measurement
      (`src/utils/fastConversion.ts`) stays byte-identical

## Links

- BUG-0631 — the other benchmark-harness defect
- FEAT-0630 — the migration that made this visible
