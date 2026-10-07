---
id: BUG-0638
title: server/sanitizer.test.ts tests a different module and stubs out the sanitizer it appears to cover
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: none
adr: none
depends_on: []
assignee: opencode
---

Branch: `fix/bug-0638-sanitizer-tests`

## Resolution

Shipped in the PR that closes this item. All four acceptance criteria are met.

**1. Client tests moved to `src/lib/utils/sanitizer.test.ts`** — 12 tests,
importing `./sanitizer`, so the location matches the subject. The DOMPurify
stub is gone entirely: the file runs under `@vitest-environment jsdom`, where a
global `window` exists and the real pre-instantiated DOMPurify export works
without the dual-shape factory problem the stub was working around. Only
`$app/env` is mocked, to drive the `browser` flag gating the SSR passthrough.

**The stub had been hiding a real behavioural difference.** It forced
`FORBID_ATTR: ['onclick', 'onmouseover', 'style', 'data-custom']` and short-
circuited on `if (dirty.includes('iframe')) { return '<div>Safe</div>'; }`.
Against real DOMPurify, `data-custom` **survives** — DOMPurify allows `data-*`
by default. The old test asserted `<p>Content</p>`, which was only ever true
because of the stub. The new test pins what the sanitizer actually does:
event handlers and `style` are stripped, inert `data-*` is kept. Tightening the
policy to forbid `data-*` would be a policy change, which this item puts out
of scope — so the test documents the real contract instead of the invented one.

**2. `src/lib/server/sanitizer.ts` is covered without mocking anything.**
`src/lib/server/sanitizer.test.ts` was deleted; its misleading body is gone and
`sanitizer.parsing.test.ts` was renamed to `sanitizer.test.ts` (via `git mv`,
so history follows). One file, correctly named, covering the module in its own
directory, running real DOMPurify on a real jsdom window. 9 tests.

**3. `sanitizeChatInput` removed.** It had no production caller — only the test
that covered it. Before deleting, both plausible callers were checked: the
global chat renders through `CloudTab.svelte` with **no `{@html}` sink**, so
messages are escaped by the framework and need no sanitizer; the RSS path uses
`sanitizeHtmlToText`. There is no intended caller waiting, so per this item's
own criterion ("has a caller or is removed") removal is the answer. If a chat
XSS sink ever appears, the fix belongs at that sink rather than in a dormant
export.

**4. No test file mocks away the module whose behaviour it asserts.** Verified
by mutation, not by inspection — see below.

### Mutation proof

A green test that cannot fail is worse than no test, so each side was mutated:

- `img` + `iframe` added to `ALLOWED_TAGS` → *drops tags that are not on the
  allowlist* goes red.
- `ALLOWED_ATTR` removed entirely → *keeps the allowed attributes on a link*,
  *strips event handlers and style…* and *strips the style attribute entirely*
  go red.

Both reverted; `git diff` on the sanitizer confirms the file is unmodified.

### Verification

- `src/lib/server/sanitizer.test.ts` + `src/lib/utils/sanitizer.test.ts`:
  21 tests green
- `src/lib` sweep: 77 files, 1369 tests green
- `npx tsc --noEmit`: no errors in the touched files
- `sanitizeChatInput` has zero remaining references in `src`
- `npm test` full suite — CI

# BUG-0638 — `server/sanitizer.test.ts` covers the wrong module, behind a stub

## Symptom

`src/lib/server/sanitizer.test.ts` reads like coverage for the server-side
sanitizer. It is not. It imports:

```ts
import { sanitizeHtml } from '../utils/sanitizer';
```

— the **client-side** sanitizer in `src/lib/utils/sanitizer.ts` — and replaces
DOMPurify with a hand-written stub:

```ts
sanitize: (dirty, config) => {
  const sanitizeConfig = { ...config };
  sanitizeConfig.FORBID_TAGS = ['iframe', 'img', 'script', 'style'];
  if (dirty.includes('iframe')) { return '<div>Safe</div>'; }
  …
}
```

Consequences, in order of how much they cost:

1. `src/lib/server/sanitizer.ts` has **no test at all**. No file in the repo
   imports it.
2. The production path `rss-fetch POST → sanitizeHtmlToText → DOMPurify(new
   JSDOM('').window).sanitize(…)` — which processes untrusted RSS
   descriptions — is unguarded.
3. The stub asserts its own behaviour, not the sanitizer's. A test that passes
   against a straw man looks like a security guard and is not one.
4. The file name invites exactly the wrong conclusion. During the review of PR
   #3903 (jsdom 30) I counted its 11 cases as sanitizer coverage and only found
   the real situation by reading the import.

`sanitizeChatInput` in the same module has **no callers anywhere** — it is a
dead export that reads as part of the security surface.

## Evidence

*Demonstrated* by inspection and by a coverage check:

- `grep -rln "server/sanitizer" src --include="*.test.ts"` → no matches
- the test file's own import points at `../utils/sanitizer`
- `grep -rn "sanitizeChatInput" src` → only its own definition

Not yet demonstrated: that any specific input is currently sanitized wrongly.
This item is about the absence of a guard, not about a known bypass.

## Cause

A test file that outlived the module it was written for, plus a mock added to
work around a dual-shape import problem (the comment in the file explains the
`vi.mock('dompurify')` accurately — it exists because the shipped types describe
the pre-instantiated browser export). The mock solved a typing problem and in
doing so removed the subject under test.

## Proposed fix

1. Move the client-sanitizer tests to `src/lib/utils/sanitizer.test.ts`, where
   the import matches the location. Pure relocation — no assertion changes.
2. Leave `src/lib/server/sanitizer.test.ts` covering the module it is named
   after. `src/lib/server/sanitizer.parsing.test.ts` (added in PR #3903) is a
   starting point and already runs the real DOMPurify on a real jsdom window.
3. Resolve `sanitizeChatInput`: either it is intended for a caller that does not
   exist yet, or it should go. Leaving an unused entry point on a security
   boundary invites someone to reach for it.
4. When the real module is covered, revisit whether the client sanitizer still
   needs the DOMPurify stub at all.

## Acceptance criteria

- [ ] Client-sanitizer tests live in `src/lib/utils/sanitizer.test.ts` and pass
- [ ] `src/lib/server/sanitizer.ts` has direct coverage without stubbing
      DOMPurify or jsdom
- [ ] `sanitizeChatInput` has a caller or is removed
- [ ] No test file mocks away the module whose behaviour it asserts

## Out of scope

Adding an allowlist-sanitizer policy change, or revisiting what the sanitizer
permits. This item is about having a guard at all.

## Links

- `src/lib/server/sanitizer.ts`, `src/lib/server/sanitizer.test.ts`,
  `src/lib/server/sanitizer.parsing.test.ts`, `src/lib/utils/sanitizer.ts`
- Found while reviewing PR #3903; see FEAT-0634
