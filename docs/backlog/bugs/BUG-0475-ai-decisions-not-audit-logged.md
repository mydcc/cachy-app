---
id: BUG-0475
title: AI-suggested setup mutations leave no audit record
type: bug
status: ready
priority: P2
milestone: M9
editions: [community, pro, private]
area: ai
data_class: A
adr: none
depends_on: []
---

# BUG-0475 — AI-suggested setup mutations leave no audit record

## Symptom

Order attempts are audit-logged (FEAT-0015), but the AI decisions that shaped them are not: which model suggested which values, what the prompt context contained, which actions were applied vs. rejected, and whether the user confirmed. After a bad fill there is no way to reconstruct whether the numbers came from the trader or the assistant.

## Evidence

**Derived.** `src/services/orderAuditService.ts` records order attempts with `checked[]` and refusals, but nothing in `src/stores/ai.svelte.ts` writes an audit entry: `executeAction` returns boolean and only `console.error`s in DEV on failure (`ai.svelte.ts:1200-1205`); the single existing AI log is the low-R:R `logger.warn` (`ai.svelte.ts:576`). Confirmed/rejected pending actions update a chat message (`updateActionMessage`), not a durable log.

## Cause

Audit coverage was built around the order transport; the AI setup path was added later and never attached to it.

## Fix

1. Append one local-only (Class A, never uploaded) audit entry per AI action batch: timestamp, provider + model, action list with values, applied/confirmed/rejected outcome, and the R:R verdict.
2. Reuse the redaction helpers (`src/utils/redact.ts`) and the storage pattern of `orderAuditService` (bounded, append-only).
3. Cap size the same way (count + bytes) so chatty models cannot exhaust `localStorage`.

## Acceptance criteria

- [ ] Every applied, confirmed and rejected AI action batch is reconstructible from local storage
- [ ] Entries contain no API keys or credentials (test with a key-like string in context)
- [ ] Log is bounded and evicts oldest-first; never leaves the device

## Out of scope

- Prompt-text full logging (values + model suffice; full prompts bloat the store)
- Cloud sync of the AI audit log (Class A stays local per ADR-0001)

## Open questions

- None.

## Links

- Audit: LLM Trading Agent Security (2026-09-14), finding 5 + checklist item 9
- Related: [`FEAT-0015`](../features/FEAT-0015-order-audit-trail.md)
