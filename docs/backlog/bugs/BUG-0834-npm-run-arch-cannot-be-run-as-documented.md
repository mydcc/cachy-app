---
id: BUG-0834
title: npm run arch cannot be run as documented, so an architecture change cannot ship
type: bug
status: ready
priority: P2
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# BUG-0834 — npm run arch cannot be run as documented

## Symptom

`AGENTS.md` tells every agent to update
`docs/architecture/cachy-architecture.dataflow.json` in the same PR as a change
that moves data, and to regenerate the diagram with `npm run arch`. Neither
half works:

- `npm run arch:validate` aborts before it starts.
- If the validator is invoked by hand from the archify that *is* installed, it
  passes — but `deliver` writes HTML from a different renderer version than the
  committed one, and CI fails the PR on that difference.

The effect is a trap rather than an error. An architecture change either cannot
be made, or it is made and the PR goes red for a reason that has nothing to do
with the change. FEAT-0817 ran into exactly this and left a documented
correction unshipped (see **Fix**, last bullet).

## Evidence

**Demonstrated**, on 2026-11-21, in the FEAT-0817 worktree.

1. The npm script resolves a hardcoded path inside one tool's skill root:

   ```
   $ npm run arch:validate
   Error: Cannot find module '/home/pat/.config/opencode/skills/archify/bin/archify.mjs'
   ```

   `package.json` has it as
   `node $HOME/.config/opencode/skills/archify/bin/archify.mjs …`. That
   directory exists on this machine; archify is not inside it. The installed
   copy is at `~/.claude/skills/archify/bin/archify.mjs`.

2. Run from the copy that exists, validation is clean but the build is not
   reproducible:

   ```
   $ node ~/.claude/skills/archify/bin/archify.mjs validate dataflow \
       docs/architecture/cachy-architecture.dataflow.json --quality showcase
   ok dataflow … (9 artifact checks; composition showcase: 0 errors, 0 warnings)

   $ node ~/.claude/skills/archify/bin/archify.mjs deliver dataflow \
       docs/architecture/cachy-architecture.dataflow.json /tmp/fresh.html
   $ diff /tmp/fresh.html docs/architecture/cachy-architecture.dataflow.html
   -  <meta name="generator" content="archify 2.16.0-dev.0">
   +  <meta name="generator" content="archify 3.2.0">
   +  <meta name="archify-reader-contract" content="declared-wide-v1">
   ```

   730682 bytes against the committed 853912. The JSON was untouched, so the
   whole difference is the renderer.

3. `.github/workflows/architecture-diagram.yml` installs archify with
   `git clone --depth 1 https://github.com/tt-a1i/archify.git`, i.e. whatever
   HEAD is that day, then fails the job when a fresh build differs from the
   committed HTML:

   > `::error::cachy-architecture.dataflow.html is stale. Run 'npm run arch'
   > locally and commit the regenerated HTML together with the JSON.`

   The advice in that error message is the command from point 1.

## Cause

Two independent gaps that only bite together:

- **Path, not resolution.** The npm script assumes archify sits under
  opencode's skill root. Any other install location — another agent's skill
  root, a global npm prefix, a checkout — makes the script fail, and the
  absolute path would publish a contributor's home layout anyway.
- **No pinned version, three sources of truth.** CI takes archify HEAD, a
  local run takes whatever got installed, and the committed HTML carries
  whichever version last regenerated it. Nothing records which version the
  committed artifact belongs to beyond the `generator` meta tag inside it.

## Fix

- Resolve archify without assuming a skill root. Either pin it as a
  devDependency, or add a small resolver under `scripts/` that checks the known
  locations and exits with a readable message naming the expected version when
  it finds none.
- **Pin the version**, in the repo and in CI, so CI stops tracking HEAD. A
  renderer upgrade then arrives as its own PR that regenerates the HTML once,
  instead of breaking whichever unrelated architecture PR lands after it.
- Leave the diagram's nodes and flows alone. This item is about being able to
  run the tool.
- **Then, and only then, ship the correction FEAT-0817 could not.** The
  `local-first-boundary` view's note currently reads: *"Journal and portfolio
  context reach a provider only with AI consent (/api/ai/*, ADR-0011); keys and
  settings stay local."* Since
  [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md)
  that is incomplete in two ways: a strategy draft travels under a *second,
  independent* switch (`aiRuleAuthoringEgress`, not `aiShareTradeContext`), and
  it goes browser-direct and explicitly **refuses** the `/api/ai/*` relay. The
  note must name both consents and both routes.

## Acceptance criteria

- [ ] A test reproduces the defect and fails without the fix — for this item
      that is CI: a PR touching `docs/architecture/**` must be shown to go red
      today and green after.
- [ ] `npm run arch:validate` and `npm run arch:build` both run on a checkout
      where archify was never installed under opencode's skill root.
- [ ] The archify version is pinned, and CI resolves that version rather than
      `HEAD`.
- [ ] `npm run arch` on an unchanged JSON reproduces the committed HTML byte
      for byte.
- [ ] The `local-first-boundary` note names the ADR-0030 browser-direct
      authoring egress and its own consent switch, and the regenerated HTML
      ships in the same PR.

## Out of scope

- Charting AI egress as a node with flows. The diagram deliberately keeps AI
  among the "Support Services (not charted as flows)", and that decision is not
  reopened here.
- Any change to the dataflow's nodes, flows or stages.
- Vendoring archify into this repository.

## Links

- `package.json` — `arch`, `arch:validate`, `arch:build`
- `.github/workflows/architecture-diagram.yml` — the freshness gate
- `docs/architecture/README.md` — names the JSON as the source of truth
- [`FEAT-0817`](../features/FEAT-0817-ai-assisted-rule-authoring.md) — the
  change that found this, and whose diagram note correction is blocked on it
- [`ADR-0030`](../../adr/0030-a-strategy-draft-goes-out-browser-direct-and-comes-back-unarmed.md)
