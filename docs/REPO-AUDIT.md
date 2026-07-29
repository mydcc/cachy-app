# Repository Audit — July 2026

A baseline audit taken as the project moved from two months of rapid prototyping
to a documented, versioned workflow. It records what was verified, what was
fixed, and what is still open, so the follow-up work does not have to
re-establish the same facts.

Everything below was verified against the code, not inferred from the existing
documentation — which turned out to be the point.

---

## 1. Versioning was broken end to end

This was not cosmetic. The failure chain:

1. `package.json` had **no `version` field**.
2. `vite.config.ts` injected `process.env.npm_package_version` into
   `VITE_APP_VERSION`. With no version field that variable is `undefined`, and
   `JSON.stringify(undefined)` is `undefined` — not a string.
3. The app footer (`src/routes/+page.svelte`) therefore rendered the literal
   text **`undefined`** to users, while
   `src/components/settings/SettingsContent.svelte` silently fell back to
   `0.0.0`.
4. The repository had **zero Git tags**.
5. **semantic-release was never installed or configured**, although both
   `README.md` and `CLAUDE.md` stated that versioning was automated via
   Conventional Commits.
6. The version was instead hardcoded in five drifting places: the README badge,
   `src/routes/api/health/+server.ts`, and the `whitepaper.*.md` /
   `changelog.*.md` content files.
7. The commit history does not follow Conventional Commits (`add`, `add a line`,
   `timeout-fix`, `change folder name`), so semantic-release would have derived
   no releases even if it had been installed.

### Fixed

- `package.json` now declares `name`, `version` (`0.94.3`), `license`,
  `description` and `repository`.
- `vite.config.ts` reads the version out of `package.json` directly, so it no
  longer depends on being launched through an npm script.
- `src/lib/version.ts` is the single accessor (`APP_VERSION`). The health
  endpoint, the footer, the settings panel and the tracking payload all read
  from it. No version string is hardcoded anywhere else.
- `src/lib/version.test.ts` is a regression guard: it fails if `package.json`
  loses its version field, if the version is not valid semver, or if
  `APP_VERSION` drifts from `package.json`.
- semantic-release, commitlint and the previously missing ESLint packages are
  installed. `.releaserc.json` and `commitlint.config.js` configure them.
- `.github/workflows/release.yml` releases from `develop`;
  `.github/workflows/commit-lint.yml` rejects non-conforming commits in pull
  requests.

### Still required — one manual step

semantic-release derives the next version from the **most recent Git tag**. The
repository has none, and with no tag present semantic-release publishes its
default first release of `1.0.0` instead of continuing from `0.94.3`.

**The anchor is now unambiguous, but the tag still has to be pushed by hand.**
Once `main` was found to exist (see section 5), the right target became clear:
the tag belongs on the stable line, not on `develop`. It should point at
`main` / `d324c32` — the commit currently deployed to cachy.app — so the stable
channel starts from a real released state rather than from work in progress:

```bash
git fetch origin main
git tag -a v0.94.3 origin/main -m "Baseline release before automated versioning"
git push origin v0.94.3
```

This could not be completed from the development environment: its Git proxy
rejects tag pushes (`send-pack: unexpected disconnect`, reproduced across four
retries with exponential backoff), and the available GitHub tooling can create
branches but not tags or releases. Verified with `list_tags` that the repository
still has none.

With `develop` configured as a `beta` prerelease channel, the next release from
`develop` will be a `0.94.4-beta.N` prerelease (the commits on this branch are
`fix:`, `ci:`, `build:`, `docs:` and `chore:`; the first `feat:` will move the
minor to `0.95.0-beta.N`). Stable `0.94.4` follows when `develop` merges to
`main`.

---

## 2. Documentation contradicted the code

| Claim | Location | Reality |
| --- | --- | --- |
| `npm run lint` | `README.md` (setup + contributing) | The script did not exist, and none of the ESLint packages imported by `eslint.config.js` were installed. Any contributor following the README hit an immediate error. |
| `src/instructions/guide.en.md`, `src/instructions/changelog.en.md` | `README.md` documentation section | `src/instructions/` does not exist. The real path is `src/lib/assets/content/`. |
| "Node.js (v18+)" | `README.md` prerequisites | `engines` requires `>=20.0.0`; `.node-version` pins `20.18.3`. |
| Automated versioning via Conventional Commits | `README.md`, `CLAUDE.md` | Nothing was installed. See section 1. |
| Version `0.94.3` | README badge | Hardcoded and drifting. Now a live GitHub release badge. |

Additional defects in `README.md`, all fixed: the intro paragraph appeared
twice in two different wordings; the "Advanced Features" list was duplicated in
full in German and English; the side-panel feature was described by two
contradictory bullets; the changelog table of contents omitted 0.94.3 while the
body included it; the DeepWiki badge appeared twice.

The ~80-line hand-written changelog was moved out of the README into
`docs/CHANGELOG-legacy.md`. `CHANGELOG.md` is now generated by semantic-release.

---

## 3. Open contradiction: Local-First vs. the server chat store

`CLAUDE.md` states that all user data lives exclusively in `localStorage` and
that server persistence must not be introduced. The README and whitepaper repeat
this ("no cloud/server persistence"), and the legacy changelog claims 0.94.3
**removed** Global Chat.

The code says otherwise:

- `src/lib/server/chatStore.ts` writes chat messages to disk at
  `db/chat_messages.json` (path overridable via `CHAT_DB_PATH`), retaining up to
  1000 messages. That is server persistence, not an ephemeral cache.
- Global Chat is still present in the UI layer:
  `src/components/shared/SidePanel.svelte`,
  `src/lib/windows/implementations/ChatWindow.svelte.ts`,
  `AssistantView.svelte`, `ChatTestView.svelte`, plus the
  `sidePanel.globalChat` i18n key.
- However, `chatStore` is imported **only by its own test file** — no route or
  component wires it up.

Further investigation found a **second, current** chat backend that the first
pass missed: `src/services/cloudService.ts` connects to **SpacetimeDB** and is
wired to `src/components/settings/tabs/CloudTab.svelte`. The server module is
`server/spacetimedb/src/index.ts` with a single `send_message` reducer, and 10
generated binding files live in `src/lib/spacetimedb/`.

Decisively, the SpacetimeDB table `GlobalMessage` contains exactly three fields —
`sender`, `text`, `sentAt`. No journal entry, setting, preset, note or API key
appears in the schema or in any reducer, `connect()` refuses to run without an
explicit token, and the only entry point is a settings tab the user must open.

So the guarantee that actually matters — trading data and credentials never leave
the device — **held in the code all along**. Only the documentation was wrong, and
wrong in both directions at once: too absolute about the architecture, and
incorrect about Global Chat having been removed.

**Resolved.** Global Chat is kept as an optional, opt-in server feature.
`docs/adr/0001-local-first-boundary.md` defines Local-First as a data class
boundary rather than an absolute, and `CLAUDE.md`, the README and both
whitepapers now state that boundary. The whitepaper's previous blanket
GDPR/CCPA claim ("we do not process user data") was removed: chat messages are
personal data processed on a server, which implies a retention and deletion
policy that does not yet exist (roadmap item 15).

The orphaned file-based `chatStore.ts` remains untouched and is roadmap item 12 —
it has no authentication and would violate the boundary's second condition.

---

## 4. ESLint had never been run

Once the missing packages were installed, ESLint reported **3319 problems**.
Analysis showed most were configuration faults rather than code defects:

| Cause | Count | Resolution |
| --- | --- | --- |
| Vendored / generated bundles being linted (`static/ammo/ammo.wasm.js` — Emscripten output; `static/js/newrelic.js` — minified agent, one 62 095-character line) | ~1360 | Added to `ignores`. |
| `no-undef` on TypeScript files, which cannot see ambient type names like `EventListener` or `NodeJS`, nor Svelte 5 runes | 498 | Disabled for TS per typescript-eslint guidance; runes declared as globals. `npm run check` is the real gate and passes with 0 errors. |
| `no-redeclare` on the const-object-as-enum pattern in `src/types/orderTypes.ts`, where `export const OrderSide` and `export type OrderSide` legitimately occupy separate declaration spaces | 3 | Disabled; `tsc` is the authority. |

That leaves **112 errors and 1374 warnings** across 334 files of genuine
project code. `@typescript-eslint/no-explicit-any` (983) and
`no-unused-vars` (388) dominate and are set to `warn`, so the backlog stays
visible without blocking every pull request. Linting is intentionally **not** a
CI gate yet.

Notable items in the remaining errors:

- `preserve-caught-error` (10) — errors rethrown without a `cause` in
  `src/services/apiService.ts`, `tradeService.ts` and `src/utils/storageUtils.ts`,
  which loses the original failure when diagnosing exchange API problems.
- `no-loss-of-precision` (5) — all in `tests/benchmarks/safeJson.bench.ts`, which
  tests precision-losing literals deliberately. **No production money path is
  affected.**
- One parse error at `src/routes/+layout.svelte:369` is a
  `svelte-eslint-parser` limitation with a JSON-LD `<script>` inside `{@html}`.
  The code is valid and ships correctly; it was left untouched.

---

## 5. Repository hygiene

Fixed:

- `README_FIX_DOCUMENTATION.md` — an empty 0-byte file. Deleted.
- `playwright-report/index.html` was committed. Untracked; `playwright-report/`,
  `blob-report/` and `.playwright/` added to `.gitignore` (`test-results/` was
  already ignored).

Left for a decision, deliberately not touched:

- **Two deployment guides:** `DEPLOY.md` (restart-after-build advice) and
  `DEPLOYMENT.md` (aaPanel install guide). They do not conflict but should be
  merged or clearly cross-referenced.
- **Four sources for brand/design:** `BRAND GUIDELINES.md`,
  `CORPORATE_DESIGN.md`, `SYSTEM_BRAND_GUIDELINES.md` and `brand_guidelines/`
  (17 JPGs). Needs one canonical source.
- **`chartpatterns.html` (224 KB) in the repository root** also exists as
  `info/chartpatterns.html` (272 KB). They are **not** identical — different
  content hashes — and neither is referenced anywhere in the source. Consolidate
  only after deciding which one is current.
- **`.deploy.conf` is committed** alongside `.deploy.conf.example`. It contains
  no secrets, only infrastructure paths and ports, but it is the example file
  filled in — normally environment-specific and left untracked.
- ~~**Branch mismatch:** no `main` branch exists on the remote.~~ **Incorrect —
  corrected.** `main` does exist, at `d324c32`, two commits behind `develop` and
  fully contained in it. The initial audit relied on `git branch -a`, which in
  this partial clone only listed the branches that had been fetched;
  `git ls-remote --heads origin main` shows it. `.deploy.conf` was right all
  along, and the stable/beta split it documents is real.

  **Resolved:** `.releaserc.json` now configures `main` for stable releases and
  `develop` as a `beta` prerelease channel, matching `.deploy.conf`
  (`BRANCH_STABLE=main` → cachy.app, `BRANCH_BETA=develop` → dev.cachy.app).
  `release.yml` triggers on both.
- **Ad-hoc scripts without structure:** `verification/`, `plans/`,
  `src/verify_settings_v2.py`, and roughly 20 mixed Python/JS helper scripts in
  `scripts/`. Worth grouping and documenting, or removing what is spent.

---

## 6. Verified state after these changes

| Check | Result |
| --- | --- |
| `npm run check` | 1924 files, **0 errors, 0 warnings** (identical to the pre-change baseline) |
| `npx vitest run src/lib/version.test.ts` | 4/4 passing — `APP_VERSION` resolves to `0.94.3` |
| `npx semantic-release --dry-run` | Config valid, all 15 plugin hooks load, correctly scoped to `develop` |
| `npm run lint` | 112 errors / 1374 warnings — pre-existing backlog, documented above |
