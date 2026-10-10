/**
 * semantic-release configuration.
 *
 * Two separate artifacts, two separate rules (Linux-kernel style):
 *
 * - `CHANGELOG.md` is hand-curated, user-facing, and maintained per stable
 *   release starting at 1.0.0. No plugin writes to it — a release PR adds its
 *   highlights by hand, verified against the diff. The pre-1.0 history was
 *   removed with the 1.x cleanup.
 * - GitHub Releases get short generated notes from the whitelist below, so
 *   they stay readable without curation. The default `angular` preset has no
 *   type filter at all, which is how CI plumbing and fixup commits once ended
 *   up in front of users.
 *
 * Prereleases exist for exactly one reason — to give dev.cachy.app a version
 * string that differs from cachy.app. (Both sites once showed the same number
 * because develop's tags were unreachable from main; the `-beta.N` suffix is
 * what keeps them distinguishable.) That job only requires the version to land
 * in package.json and the commit to be tagged.
 *
 * What it does NOT require is a GitHub Release per prerelease. At the observed
 * rate — hundreds of prereleases per stable release — those artifacts bury the
 * handful of real releases they are supposed to advertise. So the github plugin
 * runs on `main` only; the prerelease branch still gets its version and its tag,
 * and the back-merge from main brings the stable state back over.
 *
 * ## Why `develop` carries `enforce_admins: false`
 *
 * This was the deciding fact for the branch layout, so it is worth stating
 * plainly rather than rediscovering.
 *
 * `develop` had `enforce_admins: true` plus ten required status checks, which
 * means semantic-release's push authenticated and was then refused with
 * `GH006` (BUG-0584). The repair at the time was a `release/beta` mirror plus
 * a pull request per release to carry the version bump back — fifteen such
 * pull requests, each one needing a human merge, and each one able to break
 * the pipeline by being squash-merged instead of merged.
 *
 * So `enforce_admins` is off, and the prerelease runs on `develop` directly,
 * where it was before. **What that costs:** the repo owner, and any token
 * acting as the owner, can push to `develop` without the ten required checks
 * having run. There is no required PR review and no push restriction on the
 * branch, so `enforce_admins` was the only thing standing between a direct
 * push and those checks. That was the trade BUG-0584's fix chose and this
 * change reverses.
 *
 * What it does *not* cost: a pull request into `develop` still runs all ten
 * checks, and they are still required to merge. Only a direct admin push can
 * skip them, and the only automation that pushes directly is semantic-release,
 * which only ever adds `package.json` and `package-lock.json`.
 *
 * Branch detection uses GITHUB_REF_NAME, which Actions sets to the pushed branch
 * name. Outside CI the value is absent and we fall back to the full stable plugin
 * set, so a local `npx semantic-release --dry-run` reports what main would do
 * rather than silently omitting steps.
 *
 * One caveat to that: release-guard.js runs from `verifyRelease`, whose definition
 * carries `dryRun: true`, so `--dry-run` checks the version for real instead of
 * skipping it (prepare and publish have `dryRun: false` and would be skipped).
 * A dry-run therefore needs the tags in the checkout — `git clone` brings them,
 * a tag-less or shallow one does not, and the guard refuses rather than reporting
 * a version it cannot prove is new. In CI the release job checks out with
 * `fetch-depth: 0`, which is why this has never bitten there.
 */

const isStableBranch = (process.env.GITHUB_REF_NAME ?? "main") === "main";

// Note: these are plain string literals, not template literals — the `${...}`
// placeholders are interpolated by semantic-release, not by JavaScript.
//
// No `[skip ci]` marker here, deliberately. The release commit travels to
// `develop` inside a pull request, and GitHub reads `[skip ci]` on a pull
// request's head commit as "do not run CI for this pull request" — which leaves
// the required status checks unreported and therefore unsatisfiable, so the
// merge waits forever on a check that was never started. The Release workflow's
// own `if:` guard skips the re-triggering run instead; see release.yml.
const gitCommitMessage =
  "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}";

/**
 * Conventional scopes that never describe a user-visible change. A `feat` or
 * `fix` carrying one of these scopes (e.g. `fix(ci): …`) is hidden from the
 * generated GitHub Release notes.
 */
const internalScopes = [
  "ci",
  "chore",
  "eslint",
  "commitlint",
  "cd",
  "deps",
  "dev",
  "test",
  "tests",
  "e2e",
  "backlog",
  "release",
];

/**
 * Only `feat` and `fix` with a user-facing scope reach the generated notes.
 * Scoped `hidden` entries must come first — the preset keeps the first
 * matching type/scope pair.
 *
 * This only shapes the notes. Versioning still comes from
 * `@semantic-release/commit-analyzer`, independently of this table.
 */
const releaseNotesGeneratorPlugin = [
  "@semantic-release/release-notes-generator",
  {
    preset: "conventionalcommits",
    presetConfig: {
      types: [
        ...internalScopes.flatMap((scope) => [
          { type: "feat", scope, effect: "hidden" },
          { type: "fix", scope, effect: "hidden" },
        ]),
        { type: "feat", section: "Features" },
        { type: "fix", section: "Bug Fixes" },
        { type: "perf", section: "Performance Improvements", effect: "hidden" },
        { type: "revert", section: "Reverts", effect: "hidden" },
        { type: "docs", section: "Documentation", effect: "hidden" },
        { type: "style", section: "Styles", effect: "hidden" },
        { type: "chore", section: "Miscellaneous Chores", effect: "hidden" },
        { type: "refactor", section: "Code Refactoring", effect: "hidden" },
        { type: "test", section: "Tests", effect: "hidden" },
        { type: "build", section: "Build System", effect: "hidden" },
        { type: "ci", section: "Continuous Integration", effect: "hidden" },
      ],
    },
  },
];

export default {
  branches: [
    "main",
    {
      name: "develop",
      prerelease: "beta",
      // The channel line predates the branch rename and is still load-bearing.
      // Every `1.6.0-beta.*` tag carries `{"channels":["develop"]}` in a git
      // note, so a branch configured `channel: "develop"` matches them; without
      // the line semantic-release falls back to the newest tag matching `[null]`
      // — v1.5.0 — and restarts the counter. The observed symptom was a release
      // of 1.6.0-beta.1 against a 1.6.0-beta.364 develop, twice.
      //
      // How a tag is bound to a channel (semantic-release v25):
      //
      //   index.js:209   addNote({channels: [nextRelease.channel]}, gitTag)
      //   git.js:252     pushes refs/notes/semantic-release-<tag>
      //   get-tags.js:29 channels = map.has(tag) ? map.get(tag).channels : [null]
      //
      // Note the ref is PER TAG. `git notes --ref=refs/notes/semantic-release`
      // is always empty and looks like "the tags carry no channel", which is
      // how this was misdiagnosed once. Read one instead:
      //
      //   git notes --ref=refs/notes/semantic-release-v1.6.0-beta.364 show v1.6.0-beta.364
      //
      // release-guard.js refuses the run if the computed version is ever not
      // above the highest tag again, so a silent reset cannot ship again.
      channel: "develop",
    },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    releaseNotesGeneratorPlugin,
    // Hook position, not array position, is what matters: this one runs from
    // verifyRelease, which is before prepare, the release commit and the tag
    // push. See the phase table in release-guard.js before moving it.
    "./release-guard.js",
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "package-lock.json"],
        message: gitCommitMessage,
      },
    ],
    ...(isStableBranch ? ["@semantic-release/github"] : []),
  ],
};