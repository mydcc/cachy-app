# Evals

Golden-value fixtures for critical flows. Unlike a unit test that checks a
single branch, an eval here pins the **end-to-end result** of a flow against
values derived independently from the specification, so a change to rounding,
fee handling or arithmetic fails loudly instead of silently.

## Layout

```
evals/
  fixtures/            # input + expected output, plain JSON, no code
  *.eval.test.ts       # loads a fixture and runs it against the real code
```

Fixtures are data only: they name the function under test, the `tradeType`, the
inputs as decimal strings, and the expected outputs as exact `Decimal` strings.
The `.eval.test.ts` runner imports the production code and compares with
`Decimal#toString()` — exact equality, because precision is the thing under
test (AGENTS.md: precision before speed).

## Run

These run as part of the normal Vitest `unit` project:

```bash
npx vitest run evals/            # just the evals
npm run test:unit                # whole pure-logic project
```

## Current flows

| Flow | Source | Cases |
|---|---|---|
| Position sizing + risk metrics | `src/lib/calculators/core.ts` (`calculateBaseMetrics`) | long, short, wide stop with MMR, per-leg maker/taker fees, zero-risk edge |
| Take-profit aggregation | `src/lib/calculators/core.ts` (`calculateTotalMetrics`) | two take-profits |
| PreToolUse shell guard | `.claude/hooks/pre-tool-use-guard.mjs` | blocked destructive commands, allowed safe commands, non-Bash passthrough, malformed payload |

The shell-guard eval spawns the hook as a child process and asserts its exit
code, so the guard's behaviour is pinned the same way the arithmetic is. Its
cases live inline in `hook-guard.eval.test.ts`.

## Adding a case

1. Add a case to `fixtures/core-metrics.json` (or a new fixture file).
2. Derive the expected outputs from the formula, not from a run of the current
   implementation — otherwise the fixture just records whatever the code does.
3. Run `npx vitest run evals/`. If it fails on a field you did not intend to
   change, the fixture caught a real regression.
