---
id: BUG-0571
title: The decimal audit cannot see a conversion passed by reference
type: bug
status: done
assignee: opencode
branch: fix/bug-0571-decimal-audit-pattern
shipped: unreleased
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: [BUG-0534]
---

# BUG-0571 — The decimal audit cannot see a conversion passed by reference

Found while reviewing BUG-0534 (PR #3685). BUG-0534 widened the audit from
`.ts` files to every `.svelte` component and deliberately left the detection
patterns alone, so this gap is the one that decision left open.

## Symptom

`prices.map(Number)` and `rows.map(parseFloat)` pass the audit silently. The
pattern is a plain reference to the function, not a call, so the script's
`UNSAFE_PATTERN` — which requires an opening parenthesis — never sees it.

## Evidence

**Verified** — `/\b(Number|parseFloat)\s*\(/` does not match `.map(Number)`.
`prices.map(parseFloat)` inside a component is a plausible real pattern for
exactly the file BUG-0534 exists to catch, and it is currently invisible.

## Cause

The pattern list was written for direct calls. Reference passing is the same
conversion with the syntax on the other side of the identifier.

## Fix

Add the narrow form to `UNSAFE_PATTERN`:

```js
/\b(?:Number|parseFloat)\s*\(|\.map\(\s*(?:Number|parseFloat)\s*\)/
```

Then decide what to do about the false positives this introduces — a
`[1, 2, 3].map(Number)` on an array of indices is a legitimate non-financial
use, and the marker is the answer for it. Triage whatever the widened pattern
flags across `src/`, as BUG-0534 did for components.

The general shape — any reference to `Number`/`parseFloat` in a value position
— is a parser's job, not a regex's. If more forms keep appearing, that is the
signal to stop extending the pattern list.

## Acceptance criteria

- [x] A fixture proves `prices.map(Number)` inside a `.svelte` script block is
      flagged and fails without the fix
- [x] The real audit over `src/` is clean, or every new hit carries a reason
- [x] The `## Fix` text in BUG-0534 no longer reads as a full-coverage claim

## What shipped

`UNSAFE_PATTERN` in `scripts/audit-decimal.mjs` gained the narrow second
alternative `\.map\(\s*(?:Number|parseFloat)\s*\)`, exactly as proposed — no
more, no less. The fixture `scripts/__fixtures__/audit-decimal/map-reference/`
holds both forms in one component script block; against the pre-fix script it
yields zero violations (the RED run), after the fix two. The belt-and-braces
grep in `audit.yml` stays untouched: it is a frozen copy of the original check
on four legacy files, and the widened script covers those files too.

**Triage: two hits, both marked, none converted.** The widened pattern flags
exactly two lines across `src/`, both in `OrderHistoryList.svelte`
(`customStartDate` / `customEndDate` split into year, month, day for
`Date.UTC`). Calendar date parts feeding an epoch-ms range bound — the same
non-financial class the script's own help text names — so both carry
`// audit: safe` with that reason instead of a conversion.

**The header no longer promises the old blind spot.** The "What this does not
claim" paragraph in the script now names the general value-position shape as
a parser's job and records `.map()` as the one reference form worth a regex.
BUG-0534's `## Fix` gained the matching sentence, so neither text reads as a
full-coverage claim anymore.

## Out of scope

- Re-tuning the existing direct-call patterns.
- Replacing the regex approach with a parser (see the note in `## Fix`).

## Links

- `scripts/audit-decimal.mjs` (`UNSAFE_PATTERN`)
- BUG-0534 (widened the net to components; explicitly did not re-tune detection)
