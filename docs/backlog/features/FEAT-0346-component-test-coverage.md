---
id: FEAT-0346
title: "Increase component test coverage"
type: feature
status: done
priority: P3
milestone: none
editions: [community, pro, private]
area: ui
data_class: none
adr: none
depends_on: []
parent: FEAT-0341
assignee: opencode
branch: feat/feat-0346-component-tests
---

## Problem
A codebase analysis reveals that out of ~135 `.svelte` components, only 19 have a corresponding `*.component.test.ts` file. This indicates a significant gap in UI/Component test coverage, violating the goal of robust testing before completion.

## Fix
Establish a testing initiative to backfill component tests for the most critical UI elements (e.g., Modals, Trade Settings, and Core Background Engines).

## Acceptance criteria
- [x] Core trading inputs and panels are covered by `*.component.test.ts` files.
- [x] All new tests run successfully in the `components` Vitest project.

## Out of scope
- 100% test coverage for every single component.
- E2E Playwright tests.
