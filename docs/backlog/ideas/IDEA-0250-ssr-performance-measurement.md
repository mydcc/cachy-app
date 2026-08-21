---
id: IDEA-0250
title: Measure Server-Side Rendering (SSR) performance impact versus Client-Side Rendering (CSR)
type: idea
status: idea
priority: P2
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
---

# IDEA-0250 — Measure Server-Side Rendering (SSR) performance impact versus Client-Side Rendering (CSR)

## Problem

The daily Production Monitor flagged the Lighthouse Performance Score (28) as being below the threshold of 70, alongside missing security headers on static pages. We activated SSR (Server-Side Rendering) to address this, as it allows SvelteKit to properly inject the headers and immediately serve rendered HTML (improving metrics like LCP and FCP). However, SSR increases CPU and memory load on our backend servers. We need to measure the actual performance impact of keeping SSR enabled before deciding if it should remain permanent.

## Proposal

Measure the real-world server performance and memory footprint with SSR enabled compared to CSR.

- Configure tools to run performance checks (Lighthouse, load tests).
- Measure server CPU usage, memory utilization, and TTFB (Time to First Byte) under load.
- Compare these metrics against a baseline where the app runs strictly as a CSR (Client-Side Rendering) SPA.

## Acceptance criteria

- [ ] Measure Lighthouse performance metrics with and without SSR.
- [ ] Record baseline CPU and memory server utilization with CSR.
- [ ] Record CPU and memory server utilization with SSR enabled under simulated load.
- [ ] Determine if the performance benefits (Lighthouse score, SEO, security headers via hooks) outweigh the infrastructure cost of SSR.
- [ ] Finalize the decision whether `export const ssr = true;` or `export const ssr = false;` is the correct path for production, and apply the corresponding change if SSR is rolled back.

## Out of scope

Refactoring the caching layer or Edge deployments for SSR is out of scope for this measurement issue.

## Open questions

Will Node's built-in `compression` middleware be sufficient if SSR is disabled, given we need `hooks.server.ts` to apply security headers?
