---
id: FEAT-0432
title: Generate the refusal-code list from the enum instead of maintaining it twice
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: alerts
data_class: none
adr: ADR-0012
depends_on: []
---

# FEAT-0432 — Generate the refusal-code list from the enum instead of maintaining it twice

## Problem

`RefusalCode`'s own doc comment promises that "adding a variant without a
translation is visible at review time rather than at runtime as a raw code
rendered to a trader". The test that enforces it reads `ALL_CODES`, a
hand-maintained list in the same file — and the test module's comment says
plainly what that costs:

> a hand-maintained list cannot prove itself total

It has already been paid once. `InvalidLookback` shipped with FEAT-0390 with no
key in either locale file, and the totality test could not see it because the
variant was missing from `ALL_CODES` too. A trader hitting that refusal saw a
raw code.

It was nearly paid a second time. Three codes added for
[`ADR-0016`](../../adr/0016-a-claim-about-a-window-is-an-operand.md)'s window
operand — `NestedWindow`, `InvalidWindowLookback`, `RuleWarmupTooDeep` — passed
the full suite before `ALL_CODES` or the locale files knew about them. 164 tests
green, three refusals that would have rendered as raw codes. They were caught by
noticing the suite had gone *too* quiet, which is not a control.

`RuleWarmupTooDeep` is the one that makes this worth fixing rather than noting:
it is the refusal that stops an over-deep rule from being silent. A refusal that
renders as `ruleWarmupTooDeep` to a trader tells them nothing about what to
shorten, so the guard is intact and its explanation is not.

## Proposal

Declare the variants once, in a macro, and derive both the list and the i18n
suffix from that declaration:

```rust
refusal_codes! {
    /// A key the schema does not define.
    UnknownField => "unknownField",
    // …
}
```

The macro expands to the `enum`, `i18n_suffix`, and `ALL`. A variant that is not
in the declaration does not exist; one that is in it is in the list and has a
suffix. The existing tests then hold their own claim instead of testing a copy.

The blocker the current comment names does not apply. It rules out a `strum`
dependency "in the crate that computes money", which is the right instinct — but
a `macro_rules!` block needs no dependency at all. That third option is what
this item proposes.

## Acceptance criteria

- [ ] `RefusalCode`, `i18n_suffix` and the code list come from one declaration
- [ ] `ALL_CODES` no longer exists as a separately maintained list
- [ ] Adding a variant without a locale key fails `every_code_has_a_string_in_every_locale`
      in both languages — demonstrated by adding a throwaway variant and
      recording that it fails, then removing it
- [ ] No new crate dependency
- [ ] Every existing refusal keeps its current wire spelling and i18n suffix,
      asserted by a test over the serialised names so the change is provably
      inert for stored documents

## Out of scope

- Changing any refusal's wire format, suffix or message. This is a mechanism
  change; a rename would move content hashes and is a separate decision.
- The locale strings themselves.

## Open questions

None blocking. Whether the macro also generates the `Display` impl is an
implementation detail for the PR.

## Links

- `technicals-wasm/src/rule/refusal.rs` — the enum, `ALL_CODES` and both tests
- [`ADR-0012`](../../adr/0012-a-strategy-is-checkable-data-not-code-and-not-a-model-s-opinion.md) — why a refusal is machine-readable in the first place
- [`FEAT-0028`](FEAT-0028-indicator-alerts.md) — where the three near-miss codes came from
