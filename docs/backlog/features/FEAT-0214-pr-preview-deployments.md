---
id: FEAT-0214
title: Automated PR preview deployments for visual and mobile testing
type: feature
status: specced
priority: P2
milestone: none
editions: [community, pro, private]
area: repo
data_class: none
adr: none
depends_on: []
---

# FEAT-0214 — Automated PR preview deployments for visual and mobile testing

## Problem

Currently, UI changes, mobile touch responsiveness, and design tweaks from Pull Requests can only be tested after merging into `develop` and waiting for deployment to the staging server (`dev.cachy.app`). If styling issues (e.g. touch targets, font sizes, margins) are discovered post-merge, they require opening follow-up PRs or new backlog items. Reviewing UI and mobile interactions directly on target devices *before* merging is difficult without running a local dev server.

## Proposal

Implement automated, ephemeral PR preview deployments (e.g. via Cloudflare Pages GitHub integration or a GitHub Actions workflow). When a Pull Request is opened or updated, a live preview environment is automatically built and deployed. A bot comment or GitHub Deployment status provides a direct URL (e.g. `https://pr-<number>-cachy.pages.dev`) so that maintainers can immediately test changes on desktop and mobile browsers prior to merging. Previews are automatically deleted when the PR is merged or closed.

## Acceptance criteria

- [ ] Opening or updating a Pull Request automatically triggers a build and deploy of a preview environment.
- [ ] A sticky PR comment or deployment check surfaces the live preview URL on GitHub.
- [ ] The preview build supports client-side features and WASM calculations without breaking the Local-First data class boundaries.
- [ ] Preview environments are automatically torn down when the PR is closed or merged.

## Out of scope

- Production server deployment logic (`deploy.sh` and `dev.cachy.app` / `cachy.app` pipelines remain unchanged).
- Database or persistent cloud storage synchronization for preview builds.

## Open questions

- Preferred provider: Cloudflare Pages (zero cost, unmetered previews, instant integration) vs. Vercel vs. self-hosted docker/subdomain runner.

## Links

- Deployment configuration: [`DEPLOYMENT.md`](../../../DEPLOYMENT.md)
- Backlog documentation: [`../README.md`](../README.md)
