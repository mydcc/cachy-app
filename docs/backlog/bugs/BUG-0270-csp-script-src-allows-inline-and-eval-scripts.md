---
id: BUG-0270
title: CSP script-src permits inline and eval'd scripts so the header stops no XSS
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
estimate: 3
---

# BUG-0270 — CSP script-src permits inline and eval'd scripts so the header stops no XSS

## Symptom

The production Content-Security-Policy allows `'unsafe-inline'` and
`'unsafe-eval'` in `script-src`. An inline-script allowance is precisely the
vector every realistic XSS uses, so the CSP offers approximately zero
mitigation for the injection-class bugs in this codebase (cf. BUG-0281) and
would not contain the next one either.

## Evidence

**Derived** from code inspection during the 2026-08-23 identity audit.

- `src/hooks.server.ts` (~L127) and `svelte.config.js` ship
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' …`.
- `'wasm-unsafe-eval'` is justified: the `technicals-wasm` module needs it.
- Additionally, `connect-src` includes dev origins
  (`http://127.0.0.1:3000`, `ws://localhost:3000`) that reach production
  headers.

## Cause

The policy was written permissively and never tightened once SvelteKit's
CSP support became usable for the app.

## Fix

- Move `'unsafe-inline'` out of `script-src`; use SvelteKit's CSP auto mode
  (nonces/hashes for its injected bootstrap scripts).
- Justify or remove plain `'unsafe-eval'` (keep `'wasm-unsafe-eval'`).
- Strip dev origins from the production `connect-src`.

## Out of scope

- Narrowing `frame-src https:`/`data:` — that is a documented product
  trade-off (Unity metaverse iframe, embedded news) governed by AGENTS.md.
  Enumerating actual embed hosts and dropping `data:` remains worthwhile
  but belongs to a separate decision, not this mechanical tightening.

## Acceptance criteria

- [ ] A test asserts the production CSP contains neither `'unsafe-inline'`
      nor bare `'unsafe-eval'` in `script-src` (fails before the fix)
- [ ] The app boots with nonce/hash-based CSP: no console CSP violations on
      first load, WASM technicals still initialize (existing technicals
      tests stay green)
- [ ] Production headers contain no localhost/127.0.0.1 origins
- [ ] `npm run check` and the affected tests pass

## Links

- `src/hooks.server.ts`
- `svelte.config.js`
- [BUG-0281](BUG-0281-theme-cookie-html-injection.md)
