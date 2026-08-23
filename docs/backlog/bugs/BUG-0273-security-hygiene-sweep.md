---
id: BUG-0273
title: Security hygiene sweep for three low-severity findings from the identity audit
type: bug
status: specced
priority: P3
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
estimate: 2
---

# BUG-0273 — Security hygiene sweep for three low-severity findings from the identity audit

## Symptom

Three small findings from the 2026-08-23 identity/security audit, each below
the threshold for its own item but worth clearing together:

1. **imgbb BYOK key in URL query string** — `src/services/imgbbService.ts`
   (~L38) appends `?key=…`; query strings land in third-party access logs.
2. **Dual auth paths** — legacy `checkAppAuth` coexists with
   `checkClientToken` in `src/lib/server/auth.ts`. Both fail closed and
   compare timing-safe, but two paths invite drift; confirm zero callers
   and remove the legacy one.
3. **Logger sanitizer gaps** — `src/lib/server/logger.ts` patterns miss
   short key names (`sign=` vs `/signature/i`). Not exploitable today
   (signatures travel in headers), cheap to extend.

## Evidence

**Derived** from static inspection during the 2026-08-23 identity audit;
none demonstrated at runtime. Item 1 is partially API-forced: verify imgbb
accepts the key via form field/header before changing the call shape — if
the API truly requires the query parameter, document that explicitly here
instead of forcing it.

## Fix

Per sub-item as described above; keep each change minimal.

## Acceptance criteria

- [ ] imgbb upload no longer places the key in the query string, or the
      item documents why the API shape forbids that
- [ ] `checkAppAuth` removed after a grep-proven zero-caller check, or kept
      with a comment naming its caller
- [ ] Logger sanitizer matches `sign=`, `secret`, `token`, `password`
      shapes (unit test)
- [ ] `npm run check` and the affected tests pass

## Out of scope

- The `{@html preset.icon}` sink — filed separately as BUG-0266
  (`BUG-0266-dashboardnav-html-preset-icon.md`, part of PR #2194).
- Anything else covered by the companion items from the 2026-08-23 audit
  batches (BUG-0266–BUG-0268, BUG-0282–BUG-0291, BUG-0270–BUG-0272, BUG-0280, BUG-0281).
