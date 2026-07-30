# Roadmap

The project's first roadmap, written at the point where two months of rapid
prototyping turned into a maintained codebase. It is deliberately ordered by
what unblocks what, not by what is most interesting.

Items are grouped into **Now** (in progress or next), **Next** (agreed, not
started) and **Later** (wanted, not yet specified). Anything without a clear
definition of done belongs in Later.

Status legend: 🟢 done · 🟡 in progress · ⚪ not started

---

## Now

### Engineering foundation

| # | Item | Status |
| --- | --- | --- |
| 1 | Repair the version pipeline (single source, regression test) | 🟢 |
| 2 | semantic-release + commitlint | 🟢 |
| 3 | Install the missing ESLint stack, fix config false positives | 🟢 |
| 4 | Correct README, extract the legacy changelog, add the repo audit | 🟢 |
| 5 | ~~Baseline tag `v0.94.3`~~ — dropped: the first release is 1.0.0, so no anchor tag is needed | 🟢 |
| 6 | Two-branch model: `main` stable, `develop` as `beta` prerelease | 🟢 |
| 7 | ADR process + ADR-0001 defining the Local-First boundary | 🟢 |

Versioning restarts at **1.0.0**. With no tag in the repository,
semantic-release publishes `1.0.0` as its first release by default, so no
baseline tag is required and there is no manual step left. The hand-written
0.9x history stays in `docs/CHANGELOG-legacy.md`.

### Documentation truth pass

| # | Item | Status |
| --- | --- | --- |
| 8 | Align `CLAUDE.md`, README and both whitepapers with ADR-0001 | 🟢 |
| 9 | ~~Audit the rest of the whitepaper against the code~~ — done: all eight chapters checked, every reference resolved, chapter 3 maths now covered by an executable test | 🟢 |
| 10 | Merge `DEPLOY.md` and `DEPLOYMENT.md` into one guide | ⚪ |
| 11 | Consolidate the four brand/design sources into one canonical doc | ⚪ |
| 11a | Feed the in-app changelog from the generated `CHANGELOG.md` — the app renders `src/lib/assets/content/changelog.{de,en}.md`, which will no longer be updated by releases | ⚪ |

Item 9 is done. The published risk-engine example verified correct against the
real calculator, and the security chapter turned out to understate the
implementation. But chapter 2 had described a materially simpler application than
exists — no WASM engine, no WebGPU, no SpacetimeDB, no AI SDKs — and chapter 8
would have actively misled a new developer (a `npm run test:unit` script that
does not exist, a verification file that does not exist, the wrong port).
Full findings in `docs/REPO-AUDIT.md`, section 6.

---

## Next

### Global Chat as an optional Class B feature

Kept per ADR-0001, on SpacetimeDB. The integration already exists —
`server/spacetimedb/src/index.ts` with a `send_message` reducer, generated
bindings in `src/lib/spacetimedb/`, and a wired `CloudTab.svelte`. What is
missing is everything around it:

| # | Item |
| --- | --- |
| 12 | Decide the fate of the orphaned file-based `src/lib/server/chatStore.ts` — it has no authentication and violates Class B condition 2 |
| 13 | Document how a user obtains a connection token; today `connect()` requires one with no described path to get it |
| 14 | Replace the hardcoded `http://127.0.0.1:3000` / `cachy-server` defaults in `cloudService.ts` with configuration |
| 15 | Message retention and deletion policy — required by the GDPR consequence named in ADR-0001 |
| 16 | Make the off-by-default state and the four Class B conditions visible in the Cloud settings tab |
| 17 | Behaviour when the server is unreachable: core functions must stay fully usable |

### Code health

| # | Item | Status |
| --- | --- | --- |
| 18 | Fix the pre-existing test failures — **28 → 24 so far** (see `docs/REPO-AUDIT.md`) | 🟡 |
| 19 | ~~Attach `cause` to rethrown errors~~ — done: all 10 sites in `apiService.ts`, `tradeService.ts`, `news/+server.ts` and `storageUtils.ts` now chain the original failure | 🟢 |
| 20 | ~~Burn down the 112 ESLint errors, then make lint a required CI check~~ — done: 0 errors, lint is now a required check | 🟢 |
| 21 | Burn down the 1367 `no-explicit-any` / `no-unused-vars` warnings, lowering the CI ceiling as you go, then restore both rules to `error` | ⚪ |
| 22 | Resolve `.deploy.conf` being committed alongside its own `.example` | ⚪ |
| 23 | Deduplicate `chartpatterns.html` (root and `info/` copies differ — decide which is current) | ⚪ |
| 24 | Group and document the ~20 ad-hoc scripts in `scripts/`, `verification/`, `plans/` | ⚪ |
| 24a | **Remove the `VITE_*_API_KEY` defaults in `settings.svelte.ts`** — Vite inlines them into the client bundle, so setting them for a production build serves the operator's AI keys to every visitor. Documented as a trap in `.env.example`; the code path should go. | ⚪ |
| 24b | Audit remaining `env.*` reads against `.env.example` so no required variable is undocumented again | ⚪ |

Item 20 is done: lint is a required check at 0 errors, with a warning ratchet so
the backlog cannot grow. **Item 18 is in progress and still holds CI back** — 24
tests fail on `develop` independently of any change, so a green pull request does
not yet mean the suite is healthy.

Item 24a is the most serious open finding in this section. It is a build-time
trap rather than a live bug: the keys only leak if someone sets those variables
when building for production. But nothing currently stops them.

---

## Later

| # | Item |
| --- | --- |
| 25 | Broader SpacetimeDB use beyond chat — any such feature needs its own ADR and must satisfy the Class B conditions; Class A data stays local |
| 26 | Publish `/docs` to Confluence as a read-only mirror, repo stays the source of truth |
| 27 | Mirror this roadmap as Jira epics for tracking |
| 28 | Mobile native adaptation (claimed as "Phase 2" in the whitepaper — unverified against any actual plan) |
| 29 | Institutional features (whitepaper "Phase 3" — same caveat) |

Items 28 and 29 are listed because the whitepaper already promises them to
readers. They are recorded here as unspecified rather than silently dropped;
item 9 should determine whether they are real commitments.

---

## Explicitly not planned

- **Server persistence of Class A data** — journal, settings, API keys, presets
  and notes stay on the device. See ADR-0001.
- **Making any core function require a server.** The calculator, journal and risk
  management must work with the network down.
