---
id: FEAT-0577
title: The Bitunix mirror was translated into German while its source is English
type: feature
status: done
branch: docs/bitunix-api-english
priority: P2
milestone: none
editions: [community, pro, private]
area: docs
data_class: none
adr: none
assignee: opencode
depends_on: []
---

# Convert the Bitunix mirror to English

## Problem

`docs/bitunix-api/` is a local mirror of Bitunix's official Futures API
documentation, which is published in **English** at
<https://www.bitunix.com/api-docs/futures/common/introduction.html>. A previous
pass translated the mirror's prose into German. The rest of `docs/` — the
README, the ADRs, `TODO.md`, every backlog item — is English, as is the
sibling `docs/bitget-api/` set.

Measured before the change: 15 files, 3,416 lines, 1,728 prose lines, 333
matching German function words and **194 lines containing an umlaut**, spread
across every file except `timeframes.md`.

The problem is maintenance, not taste. A mirror exists so it can be re-crawled
by diffing against its source. With the languages diverged, every future crawl
becomes a translation task instead of a copy, and no automated check can tell a
legitimate upstream change from a mistranslation.

## Proposal

Translate the prose back to English. Nothing else: no content changes, no
re-crawl, no restructuring.

## Acceptance criteria

- [x] All German prose in `docs/bitunix-api/` is English
- [x] No umlaut remains in any prose line
- [x] Every fenced code block, inline code span and URL is byte-identical to
      before
- [x] Heading, table-row, bullet and code-line counts unchanged per file
- [x] Cachy-side findings (parity gaps, adapter limitations, funding-rate scale
      note) preserved
- [x] Terminology consistent across all 15 files and with `docs/bitget-api/`
- [x] `npm run backlog:index` output committed in the same PR

## Out of scope

- Re-crawling the Bitunix docs, or correcting stale claims. Several were found
  and are listed in the PR description; they are content issues, not language
  issues.
- Adding the two Account endpoints Bitunix documents but the mirror omits
  (`get_position_mode`, `get_trading_settings`).
- `docs/bitget-api/`, which is already English.

## What shipped

All 15 files converted, 3,431 lines, English. Verified by hashing every code
block, inline code span and URL per file and comparing against the pre-change
state, and by diffing structural counts.

Two deliberate deviations from byte-identical, both justified in the PR:

- `08_websocket.md` carried a German template inside backticks,
  `` `<Preistyp>_kline_<Intervall>` `` — a documentation template, not a wire
  value, so it was translated.
- `00_common.md` had a bare URL with a sentence period attached, which most
  Markdown renderers absorb into the link. Wrapped in `<…>` autolinks so the URL
  terminates correctly.

## Links

- FEAT-0525 — the Bitget reference, which is why this surfaced
- [docs/bitunix-api/README.md](../bitunix-api/README.md)
