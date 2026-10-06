---
id: FEAT-0634
title: Upgrade jsdom to 30 and keep it a production dependency
type: feature
status: done
priority: P3
assignee: opencode
milestone: none
editions: [community, pro, private]
area: deps
data_class: none
adr: none
depends_on: []
---

Branch: `chore/jsdom-30`

## Problem

`jsdom` is available at 30.1.2 (currently 29.1.1). The upgrade is not a test-tool
matter: jsdom is imported by production server code and is not listed in
`ssr.noExternal`, so where it sits in `package.json` decides whether the server
builds and whether it starts.

- `src/lib/server/sanitizer.ts` — `import { JSDOM } from 'jsdom'`
- `src/routes/api/external/article-content/+server.ts` — same import

## The trap

Installing with `npm install -D jsdom@^30.1.2` moves it to `devDependencies`,
which breaks two things at once:

1. **The production server cannot resolve it.** `deploy.sh` installs with
   `npm ci --omit=dev`, so jsdom is absent at runtime and both server modules
   fail to load. Same failure class as the 2026-10-06 deploy incident: green
   build, broken in operation.
2. **The build fails outright.** Vite then treats jsdom as a dependency to
   bundle rather than externalize, and its CommonJS lands inside the SSR chunk,
   which is ESM because `package.json` sets `"type": "module"`:

   ```
   error during build:
   ReferenceError [Error]: __dirname is not defined in ES module scope
       at .svelte-kit/output/server/chunks/api.js:135019:59
   ```

Neither CI check sees this. There is no build job in the check set, and the
`--omit=dev` install only happens on the deploy server.

## Evidence

*Demonstrated*, in the same branch and environment, changing only the version
and the dependency section:

| jsdom | section | `npm run build` | built server |
|---|---|---|---|
| 30.1.2 | `devDependencies` | fails, `__dirname is not defined` | not reached |
| 30.1.2 | `dependencies` | green | boots, `/api/health` 200 after 1 s, clean SIGTERM drain |
| 29.1.1 | `dependencies` | green | control for the above |

## Acceptance criteria

- [x] `jsdom` at `^30.1.2`, staying in `dependencies`
- [x] `npm run build` green
- [x] built server starts and answers `/api/health` (200)
- [x] `src/lib/server/sanitizer.test.ts` and
      `src/routes/api/external/article-content/article_content.test.ts` green
- [x] `DashboardNav.xss.component.test.ts` green (jsdom on the component side)
- [x] `npm test` green (CI: 21/21)

## Out of scope

The remaining minor bumps (`three`, `katex`, `negotiator`, `intl-messageformat`,
`conventional-changelog-conventionalcommits`, `lightweight-charts-indicators`)
each get their own item. `three` needs a visual acceptance that headless cannot
deliver.

## Open questions

- None. The section placement is not a matter of taste here: it is load-bearing,
  and the table above is the reason.
