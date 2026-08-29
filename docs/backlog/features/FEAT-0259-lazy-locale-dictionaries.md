---
id: FEAT-0259
title: Load locale dictionaries on demand instead of eagerly at startup
type: feature
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: i18n
data_class: none
adr: none
depends_on: []
---

# FEAT-0259 — Load locale dictionaries on demand instead of eagerly at startup

## Problem

`src/locales/i18n.ts` (~L22–23) statically imports both locale dictionaries
although a session uses exactly one:

- `de.json` — 151,357 B (measured)
- `en.json` — 143,002 B (measured)

Module scope additionally builds three dictionaries via `structuredClone`
(`enDict`, `deDict`, `deTechDict`) — est. ~450 KB retained before first
render. `register(locale, loader)` already accepts loaders; it is just fed
pre-built dicts.

Evidence basis: measured file sizes + static module-scope reading (Architect
review, 2026-08-23). Startup-path claim derived from the import graph, not
runtime-profiled.

## Proposal

Switch registration to async loaders, e.g.
`register("de", () => import("./locales/de.json"))`. Build `deTechDict`
lazily only when `forceEnglishTechnicalTerms` is active. Register the fallback
locale first so `init({ initialLocale })` can handle the load window. Keep the
`schema.d.ts` key typing.

## Acceptance criteria

- [ ] Only the active locale's dictionary is fetched at startup (build-manifest /
      network evidence).
- [ ] While a dictionary loads asynchronously, the fallback locale renders —
      no raw `$key` identifiers visible.
- [ ] Switching language at runtime lazy-loads the other locale and re-renders
      translated strings correctly.
- [ ] `deTechDict` is built only when the technical-terms setting requires it.
- [ ] Key type safety preserved (`schema.d.ts`).
- [ ] `npm run check` and i18n-related tests pass; DE/EN parity checks stay green.

## Out of scope

- Translation content changes or new locales.
- Changes to `intl-messageformat` beyond whatever lazy loading requires
  (mind `optimizeDeps.include` interplay).

## Open questions

- Dev-server/SSR interplay of the async initial-locale window — verify during
  implementation; if it blocks, document the chosen fallback order here.

## Links

- `src/locales/i18n.ts`, `src/locales/locales/de.json`, `src/locales/locales/en.json`
- Source: Autonomous Optimization Architect review, 2026-08-23.

## State

- Shipped in [PR #2402](https://github.com/mydcc/cachy-app/pull/2402): lazy cached loaders, only the active locale loads at startup; de-tech built on demand; seq-guarded locale switches.
