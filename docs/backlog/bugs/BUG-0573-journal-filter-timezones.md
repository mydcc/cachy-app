---
id: BUG-0573
title: Journal date filter uses local end bound against UTC start bound
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# BUG-0573 — Journal date filter uses local end bound against UTC start bound

## Symptom

When filtering the journal by date, trades logged between 22:00 and 24:00 UTC on the selected end day (e.g. in Europe/Berlin) are silently excluded from the filtered results.

## Evidence

**Derived**, from reading the code.

In `src/components/shared/JournalContent.svelte`, the start bound is parsed as a pure UTC midnight timestamp, but the end bound has its time set via `endDate.setHours(23, 59, 59, 999)`. `setHours` operates on the local timezone, so the end bound is local `23:59:59.999`.

## Cause

Mixing `Date.parse(dateString)` (which defaults to UTC midnight for `YYYY-MM-DD` strings) with `.setHours` (which acts on local time).

## Fix

Calculate the end bound in pure UTC time. For instance, using `setUTCHours(23, 59, 59, 999)` on a date parsed via UTC to ensure both bounds remain in the same time domain. Also add test coverage for the journal filter.

## Acceptance criteria

- [ ] A test for journal filtering that spans timezones fails before the fix.
- [ ] The filter covers the full UTC 24h of the selected end date regardless of the local timezone.
- [ ] The test passes with the fix.

## Links
