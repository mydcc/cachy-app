---
id: FEAT-0774
title: Close the i18n dialog follow-ups from the BUG-0761 review
type: feature
status: in-progress
priority: P3
milestone: none
created: "2026-11-03"
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
assignee: opencode
size: S
---

# FEAT-0774 — Close the i18n dialog follow-ups from the BUG-0761 review

## Problem

The BUG-0761 review ([PR #4473](https://github.com/mydcc/cachy-app/pull/4473))
confirmed the fix and left four follow-ups that were out of that PR's scope:

1. **No plural category.** `modals.import.message` was
   `Import {count} trades?`, so a one-row CSV import asked
   "Import 1 trades?" — and "1 Trades importieren?" in German.
2. **The guard cannot see service translations.** `scripts/lint-i18n.js`
   matched only `$_(`. A call through `const t = get(_)` escaped the
   interpolation rule, and a key-shaped literal passed to
   `modalState.show(...)` was never checked — the second rule is what would
   have caught BUG-0761 without a reviewer.
3. **Dead keys.** `modals.deletePreset.title` / `.message` existed in both
   dictionaries and in `schema.d.ts` but had no reference; the delete-preset
   dialog uses `dashboard.deletePresetConfirmTitle/Message`.
4. The `message()` resolver and the i18n mock were copy-pasted into six
   component tests, and two more tests carried an equivalent local resolver.

## Evidence

**Demonstrated** — all four were observed while reviewing that diff and
reproduced here:

- the plural renders "Import 1 trades?" for `count: 1`;
- `t("key", { count })` produces no lint finding on the pre-change script;
- `grep "modals.deletePreset" src` found no call site outside `schema.d.ts`;
- `message()` was byte-identical in six test files.

## Proposal

1. Make the import confirmation an ICU plural in both dictionaries and pin the
   singular/plural forms in both languages through the real dictionary.
2. Move the call-site rules into `scripts/lib/i18n-key-usage.mjs`, teach them
   the `get(_)` alias and the `modalState.show` key literal, and cover the
   shapes with a unit test.
3. Delete the dead keys and regenerate `src/locales/schema.d.ts` with
   `npm run i18n:types`.
4. Extract the resolver and the mock module to
   `src/tests/helpers/i18nMessages.ts` and use it from the affected tests.

## Acceptance criteria

- [x] `modals.import.message` is an ICU plural in `en.json` and `de.json`;
      formatting `count: 1` yields the singular and `count: 2` the plural in
      both languages
- [x] `scripts/lint-i18n.js` reports `t("key", { flat })` after
      `const t = get(_)`, `get(_)("key", { flat })`, and a key-shaped literal
      as the first `modalState.show(...)` argument; a unit test covers those
      shapes plus the false-positive cases (identifiers ending in `t`)
- [x] `modals.deletePreset.*` is gone from both dictionaries and from
      `src/locales/schema.d.ts`
- [x] The resolver and the interpolating i18n mock live in
      `src/tests/helpers/i18nMessages.ts`; every component test that had a copy
      — the six from the BUG-0761 review and the two that carried an equivalent
      local resolver — uses it

## Out of scope

- Parsing conditional keys (`$_(flag ? "a" : "b", …)`) — that is FEAT-0773.
- Rewording the clear-journal copy.

## Links

- BUG-0761 — the review that produced these follow-ups
- FEAT-0773 — the conditional-key half of the same guard
- `scripts/lint-i18n.js`, `src/tests/helpers/i18nMessages.ts`
