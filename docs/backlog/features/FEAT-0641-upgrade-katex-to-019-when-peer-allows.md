---
id: FEAT-0641
title: Upgrade katex to 0.19 once marked-katex-extension allows it
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:
---

# FEAT-0641 — katex 0.19 is blocked by its only consumer's peer range

(Replaces FEAT-0640, which went with the closed PR #3906.)

## Problem

`katex` 0.19.0 is available (currently 0.18.10). The bump works locally, but
the only thing in this repo that renders maths through katex explicitly
excludes that version.

```
marked-katex-extension@5.1.13
  peerDependencies: { katex: ">=0.16 <0.19", marked: ">=4<19" }
```

`marked-katex-extension` is how katex is reached: `src/utils/markdownUtils.ts`
imports it, and both `CandlestickPatternsView.svelte` and
`ChartPatternsView.svelte` import `katex/dist/katex.min.css` directly.

**5.1.13 is the newest published version of that package.** There is no release
that permits katex 0.19, so there is no upgrade path for the consumer to pair
with. `npm ls` reports no conflict and npm installs silently — the exclusion
lives in a peer range that nothing here enforces.

## Evidence

*Demonstrated*, by reading the published peer range, and by attempting the
bump:

- `npm view marked-katex-extension@latest` → `5.1.13`, peer `katex >=0.16 <0.19`
- katex 0.19.0 installed, `npm run build` green, `katex/dist/katex.min.css`
  resolves for both component imports
- Rendering compared against the 0.18.10 control through the real
  `renderSafeMarkdown` / `renderTrustedMarkdown` path: **13 comparisons — the
  `innerHTML` and the `textContent` of six inputs — all identical.** That
  includes inline maths, display maths, a deliberately broken formula, plain
  markdown, an `align` environment, and the trusted path.
- PR #3906 was closed on the peer range, not on a measured regression. Nothing
  broke locally; the objection is that the consumer's author has not validated
  the version we would be shipping.

That last distinction matters. The measurement is reassuring and the peer range
is still the deciding evidence: six inputs I chose are not upstream validation,
and `renderSafeMarkdown` feeds a sanitized path that renders user-visible pages.

## Cause

Peer ranges are advisory. Nothing in the toolchain treats `>=0.16 <0.19` as an
error, so a version outside it installs and runs — and the mismatch only shows
up as an odd rendering that nobody attributes to the version bump.

## Proposed fix

Wait for `marked-katex-extension` to widen its peer range, or for a release that
supports katex 0.19. Then bump both together and re-run the comparison above.

Do not force it by loosening the peer range ourselves — no `overrides`, no
patch. The exclusion is the consumer's statement about what it has tested, and
overriding it would replace a visible signal with a silent one.

If katex 0.19 is needed before that lands, the alternative is to drop
`marked-katex-extension` and call `katex.renderToString` directly, which removes
the peer constraint entirely. That is a real change to the markdown pipeline and
deserves its own decision, not a dependency bump.

## Acceptance criteria

- [ ] `marked-katex-extension` ships a release whose peer range includes katex
      0.19, or maths rendering moves off it
- [ ] `katex` at `^0.19.0` with no peer override in `package.json`
- [ ] The 13 comparisons above still pass, plus a visual check of a
      maths-heavy page
- [ ] `npm run build` green

## Open questions

- Does the maths pipeline need `displayMode` handling that
  `marked-katex-extension` provides? Relevant only if the direct-katex route
  becomes the answer.

## Links

- `src/utils/markdownUtils.ts`,
  `src/components/shared/CandlestickPatternsView.svelte`,
  `src/components/shared/ChartPatternsView.svelte`
- Closed PR #3906 carried the attempt and the measurement
