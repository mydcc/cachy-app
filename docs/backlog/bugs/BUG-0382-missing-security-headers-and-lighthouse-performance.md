---
id: BUG-0382
title: Security headers delivery on Express static assets and Lighthouse performance optimization
type: bug
status: done
priority: P2
milestone: none
editions: [community, pro, private]
area: security
data_class: A
adr: none
depends_on: []
size: S
estimate: 1
assignee: Jules
---

# BUG-0382 — Security headers delivery on Express static assets and Lighthouse performance optimization

## Symptom

Daily production monitor for cachy.app identified 6 findings:
- Missing Security Headers: Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- Lighthouse performance score under threshold 70

## Fix

1. Apply security headers inside `express.static` `setHeaders` hook in `server.js`.
2. Remove render-blocking 855KB font preload tag in `src/app.html`.

## Acceptance criteria

- [x] Security headers applied to Express static responses
- [x] Preload tag removed from app.html
- [x] Tests pass
