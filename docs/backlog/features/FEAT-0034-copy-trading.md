---
id: FEAT-0034
title: Share a trade setup live, as price levels only
type: feature
status: specced
priority: P2
milestone: M7
editions: [pro, private]
area: collaboration
data_class: B
adr: ADR-0004
depends_on: [FEAT-0014]
---

# FEAT-0034 — Share a trade setup live, as price levels only

## Problem

Two traders working the same setup have no way to see each other's plan as it is
being formed. One fills in a form; the other reads it out loud over a call.

## Proposal

A deliberate, per-session broadcast: one user shares a setup, invited users see
it update live on their own device.

**The payload is fixed by [ADR-0004](../../adr/0004-spacetimedb-data-scope.md)
§3 and is the whole feature's constraint:**

| Shared | Never shared |
| --- | --- |
| symbol | position size / quantity |
| side | margin, leverage |
| entry price | risk amount, risk percentage |
| stop-loss price | account balance |
| take-profit prices | anything the above can be derived from |
| optional free-text note | |

**Why quantity is excluded, since this is the part that looks like an
oversight.** Position size together with entry and stop reveals the sharer's
risk amount (size × stop distance), and risk amount with a known risk percentage
reveals their **account balance**. Nobody proposing this feature intended to
publish their balance, and most users would not work out that they had.

The receiving client sizes the trade with its own risk settings, locally. That
is not only the admissible design, it is the correct one — a size that is right
for the sharer's account is wrong for everyone else's, so a copied size is a bug
in every copy-trading product that ships it.

**This is a Class A → Class B move** and requires a `BREAKING CHANGE:` footer
per ADR-0001, plus the changelog entry.

## Acceptance criteria

- [ ] A payload-shape test asserts the exact permitted key set and fails if any
      field is added — the same guard `chat.test.ts` applies to chat messages
- [ ] Nothing size-, balance- or leverage-derived reaches the server, asserted
      against the wire payload rather than the UI
- [ ] Sharing is per-session, explicit to start, and off by default; it does not
      resume after reload without a new deliberate action
- [ ] The receiver's displayed size is unmistakably their own, computed from
      their own risk settings
- [ ] With the module absent or the server unreachable, nothing about the
      calculator or journal changes
- [ ] Absent from the Community build entirely (ADR-0003)
- [ ] A receiver cannot place an order directly from a received setup without
      passing [`FEAT-0011`](FEAT-0011-preflight-order-verification.md)'s gate
- [ ] `BREAKING CHANGE:` footer and changelog entry present
- [ ] German and English strings

## Out of scope

- Automatic mirrored execution. Following someone's *orders* automatically is a
  different feature with a different risk profile and needs its own item and its
  own ADR review — receiving a setup is not the same as delegating execution.
- Performance tracking or leaderboards of sharers. That reintroduces the
  journal-derived ranking ADR-0004 §3 rejects.
- Discovery. Sessions are shared by invitation, not browsed.

## Open questions

- **Session identity and invitation.** How a user invites another without a
  Cachy account system. Probably a session code; needs designing so that a
  guessed code does not join a stranger's session.
- **Retention.** A live setup is ephemeral. Does anything persist after the
  session ends? The default answer should be no — matching the chat's retention
  reasoning.
- **Rate limiting.** A form that broadcasts on every keystroke is both a load
  problem and, in aggregate, a behavioural record. Debounce, and decide whether
  intermediate values are sent at all.

## Links

- [`docs/adr/0004-spacetimedb-data-scope.md`](../../adr/0004-spacetimedb-data-scope.md) §3
- [`docs/adr/0001-local-first-boundary.md`](../../adr/0001-local-first-boundary.md)
- [`FEAT-0014`](FEAT-0014-edition-build-targets.md) — module boundary must exist first
- `src/services/cloudService.ts`, `server/spacetimedb/src/index.ts`
