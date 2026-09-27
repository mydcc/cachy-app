---
id: BUG-0571
title: The decimal audit cannot see a conversion passed by reference
type: bug
status: specced
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

- [ ] A fixture proves `prices.map(Number)` inside a `.svelte` script block is
      flagged and fails without the fix
- [ ] The real audit over `src/` is clean, or every new hit carries a reason
- [ ] The `## Fix` text in BUG-0534 no longer reads as a full-coverage claim

## Out of scope

- Re-tuning the existing direct-call patterns.
- Replacing the regex approach with a parser (see the note in `## Fix`).

## Links

- `scripts/audit-decimal.mjs` (`UNSAFE_PATTERN`)
- BUG-0534 (widened the net to components; explicitly did not re-tune detection)
