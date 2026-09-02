---
id: FEAT-0365
title: Precompute month padding and day arrays in CalendarHeatmap using derived runes
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: journal
data_class: none
adr: none
depends_on: []
size: XS
---

# FEAT-0365 — Precompute month padding and day arrays in CalendarHeatmap using derived runes

## Problem

In `src/components/shared/charts/CalendarHeatmap.svelte:254` and line 259, template loops construct array instances on the fly during rendering:

```svelte
{#each Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }) as _}
  <div class="calendar-day-empty"></div>
{/each}

{#each Array.from({ length: getDaysInMonth(currentYear, currentMonth) }, (_, i) => i + 1) as day}
  ...
{/each}
```

Every time the heatmap re-renders (e.g. on theme toggle, trade selection, hover tooltip, or resize), `Array.from` instantiates new array objects and helper functions on the main thread inside the render loop.

## Proposal

1. Precalculate empty prefix slots and month day numbers via `$derived`:
   ```typescript
   let emptyDaysCount = $derived(getFirstDayOfMonth(currentYear, currentMonth));
   let emptyDaysArray = $derived(Array.from({ length: emptyDaysCount }));
   let daysInMonth = $derived(getDaysInMonth(currentYear, currentMonth));
   let monthDaysArray = $derived(
       Array.from({ length: daysInMonth }, (_, i) => i + 1)
   );
   ```
2. Loop over `emptyDaysArray` and `monthDaysArray` in the template with stable keys where appropriate.

## Evaluation

- **Umfang (Scope):** XS (approx. 10 lines changed)
- **Priorität (Priority):** P3 (Template hygiene and minor GC reduction)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [ ] Empty slots and day numbers are derived once per month/year change rather than on every render cycle.
- [ ] Calendar heatmap renders identically for all 12 months, leap years, and locale offsets.
- [ ] No visual or behavioral regressions when interacting with calendar days.

## Out of scope

- Rewriting the date formatting or journal aggregation logic.

## Open questions

None.

## Links

- [`src/components/shared/charts/CalendarHeatmap.svelte:254-265`](file:///home/pat/Dokumente/GitHub/cachy-app/src/components/shared/charts/CalendarHeatmap.svelte#L254-L265)
