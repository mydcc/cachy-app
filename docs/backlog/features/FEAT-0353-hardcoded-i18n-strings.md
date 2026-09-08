---
id: FEAT-0353
title: "Extract hardcoded UI strings to i18n dictionary"
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
parent: FEAT-0341
depends_on: []
---

## Description
A codebase sweep for hardcoded UI strings revealed several components bypassing the `$_("...")` localization store. Some even mix German and English directly in the template. Examples include:
- `JournalFilters.svelte`: "Live", "Paper", "Alle"
- `TradeDetailDrawer.svelte`: "Risk Amount", "Max Profit"
- `TechnicalsPanel.svelte`: "Market Structure Low"

This breaks localization parity (DE/EN) as mandated by `AGENTS.md`.

## Acceptance criteria
- [ ] Scan `src/components/` for raw user-facing text nodes in templates.
- [ ] Extract these strings into the respective language dictionaries in `src/locales/` (en/de).
- [ ] Replace hardcoded text with `{$_('key.name')}` calls.
- [ ] No regression in layout or UI when switching languages.

## Out of scope
- Full translation of error logs or console messages (only user-facing UI text).
