---
id: FEAT-0773
title: Catch a conditional key in the i18n interpolation guard
type: feature
status: done
assignee: opencode
branch: fix/feat-0773-i18n-conditional-key
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
size: S
estimate: 2
---

# FEAT-0773 — Catch a conditional key in the i18n interpolation guard

## Problem

`scripts/lint-i18n.js` exists because a `$_()` call with the wrong options shape
reached production three times: svelte-i18n reads placeholders from
`options.values`, a flat object is ignored, and the user sees `{count}` as
literal text. The guard catches that — except when the key is chosen by a
condition.

`checkInterpolation` recognises a first argument only if it is a string
literal, a template literal or a bare identifier. A ternary matches none of
them, so the whole call is skipped. That is not an exotic shape: the same file
selects keys conditionally in several places, and PR #4469 shipped exactly this
bug (`$_(count === 1 ? "…One" : "…Other", { count, types })`) while the guard
printed "All $_() interpolations pass their values correctly" and CI stayed
green. The test that should have caught it mocked the translation store with
the same wrong shape, so it agreed with the defect.

## Proposal

Parse the call instead of matching its first argument. Locate `$_(`, scan to
the balanced closing parenthesis while ignoring string and template literals,
split the argument list at top-level commas, and require the second argument to
be an object literal that starts with `values:`. Report the offending
`file:line` in the same format as the script's other rules.

Optionally add one component test that mounts a small component with the real
`locales/i18n` module (no mock), waits for the dictionary to load and asserts
the rendered text contains no `{`. Nothing in the suite currently renders a
real translation, which is why every mocked test could agree with a broken
call.

## Acceptance criteria

- [x] A call with a conditional key and a flat options object is reported
      (`$_(flag ? "a" : "b", { count })`).
- [x] The same call with `{ values: { count } }` is not reported.
- [x] The shapes that pass today — string literal, template literal, bare
      identifier — keep passing unchanged.
- [x] Nested parentheses, and string literals containing `)` or `,` inside the
      arguments, do not confuse the scan.
- [x] A call with a single argument (no interpolation) is never reported.
- [x] The reported line number points at the `$_(` call, not at the file.
- [x] A test covers the three shapes and the nested-paren case, in the style
      the script's checks are tested today.
- [x] `node scripts/lint-i18n.js` stays green on `develop`, and the check runs
      in the same CI job as before.

## Decisions

- **Fix the guard, not just the call.** The conditional-key shape is idiomatic
  in this codebase; a guard that cannot see it will miss the fourth occurrence
  too.
- **Parse, do not regex harder.** The argument list can contain nested calls
  and strings; a balanced scan is the smallest thing that is actually correct.
- **Keep the real-translation test optional.** It would close the loop
  end-to-end, but it needs a dictionary load in a component test, which is its
  own piece of work if it turns out to be slow.

## Out of scope

- Replacing svelte-i18n or changing the `$_()` call convention.
- Checking that keys exist in both locales (the translation audit does that).
- Migrating the other mocked-i18n tests.

## Links

- `scripts/lint-i18n.js` — `checkInterpolation`, the first-argument alternation
- `.github/workflows/audit.yml` — the job that runs it
- `src/components/settings/tabs/VisualsLayout.svelte` — the call PR #4469
  shipped with a flat options object
- `src/components/alerts/tabs/ManageTab.component.test.ts` — a mock that models
  the real `values` shape

## What shipped

`findInterpolationViolations` in `scripts/lib/i18n-key-usage.mjs` no longer
describes the key at all. The regex only finds the call (`callee(`), and the
arguments come from `callArguments` — the balanced, quote-aware splitter that
already existed for the `modalState.show` rule — so the key can be a literal, a
template, an identifier, a member access, a nested call or a ternary without the
rule listing any of those shapes. The second argument decides: it must start
with `{`, and `values` (or an empty object) is fine, anything else is a
violation reported at the line of the `$_(`.

`FIRST_ARGUMENT` is gone; it had no other reader. The tests grew from 17 to 22:
the conditional key with and without the `values` wrapper, a comma and a `)`
inside a string, a nested call in the key argument, a conditional key with no
object argument, and the literal shapes that must stay checked.

The optional real-translation component test was left out on purpose, as the
Decisions allow: it verifies the dictionary load, not this rule, and belongs to
its own item.
