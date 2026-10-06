---
id: FEAT-0629
title: Migrate to SvelteKit 3 and adapter-node 6
type: feature
status: in-progress
priority: P2
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
assignee: opencode
---

# FEAT-0629 — Migrate to SvelteKit 3 and adapter-node 6

Branch: `chore/kit3-migration`

## Problem

SvelteKit 3 (with adapter-node 6) is available, but the app still runs on
SvelteKit 2. A local upgrade probe showed `svelte-kit sync` fails under Kit 3
with `config_file_unsupported`: `svelte.config.js` is no longer used and the
configuration must move into the `sveltekit(...)` Vite plugin. Until this
migration happens, no other Kit-3-dependent major (adapter-node 6) can land.

## Proposal

Migrate the app config and code to SvelteKit 3 following the official
migration guide: move config into the Vite plugin, fix breaking API changes,
bump `@sveltejs/kit` to `^3.0.1` and `@sveltejs/adapter-node` to `^6.0.0`.

## Acceptance criteria

- [ ] `@sveltejs/kit` is at `^3.0.1` and `@sveltejs/adapter-node` at `^6.0.0`
      in package.json (lockfile updated)
- [ ] `svelte-kit sync` passes without `config_file_unsupported`
- [ ] CI passes (`npm run check`, `npm test`, `npm run build`)
- [ ] No regressions in routes, SSR/prerendering and the node adapter output

## Out of scope

Other pending majors (TypeScript 7, Vitest 5, three 0.186, katex 0.19,
intl-messageformat 12, negotiator 1.x, conventional-changelog 10). Each gets
its own item.

Deliberately not touched: COEP/CSP/Permissions-Policy posture for the 3D
Metaverse iframe (`space.cachy.app`) — migration must preserve it.

## Open questions

- What is the exact Kit 3 config shape for adapter-node options previously
  living in `svelte.config.js`?
- Are there breaking changes in load functions, form actions or remote
  functions affecting our routes?

## Links

- `svelte.config.js`, `vite.config.ts`
- SvelteKit 3 migration guide (official docs)
