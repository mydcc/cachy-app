---
id: BUG-0302
title: Dependency advisories confined to dev and release toolchain need triage decision
type: bug
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
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

## Acceptance criteria

- [ ] Chosen option recorded here with date.
- [ ] If (a): release dry-run verified, lockfile updated, `npm audit` re-run.
- [ ] If (b): risk-acceptance note with review date present; overrides applied
      where feasible; remaining findings re-triaged.
- [ ] eslint version mismatch resolved or tracked in its own item.
- [ ] `npm run check` passes.

## Out of scope

- Upgrading any runtime dependency.
- Replacing semantic-release or redesigning the release pipeline.
- Dependency install-script policy changes (would need their own item).
