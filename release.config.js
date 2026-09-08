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
 * Prereleases on `develop` exist for exactly one reason — to give dev.cachy.app
 * a version string that differs from cachy.app. (Both sites once showed the same
 * number because develop's tags were unreachable from main; the `-beta.N` suffix
 * is what keeps them distinguishable.) That job only requires the version to land
 * in package.json and the commit to be tagged.
 *
 * What it does NOT require is a GitHub Release per prerelease. At the observed
 * rate — hundreds of prereleases per stable release — those artifacts bury the
 * handful of real releases they are supposed to advertise. So the github plugin
 * runs on `main` only; `develop` still gets its version and its tag, and the
 * back-merge from main brings the stable state back over.
 *
 * Branch detection uses GITHUB_REF_NAME, which Actions sets to the pushed branch
 * name. Outside CI the value is absent and we fall back to the full stable plugin
 * set, so a local `npx semantic-release --dry-run` reports what main would do
 * rather than silently omitting steps.
 */

const isStableBranch = (process.env.GITHUB_REF_NAME ?? "main") === "main";

// Note: these are plain string literals, not template literals — the `${...}`
// placeholders are interpolated by semantic-release, not by JavaScript.
const gitCommitMessage =
  "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}";

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
