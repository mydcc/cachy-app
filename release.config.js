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
 * ## Why the prerelease branch is not `develop`
 *
 * `develop` is protected with `enforce_admins: true` plus ten required status
 * checks, so semantic-release cannot push the release commit there at all: the
 * push authenticates and is then refused with `GH006` (BUG-0584). The
 * prerelease therefore runs on `release/beta`, a mirror of `develop` that no
 * protection touches, and the release commit reaches `develop` through a pull
 * request that satisfies the same checks as every other change. This mirrors
 * the split semantic-release documents for exactly this case.
 *
 * `sync-release-branch.yml` keeps `release/beta` pointed at `develop`. Both
 * branch names below are what semantic-release matches its CI-detected branch
 * against, so changing either name means changing the sync workflow too.
 *
 * Branch detection uses GITHUB_REF_NAME, which Actions sets to the pushed branch
 * name. Outside CI the value is absent and we fall back to the full stable plugin
 * set, so a local `npx semantic-release --dry-run` reports what main would do
 * rather than silently omitting steps.
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
      name: "release/beta",
      prerelease: "beta",
      // The beta tags predate this branch and were published while the
      // prerelease ran on `develop`, so they carry channel `develop`.
      // semantic-release selects a branch's previous release through the
      // channel, not through ancestry: a branch without this line finds none of
      // the 464 `1.6.0-beta.*` tags, falls back to the newest channel-less tag
      // (v1.5.0) and restarts the counter at 1 — the observed symptom was a
      // release of 1.6.0-beta.1 against a 1.6.0-beta.364 develop.
      // See `get-tags.js`: `channels = tagsNotesMap.get(tag).channels`.
      channel: "develop",
    },
  ],
  plugins: [
    "@semantic-release/commit-analyzer",
    releaseNotesGeneratorPlugin,
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