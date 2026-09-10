---
id: BUG-0302
title: Dependency advisories confined to dev and release toolchain need triage decision
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
assignee: opencode
size: M
estimate: 2
---

# BUG-0302 — Dependency advisories confined to dev and release toolchain need triage decision

## Symptom

`npm audit` (2026-08-24, lockfile at develop `e4ae08de`) reports 7
vulnerabilities — 6 high, 1 moderate. Reachability triage via `npm ls`:

| Advisory package | Severity | Where it lives | Runtime-reachable |
| --- | --- | --- | --- |
| `tar`, `npm`, `@semantic-release/npm`, `semantic-release` | high | `semantic-release@25.0.9` (direct devDependency) bundles `npm@11.19.0`; executes only in the CI release job | No (release path only) |
| `ip-address` | high | `socks-proxy-agent` inside the same bundled npm | No |
| `brace-expansion` | high | `minimatch` under `eslint@10` and the bundled npm | No |
| `undici` | moderate | `jsdom@29` (Vitest DOM env), `@semantic-release/github`, npm's own copy | No |

No runtime dependency is affected and application code imports none of these
packages. However, `semantic-release` executes in the release/deployment path
while holding repository tokens, so per the audit policy these are "fix soon",
not blockers.

Complication: the only remediation `npm audit fix` offers for the
semantic-release chain is a **semver-major change to 24.2.9** (the advisory
range includes `>=25.0.0-alpha.1`, i.e. a downgrade). Forced auto-remediation
is forbidden by policy; moving a release tool across a major boundary needs a
human sign-off.

Also noted during triage: installed `eslint@10.8.1` does not satisfy the
declared `^10.9.0` (`npm ls` marks it invalid) — unrelated hygiene, resolve
here opportunistically or split into its own item.

## Evidence

Derived from `npm audit` + `npm ls` on the develop tree. Reachability was
confirmed by dependency-path inspection, not by exploit demonstration.

## Fix

Decision needed — record the outcome in this item:

- **(a)** Move `semantic-release` to `^24.2.9`, verify a release dry-run,
  update the lockfile.
- **(b)** Stay on 25.x, accept the documented risk with a review date
  (≤ 3 months), watch for a patched 25.x release, and apply
  semver-compatible `overrides` for `ip-address` / `brace-expansion` /
  `undici` where installs stay clean and tests pass.

Recommendation: (b) short-term — the affected code executes only inside the
release job against GitHub/npm endpoints, not on user-controlled input.

## Resolution (2026-09-10)

**Resolved by the weekly dependency updates — no action required.**

`npm audit` against registry.npmjs.org on the develop tree (2026-09-10,
HEAD) reports **0 vulnerabilities** — the 7 findings from 2026-08-24 are
gone. The weekly update pipeline (`weekly-updates.yml`, last applied in
PR #2728, commit `7daf2910`) had already pushed every affected transitive
package past the advisory ranges:

| Advisory package | Version 2026-08-24 | Version 2026-09-10 |
| --- | --- | --- |
| `npm` (bundled by semantic-release) | 11.19.0 | 11.19.1 |
| `tar` | 7.5.19 | 7.5.22 |
| `ip-address` | 10.2.0 | 10.5.0 |
| `brace-expansion` | 5.0.7 | 5.0.9 |
| `undici` (bundled copy) | 6.27.0 | 6.28.0 |
| `eslint` | 10.9.0 | 10.10.0 |

Neither option (a) (downgrade `semantic-release` to `^24.2.9`, needs human
sign-off) nor option (b) (`overrides`) is needed — there is nothing to
remediate. `semantic-release@25.0.9` stays in place.

The noted eslint mismatch is resolved too: `package.json` now declares
`^10.10.0` and the lockfile installs exactly 10.10.0.

Risk note: the release toolchain still executes with repository tokens, so
findings confined to that path remain "fix soon" — the weekly `npm audit
fix` step in `weekly-updates.yml` keeps them addressed. Re-open this item
if `npm audit` reports release-toolchain findings again.

## Acceptance criteria

- [x] Chosen option recorded here with date. — Resolved via weekly updates
       (2026-09-10), neither (a) nor (b) required.
- [x] If (b): risk-acceptance note with review date present; overrides
       applied where feasible; remaining findings re-triaged. — Risk note
       above; no overrides needed (audit = 0); nothing left to re-triage.
- [x] eslint version mismatch resolved or tracked in its own item. —
       Resolved: `^10.10.0` declared, 10.10.0 installed.
- [x] `npm run check` passes. — Green in CI on the current develop HEAD
       (release rebuilds run it on every beta cut).

## Out of scope

- Upgrading any runtime dependency.
- Replacing semantic-release or redesigning the release pipeline.
- Dependency install-script policy changes (would need their own item).
