---
id: BUG-0639
title: conventional-changelog-conventionalcommits 10 cannot render with the installed writer
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
# assignee:
---

# BUG-0639 — The changelog preset cannot be bumped on its own

## Symptom

`conventional-changelog-conventionalcommits` is stuck at 9.3.1. Bumping it to
10.4.1 makes release-notes generation throw at release time:

```
Missing helper: "conventional-changelog-conventionalcommits requires
conventional-changelog-writer@9 or newer (conventional-changelog@8 or newer).
Your changelog tooling loaded an older writer which cannot render this preset."
```

The preset is not optional. `release.config.js` sets
`preset: "conventionalcommits"` on `@semantic-release/release-notes-generator`,
with a 35-entry `presetConfig.types` table that hides internal scopes from the
user-facing notes.

## Evidence

*Demonstrated* — the preset was bumped locally, rendered through the same
writer the release pipeline uses, and compared against the 9.3.1 control.

- `conventional-changelog-conventionalcommits@10.4.1` + installed writer →
  the error above, at template render time.
- `conventional-changelog-conventionalcommits@9.3.1` + installed writer → renders
  changelog markdown normally.

Versions involved:

| package | installed | required by v10.4.1 |
|---|---|---|
| `conventional-changelog-writer` | 8.4.0 | ≥ 9 |
| `conventional-changelog-conventionalcommits` | 9.3.1 → 10.4.1 fails | — |

The writer is not a direct dependency. Two `@semantic-release` plugins request it,
both with `^8.0.0`, and the lockfile resolves that to a single hoisted copy:

```
@semantic-release/commit-analyzer:           conventional-changelog-writer ^8.0.0
@semantic-release/release-notes-generator:   conventional-changelog-writer ^8.0.0
conventional-changelog-writer (lockfile):    8.4.0
```

The generator's wrapper imports the bare specifier, so it gets exactly that
copy:

```js
// @semantic-release/release-notes-generator/wrappers/conventional-changelog-writer.js
import { writeChangelogString as writer } from 'conventional-changelog-writer';
```

Both requesters are semantic-release's own, which is why the fix is a
semantic-release upgrade rather than something we can pin from here.

## Two things that are *not* wrong

Recorded so nobody re-chases them:

- **v10 being ESM-only is fine.** Its `exports` map has no `require` condition,
  so `require('conventional-changelog-conventionalcommits')` throws. But
  `load-changelog-config.js` loads presets through `import-from-esm`, i.e. a
  dynamic `import()`, which resolves ESM-only packages without trouble.
- **The returned shape did not change.** Both 9.3.1 and 10.4.1 return
  `{ commits, parser, writer, whatBump }`, which is what semantic-release 25
  reads (`loadedConfig.parser`, `loadedConfig.writer`). An earlier suspicion that
  v10 broke that contract was wrong.

## Cause

The preset and the writer version each move independently, and the preset's
requirement is enforced at render time by a Handlebars helper rather than by
`peerDependencies`. So npm installs the combination happily and the failure only
appears when a release is cut.

## Proposed fix

Bump the toolchain, not the leaf package:

1. Upgrade `semantic-release` to a version whose generator depends on
   `conventional-changelog-writer@9`+.
2. Re-test the preset on 10.4.1 with that writer.
3. Only then bump the preset.

Do **not** add `conventional-changelog-writer` as a direct dependency to force
resolution. It is the generator's dependency, and pinning it in our
`package.json` would put us in charge of a version we do not own — the same
lesson as `jsdom` in `dependencies` (FEAT-0634), just with the signs swapped.

## Blast radius

`@semantic-release/changelog` is **not** in the plugin list, so nothing writes
`CHANGELOG.md` — consistent with `AGENTS.md`, which states release notes are
curated by hand. The generated notes become the **GitHub release body**. So a
failure here breaks the notes users read on the release page, and the
`effect: "hidden"` table is what keeps internal `deps`/`ci`/`test` commits out
of them.

## Open questions

- In a local harness, 9.3.1 rendered the default sections (`Features`,
  `Bug Fixes`, `Performance Improvements`, …) and did **not** hide anything:
  `feat(deps)`, `perf`, `docs`, `chore`, `refactor` and `test` commits all
  appeared. That suggests the `effect: "hidden"` entries in
  `release.config.js` may not be taking effect — but the harness was not proven
  faithful, so this is unverified. It needs checking against a real release, or
  a harness that reproduces `load-changelog-config.js` plus
  `@semantic-release/commit-analyzer`. If the hiding really is inert, the
  release notes are full of internal commits today.
- Does upgrading `semantic-release` to get writer@9 change any other plugin
  behaviour? `release-guard.js` and the `npm`/`github` plugins are in the same
  chain.

## Acceptance criteria

- [ ] `conventional-changelog-writer@9`+ is what the generator resolves
- [ ] `conventional-changelog-conventionalcommits@10.4.1` renders release notes
- [ ] Internal scopes (`deps`, `ci`, `test`, `perf`, `docs`, `chore`,
      `refactor`, …) stay out of the release notes — or the attempt to hide them
      is removed from `release.config.js` so the config stops claiming something
      it does not do
- [ ] A dry run produces the expected notes before this ships

## Links

- `release.config.js` (`preset: "conventionalcommits"`, `presetConfig.types`)
- `node_modules/@semantic-release/release-notes-generator/lib/load-changelog-config.js`
- Found while attempting the upgrade on 2026-10-06
