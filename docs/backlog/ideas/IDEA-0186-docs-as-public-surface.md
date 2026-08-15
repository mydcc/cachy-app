---
id: IDEA-0186
title: Audit every public-facing document as a first-contact surface
type: idea
status: idea
priority: P3
milestone: M5
editions: [community, pro, private]
area: docs
data_class: none
adr: none
depends_on: []
---

# IDEA-0186 — Audit every public-facing document as a first-contact surface

## The thought

Cachy is an open repository. The whitepaper, changelog, onboarding, guide,
README and the `docs/` tree are not internal notes — they are the first thing
a prospective user, contributor or evaluator reads, usually before running the
app. Today they were written for the maintainer and for agents, which is the
right default for `docs/backlog/`, but the outward-facing subset deserves a
deliberate pass before the Community edition ships (M5).

What the pass checks, per document:

- **Accuracy first.** Every claim matches the code, in the `REPO-AUDIT.md`
  discipline — an impressive sentence that is not true is worse than a plain
  one that is. This is what makes the documents trustworthy to exactly the
  readers who check.
- **No third-party platform names** ([`BUG-0185`](../bugs/BUG-0185-competitor-names-in-docs.md)
  is the known backlog of these).
- **Editions stay in the background.** ADR-0003's edition model is a build
  concern; user-facing documents describe what Cachy does, not which package
  tier a feature sits in. A single low-key mention is acceptable; a pricing
  matrix in a whitepaper is not.
- **Language parity.** German and English versions of onboarding, guide and
  whitepaper say the same things (`src/locales/`, `src/lib/assets/content/`).
- **First-impression quality.** Broken links, stale version numbers, dead
  screenshots.

Scope: whitepaper (de/en), changelog(s), onboarding flow texts, guide/academy
copy, root `README.md`, `docs/VISION.md`. Explicitly **not** a rewrite — an
audit with findings, each finding becoming its own small item.

## Why not now

M5 is when an audience arrives; before that the documents mostly change
anyway. Doing the audit twice is the only way to do it worse than late.

## Links

- [`BUG-0185`](../bugs/BUG-0185-competitor-names-in-docs.md)
- `docs/REPO-AUDIT.md` — the accuracy discipline this extends
- [`MILESTONES.md`](../../MILESTONES.md) — M5
