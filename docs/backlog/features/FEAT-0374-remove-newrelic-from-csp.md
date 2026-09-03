---
id: FEAT-0374
title: Remove unused NewRelic endpoints from connect-src in both CSP definitions
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: C
adr: none
depends_on: []
size: S
estimate: 1
assignee: antigravity
branch: fix/security-audit-privacy-batch
---

# FEAT-0374 — Remove unused NewRelic endpoints in connect-src (both CSP definitions)

Found in the read-only security/privacy audit on 2026-09-02 (finding F-01).

## Current state

The Content-Security-Policy `connect-src` directive allows two NewRelic
Browser-Agent endpoints (`bam.nr-data.net`, `bam.eu01.nr-data.net`) in both
CSP definitions:

- `server-headers.js:25` (production Express server, single source of truth)
- `svelte.config.js:78-79` (dev CSP)

No NewRelic agent exists anywhere in the repo (src/, static/, scripts/,
server.js all searched) — no script is loaded, no beacon is sent by our code.

## Why this matters

A CSP entry is a security *statement*: it is the standing answer to "what may
this page talk to?". Carrying an unused third-party telemetry endpoint in it
means:

1. Anyone can later drop in the NewRelic snippet without a code change to the
   CSP — exactly the Class-A/telemetry exception the Local-First boundary
   (ADR-0001) forbids, and it would not even show up in the diff.
2. It reads as if the app does telemetry today, which contradicts
   docs/ARCHITECTURE.md and the ADR set.

## Fix

Remove both entries from both CSPs. Keep everything else byte-identical —
the Iframe & 3D Metaverse rules in CLAUDE.md must not be touched (no COEP,
Permissions-Policy stays as is).

## Acceptance criteria

- [ ] `connect-src` in `server-headers.js` and `svelte.config.js` no longer
      contains `nr-data.net` entries.
- [ ] Header tests updated: `server-headers.test.js`,
      `src/tests/security/headers.test.ts`, `src/csp.test.ts` assert the CSP
      string does NOT contain `nr-data.net` (guard against reintroduction).
- [ ] `npm run check` and affected tests pass.
- [ ] No other CSP directive changed.

## Open questions

- [uncertain] Is a NewRelic agent injected outside this repo (reverse proxy,
  CDN, deploy tooling)? If production actually beacons to `bam.nr-data.net`
  today, the correct fix is to also remove that agent — not to keep the CSP
  entry. Pat to confirm against the live deployment.

## Links

- [docs/adr/0001-local-first-boundary.md](../../adr/0001-local-first-boundary.md)
- Related audit findings: BUG-0372, BUG-0373, FEAT-0375, FEAT-0376, FEAT-0377
