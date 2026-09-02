---
id: FEAT-0364
title: Cache pivots transformation in TechnicalsPanel with derived rune instead of template execution
type: feature
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: indicators
data_class: none
adr: none
depends_on: []
size: XS
---

# FEAT-0364 — Cache pivots transformation in TechnicalsPanel with derived rune instead of template execution

## Problem

In `src/components/shared/TechnicalsPanel.svelte:438`, the template directly executes a method call inside an `{#each}` block:

```svelte
{#each TechnicalsPresenter.getPivotsArray(data.pivots) as pivot}
```

Because `TechnicalsPresenter.getPivotsArray` converts an object with R3, R2, R1, Pivot, S1, S2, S3 into a fresh 7-element array with label formatting on every invocation, this array is allocated, populated, and garbage-collected on every single Svelte render pass whenever any reactive dependency in `TechnicalsPanel` changes.

Per `AGENTS.md`: *"Performance: No heavy computations (sort/filter/map) directly in template `{#each}` — prepare with `$derived` beforehand."*

## Proposal

1. Create a derived rune in `TechnicalsPanel.svelte`:
   ```typescript
   let pivotsArray = $derived(
       data?.pivots ? TechnicalsPresenter.getPivotsArray(data.pivots) : []
   );
   ```
2. Update the template loop to iterate over the derived rune:
   ```svelte
   {#each pivotsArray as pivot (pivot.label)}
   ```

## Evaluation

- **Umfang (Scope):** XS (approx. 5 lines changed)
- **Priorität (Priority):** P2 (Direct compliance with AGENTS.md performance rules)
- **Schwierigkeit (Difficulty):** Low
- **Dringlichkeit (Urgency):** Low

## Acceptance criteria

- [ ] `TechnicalsPresenter.getPivotsArray` is invoked only when `data.pivots` actually changes, not on unrelated template re-renders.
- [ ] Pivot points display identically in the UI with keys preserved.
- [ ] Component passes `npm run check` and relevant component tests.

## Out of scope

- Modifying the pivot calculation formulas or formatting inside `TechnicalsPresenter`.

## Open questions

None.

## Links

- [`src/components/shared/TechnicalsPanel.svelte:438`](file:///home/pat/Dokumente/GitHub/cachy-app/src/components/shared/TechnicalsPanel.svelte#L438)
- [`src/services/technicalsPresenter.ts`](file:///home/pat/Dokumente/GitHub/cachy-app/src/services/technicalsPresenter.ts)
