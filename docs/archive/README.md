# Archive

Documents that were true once and are not the plan any more. Nothing here is
maintained and nothing here should be acted on without checking it against the
code first.

They are kept rather than deleted for two reasons: the reasoning in them is
often still worth reading (especially the engineering log), and this repository
has already been bitten once by documentation that quietly stopped matching the
code — see `docs/REPO-AUDIT.md`. Deleting the evidence would make that harder to
notice next time, not easier.

**Where the live plan lives now:** [`docs/README.md`](../README.md) is the map.

---

## What is here, and why it was archived

### `engineering-log-2026-h1.md` — was `docs/ROADMAP.md`

4252 lines, and not a roadmap. It is the work log of the engineering-foundation
phase (items 1–29: version pipeline, semantic-release, ESLint burn-down, the
documentation truth pass, the Global Chat consolidation). Almost every item is
🟢 done.

It is worth keeping in full because most entries record *why* something was
decided or *what* a change turned out to break — the two `bitunixWs.ts` bugs
found during the `any` burn-down, the `deploy.sh` config migration trap, the
two overstated bug claims that were walked back. That reasoning is not
reproducible from the diff.

What it is **not** is a plan for what to build. Product planning now lives in
[`MILESTONES.md`](../MILESTONES.md) and [`ROADMAP.md`](../ROADMAP.md).

Items 24e and 25–29 were still open when it was archived; all of them are
already carried in [`docs/TODO.md`](../TODO.md) (items 18–22 and 1), which is
live. Nothing open was lost by archiving this file.

### `refactor-todo.md` — superseded, the refactor happened

Describes a folder restructure as pending. It is done:

| Claim in the document | Actual state |
| --- | --- |
| Move UI components from `src/lib/components` to `src/components` | Done — `src/components/{inputs,layout,results,settings,shared}` exist; `src/lib/components/` holds one file |
| Split `src/lib/stores.ts` into per-topic stores under `src/stores/` | Done — `src/lib/stores.ts` does not exist; `src/stores/` holds ~20 rune stores |
| Move services into `src/services/` | Done — ~50 services live there |
| Replace all `any` types | Done — engineering log item 21, `no-explicit-any` is now `error` and the count is 0 |

### `module-overview.md` — factually wrong about the current tree

Points at files that no longer exist (`src/lib/stores.ts`) and calls
`src/lib/apiService.ts` "aktuell ein Platzhalter" — the real file is
`src/services/apiService.ts` and it is fully implemented. It described the
pre-refactor layout that `refactor-todo.md` was written to change.

Replaced by [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), written from the tree
as it is.

### `reports/analysis_report.md`, `reports/code_analysis_status_report.md`

Two point-in-time hardening analyses. Most of what they flagged was resolved by
engineering-log items 18–21: the `any` types in `tradeService.ts`/`omsService.ts`/
`apiService.ts` are gone, `(e as any).status` casts are gone, timer handles are
typed, `omsService` has a `destroy()` that clears its watchdog.

**Two findings were re-checked against the code before archiving and are still
open.** They were carried into the backlog rather than archived with the rest:

- Hardcoded UI strings — verified still present in `AssistantView.svelte`
  ("Anwenden", "Ignorieren"), `SymbolPickerView.svelte` ("Majors Only") and
  `IndicatorSettings.svelte` ("Auto Optimize") → [`BUG-0007`](../backlog/bugs/BUG-0007-hardcoded-ui-strings.md)
- `toastService.toasts` is an unbounded `push()` with no cap →
  [`BUG-0008`](../backlog/bugs/BUG-0008-toast-array-unbounded.md)

### `plans/plan_proposal.md`, `plans/settings-ui-optimization-20260228.md`

`plan_proposal.md` is the action plan derived from the two reports above; same
status, same two survivors.

`settings-ui-optimization-20260228.md` was never executed —
`src/components/settings/ui/` does not exist and there is no settings search.
The idea is still reasonable, so it is carried as
[`FEAT-0022`](../backlog/features/FEAT-0022-settings-search.md) rather than
silently dropped.

### `dexter_integration_plan.md`, `web_search_implementation_plan.md`

Two overlapping plans for the same feature: an agentic web-search loop for the
AI assistant. Neither was built — there is no `searchService.ts` and no
reference to Tavily or Exa anywhere in `src/`.

The feature is still wanted, but it belongs to the AI milestone and needs
re-specifying against the current AI stack rather than resurrecting a plan
written for a different one. Carried as
[`FEAT-0019`](../backlog/features/FEAT-0019-agentic-web-search.md); these two
documents stay here as the prior art.
