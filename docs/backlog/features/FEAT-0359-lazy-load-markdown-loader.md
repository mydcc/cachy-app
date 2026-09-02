---
id: FEAT-0359
title: Lazy-load markdownLoader and KaTeX on demand when instruction modals open
type: feature
status: in-progress
assignee: antigravity
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
size: S
# Branch: feat/feat-0359-lazy-load-markdown
---

# FEAT-0359 — Lazy-load markdownLoader and KaTeX on demand when instruction modals open

## Problem

The main trading view (`src/routes/+page.svelte:39`) statically imports `loadInstruction` from `../services/markdownLoader`. This causes the production build to eagerly bundle `marked`, `marked-katex-extension`, KaTeX runtime, 36 KaTeX font files (>500 KB total assets), and the entire raw `CHANGELOG.md` into the initial client bundle (`markdownLoader.js` is 189.61 KB / 55.55 KB gzip). 

Users loading the application for position sizing or trading pay this download and parsing penalty on First Contentful Paint (FCP), even though the changelog, guide, privacy policy, and whitepaper modals are accessed only occasionally.

## Evidence

- In `src/routes/+page.svelte:39`:
  ```typescript
  import { loadInstruction } from "../services/markdownLoader";
  ```
- In `src/services/markdownLoader.ts:18-22`:
  ```typescript
  import { marked, type Tokens } from "marked";
  import markedKatex from "marked-katex-extension";
  import generatedChangelog from "../../CHANGELOG.md?raw";
  ```
- Build artifact inspection: `markdownLoader.js` is 189.61 kB (55.55 kB gzip), and KaTeX generates 36 font files linked to the layout chunk.

## Proposal

1. Remove the static top-level import `import { loadInstruction } from "../services/markdownLoader";` in `src/routes/+page.svelte`.
2. Inside the modal opening effects (`$effect` for `changelog`, `guide`, `privacy`, `whitepaper`), dynamically import the loader:
   ```typescript
   const { loadInstruction } = await import("../services/markdownLoader");
   ```
3. This splits the markdown parser, KaTeX math engine, and embedded changelog into a separate, lazy-loaded chunk that is only requested when a user actually opens one of those modal windows.

## Evaluation

- **Umfang (Scope):** S (approx. 20 lines modified in `+page.svelte`)
- **Priorität (Priority):** P2 (Direct impact on initial bundle size and FCP)
- **Schwierigkeit (Difficulty):** Low (standard dynamic import)
- **Dringlichkeit (Urgency):** Medium

## Acceptance criteria

- [x] `npm run build` confirms `markdownLoader` and KaTeX are absent from the critical path of `+page.svelte` and root layout.
- [x] Opening the Changelog, Guide, Privacy, or Whitepaper modal fetches the markdown bundle on demand and renders correctly with formatting and formulas.
- [x] No regression in modal opening behavior or anchor-tag scrolling within rendered markdown.

## Out of scope

- Replacing KaTeX or Marked with alternative libraries.
- Changing markdown styling or CSS variables.

## Open questions

None.

## Links

- `src/routes/+page.svelte:39`
- `src/services/markdownLoader.ts:18-22`
