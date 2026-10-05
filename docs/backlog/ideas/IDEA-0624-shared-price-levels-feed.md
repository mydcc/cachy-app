---
id: IDEA-0624
title: Push voluntarily shared price levels live to subscribers
type: idea
status: idea
priority: P3
milestone: M7
editions: [pro, private]
area: cloud
data_class: B
adr: required
depends_on: [FEAT-0014]
---

# IDEA-0624 — Push voluntarily shared price levels live to subscribers

## Problem

When a trader shares a view today ("BTC long 97.5k, SL 96.8k"), every reader
retypes entry, stop and take-profit into the trade form by hand — typos
included. And the sharer's size never fits the reader's account anyway, so
even a perfectly copied trade is sized wrong for everyone except the sharer.

## Proposal

A shared SpacetimeDB module (absent from the Community build, behind the
ADR-0003 module boundary) that pushes deliberately broadcast price levels to
subscribers in real time:

- **Levels feed.** A sharer in an explicit, per-session, default-off session
  broadcasts symbol, side, entry price, stop-loss price, take-profit prices
  and an optional note. That is the whole payload — never size, quantity,
  margin, leverage, risk amount, risk percentage or balance (ADR-0004 §3).
  Receivers see the levels as lines in the chart and adopt them into the
  trade form with one click; the size is always computed locally from the
  receiver's own risk settings.
- **Presence.** Who is currently in a shared session (no positions, no sizes).
- **Peer reputation from chat data only.** Rating, flag, message count,
  account age on messages — never journal-derived (ADR-0004 §3, settled by
  engineering-log item 12a). It measures whether people liked what was
  written, not whether the author can trade.
- **Four-eyes approval (later slice).** A second party approves before an
  order is transmitted; same payload restriction plus order type.

## Out of scope

- Any visibility into other traders' actual orders, positions or sizes.
  Only deliberately broadcast levels travel; nothing is observed.
- Journal-, settings- or account-derived values in any payload, in any form
  (rank, badge, bucket, boolean).
- Replacing local computation or the pre-flight gate (FEAT-0011): the feed
  proposes levels, the local gate still verifies every order.
- A Cachy-operated default host or any pre-filled instance discovery.

## Open questions

- Pilot slice: levels feed, presence, or peer reputation first?
- Payload key-set test (same guard shape as `chat.test.ts`) — exact permitted
  keys per slice.
- Session UX: where does "start broadcasting" live so it is unmistakably
  per-session and never a forgotten toggle?

## Links

- docs/adr/0001-local-first-boundary.md
- docs/adr/0003-edition-boundary.md
- docs/adr/0004-spacetimedb-data-scope.md §3
- docs/backlog/features/FEAT-0014-edition-build-targets.md
- https://spacetimedb.com/docs/intro/what-is-spacetimedb
