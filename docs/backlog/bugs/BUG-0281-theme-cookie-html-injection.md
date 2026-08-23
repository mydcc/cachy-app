---
id: BUG-0281
title: Raw cachy_theme cookie value is interpolated into served HTML and allows markup injection
type: bug
status: specced
priority: P1
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
size: S
estimate: 2
---

# BUG-0281 — Raw cachy_theme cookie value is interpolated into served HTML and allows markup injection

## Symptom

The value of the `cachy_theme` cookie is inserted unsanitized into the
`<body>` tag of every served page. Cookies are domain-scoped, not
origin-scoped: any sibling subdomain of cachy.app (static host, chat host, or
any future compromised/open subdomain) can plant
`cachy_theme=x"><img src=x onerror=…>; Domain=.cachy.app`, injecting attacker
markup into every page load for visitors carrying that cookie. Quote-breakout
plus JavaScript replacement-pattern expansion (`$&`, `$'`) in
`String.prototype.replace` give full attribute/HTML control, and the current
CSP permits inline scripts (see BUG-0270), so handlers execute.

## Evidence

**Derived** from code reading during the 2026-08-23 identity audit. The
cross-subdomain delivery precondition was **not** empirically verified
against the live deployment — exploitability depends on whether any sibling
origin can actually set `Domain=.cachy.app` cookies. A controlled-subdomain
test is recommended before and after the fix.

- `src/hooks.server.ts` (~L100–113): the `themeHandler` reads the raw cookie
  value and interpolates it inside `transformPageChunk` via
  `` html.replace(/<body(.*?)>/, `<body class="theme-${bodyClass}"$1>`) ``
  with no allowlist check.
- `src/stores/ui.svelte.ts` (~L337): the cookie is written client-side
  without `Secure` and without a `__Host-` prefix.

## Cause

Legacy server-side theme application. With `ssr = false` the SPA applies the
theme client-side anyway, making this sink pure residual risk.

## Fix

Pick one (simplest first):

1. Remove the server-side injection entirely — the client applies themes;
   the sink disappears.
2. If server-side theming must stay: validate the cookie value against the
   known theme allowlist before interpolation, and write the cookie as
   `__Host-cachy_theme` with `Secure; Path=/`.

## Acceptance criteria

- [ ] A failing-first test renders a request with a crafted
      `cachy_theme` value (quote breakout + `$&` payload) and asserts the
      served HTML changes nothing outside the allowlisted class token
- [ ] Either the interpolation sink is gone or the cookie is validated and
      rewritten with hardened attributes (`__Host-`/`Secure`)
- [ ] Theme switching still works in the browser (manual smoke or existing
      component test)
- [ ] `npm run check` and the affected tests pass

## Links

- `src/hooks.server.ts`
- `src/stores/ui.svelte.ts`
- [BUG-0270](BUG-0270-csp-script-src-allows-inline-and-eval-scripts.md) —
  CSP currently provides no backstop for injected handlers
