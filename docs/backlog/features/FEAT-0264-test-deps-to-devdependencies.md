---
id: FEAT-0264
title: Move test-only dependencies out of dependencies into devDependencies
type: feature
status: ready
priority: P3
milestone: none
editions: [community, pro, private]
area: tooling
data_class: none
adr: none
depends_on: []
---

# FEAT-0264 — Move test-only dependencies out of dependencies into devDependencies

## Problem

`package.json` lists test-environment and tooling packages under
`dependencies` instead of `devDependencies`: `jsdom` (~11 MB disk),
`happy-dom` (~18 MB), plus `tsx`, `puppeteer`, `svelte-check`,
`@types/jsdom`. There is no client-bundle impact (Vite never imports them), but
production installs carry ~30 MB+ of unnecessary packages and extra CVE-audit
surface.

Also flagged for an explicit look: `opencode-omniroute-auth` as a *runtime*
dependency of a trading app is unusual — justify it or move it.

Evidence basis: dependency audit (Architect review, 2026-08-23).

## Proposal

Move the listed test-environment/tooling packages to `devDependencies`. Keep
`express`, `compression`, `undici`, `ws`, `rss-parser` where they are — they
serve `+server.ts` routes under adapter-node (`src/routes/api/rss-fetch/+server.ts`
uses `rss-parser` server-side only).

## Acceptance criteria

- [ ] Listed test tooling resolves from `devDependencies` in the installed tree.
- [ ] Fresh `npm ci && npm run build && npm test` pass locally; CI green.
- [ ] Server routes still resolve their server-side deps at runtime
      (rss-fetch route verified).
- [ ] The `opencode-omniroute-auth` decision (justified in place or moved) is
      recorded in this item.

## Out of scope

- Version bumps or upgrades (see FEAT-0222 pattern).
- Lockfile churn beyond what the move itself produces.

## Open questions

- Before moving `puppeteer`: confirm nothing in server runtime code reads it.

## Links

- `package.json`, `src/routes/api/rss-fetch/+server.ts`
- Source: Autonomous Optimization Architect review, 2026-08-23.
