---
id: FEAT-0629
title: Migrate to SvelteKit 3 and adapter-node 6
type: feature
status: done
branch: chore/kit3-migration
priority: P2
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
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

## Review findings (fixed in this PR)

1. **HIGH — service worker cache-first was dead.** `$app/manifest` paths are
   relative to the base path (`_app/…`) while the fetch handler compares
   `url.pathname` (absolute), so `ASSETS.includes(...)` never matched. Fixed by
   `resolve(entry.path)`; guarded by `src/serviceWorkerPrecache.test.ts`.
2. **HIGH — `paths.origin` was never populated.** Vite does not merge `.env`
   into `process.env`, and the deploy shadow build never exports `ORIGIN`, so
   the canonical CSRF origin silently degraded to the `Host` header. Fixed
   with `loadEnv()`; `DEPLOYMENT.md` §7 and `.env.example` corrected.
3. **MEDIUM — vendor groups matched first-party code.** Bare regexes such as
   `/three/` pulled `src/lib/three/*` and `ThreeBackground.svelte` into
   `three-vendor`; all groups are now pinned to `node_modules/<pkg>/`.
4. **LOW — the service worker had no type checking.** Moved to
   `src/service-worker/index.ts` with its own tsconfig extending
   `$app/tsconfig/service-worker`, enforced by the new `npm run check:sw`
   (wired into `npm run check`).

## Open questions

- [x] What is the exact Kit 3 config shape? → `sveltekit({ preprocess,
  adapter, csp, paths })` in `vite.config.ts`; `svelte.config.js` deleted.
- [x] Breaking changes in load/actions? → none in use. Migrated instead:
  `$lib`→`#lib` (36 files + `imports` + test alias), `$app/environment`→`$app/env`,
  `$app/stores`→`$app/state`, `$service-worker`→`$app/env`+`$app/manifest`+`$app/paths`,
  `src/params/lang.ts`→`src/params.ts`, `Handle*`→`@sveltejs/kit/hooks`,
  `$env/dynamic/private` types via `src/env-legacy.d.ts` bridge.
- [x] Vendor chunking: `manualChunks` is dead under Kit 3 (Kit sets
  `output.codeSplitting`, rolldown ignores `manualChunks` then; top-level
  `manualChunks` also breaks the adapter-node 6 re-bundle and the SW build).
  Re-expressed as `codeSplitting.groups` under `environments.client`
  (requires the `rolldownOptions` key — `rollupOptions` is silently ignored
  per-environment).
- [ ] Full env migration (`src/env.ts` + `$app/env/*`, `.env.example`,
  `env_documentation.test.ts` audit) is a separate follow-up item.

## Links

- `svelte.config.js`, `vite.config.ts`
- SvelteKit 3 migration guide (official docs)
