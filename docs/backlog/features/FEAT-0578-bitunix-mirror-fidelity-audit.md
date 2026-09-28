---
id: FEAT-0578
title: "Verify the Bitunix mirror against the live vendor pages and fix what it got wrong"
type: feature
status: done
priority: P2
area: docs
created: "2026-09-28"
assignee: opencode
milestone: none
editions: ["community"]
data_class: none
adr: none
depends_on: []
---

# Audit the Bitunix mirror against the live vendor pages

## Problem

`docs/bitunix-api/` had never been checked against
<https://www.bitunix.com/api-docs/futures/> since it was written. A mirror that
has drifted from its source is worse than no mirror: it looks authoritative and
is quotable, and a reader cannot tell which parts are still true.

FEAT-0577 translated the set back into English. That pass surfaced the question
but could not answer it — a translation check is not a fidelity check.

## Solution

Re-audit every file against the live vendor pages and correct the differences.

The headline result is worth recording because it is counter-intuitive: **the
large majority of suspected errors were faithful transcriptions of a defective
vendor page.** Roughly 20 claims were checked; the mirror was right about most
of them, and correcting those would have propagated Bitunix's bugs into a
document whose value is that it can be diffed against its source.

Those are now annotated in place — "the mirror is correct, the vendor is wrong"
— so a future crawl does not reverse them.

Four genuine mirror errors were found and fixed, one of which would have broken
code, and one passage was found that had **no vendor source at all**.

## Acceptance criteria

- [x] Every file in the set re-audited against the live vendor pages
- [x] Each vendor page's slug harvested from the live sidebar, not guessed;
      no silent redirects accepted as a successful fetch
- [x] Error-code table checked code by code — 76 codes, none missing, none added
- [x] The two uncrawled Account endpoints added (`get_position_mode`,
      `get_trading_settings`) — the first crawl had missed 2 of 8
- [x] The invented `nonce` description removed and the vendor's actual wording
      restored, in all three files it had spread into
- [x] Kline response types corrected from `decimal` to `string` and the example
      re-quoted — a `decimal.js` layer parsed a number where the API sends a
      string
- [x] TP/SL WebSocket `status` enum corrected to the vendor's list, including
      `SYSTEM_CANCELED`, and two values removed that the vendor explicitly says
      cannot occur on that channel
- [x] The invented "at least one of `tpQty`/`slQty` is required" requirement
      removed — the vendor says only "Omitted if unused"
- [x] Every silent repair of a vendor bug either reverted to verbatim or marked,
      and the policy written into the set's front matter
- [x] `12_doc_defects.md` created as the quarantine
- [x] An explicit Coverage section stating what is mirrored (54 of 54 pages,
      measured) and what is deliberately out of scope
- [x] The `wallet` vs `balance` and `tp_sl` vs `tpsl` private channel names
      recorded as unresolved, with the circularity in the code's own
      justification named
- [x] The `fundingRate` contradiction between `04_market.md` and
      `QUICK_REFERENCE.md` resolved against the code — `dividedBy(100)` at
      `marketData.ts:790` settles the batch endpoint and leaves the history
      endpoint unverified
- [x] `npm run backlog:check` green; all relative links resolve

## Out of scope

- Changing any Bitunix integration code. The channel-name findings are recorded,
  not fixed — they need a credentialed check.
- Re-translating or re-crawling; this is a fidelity pass over existing content.
- The Bitget mirror, which is a separate item (FEAT-0525) and a separate branch.

## What shipped

Corrected and added across `docs/bitunix-api/`:

| File | Change |
|---|---|
| `README.md` | House rules, explicit Coverage section (54/54 pages measured), the unverified list |
| `00_common.md`, `01_sign.md` | Invented `nonce` text replaced with the vendor's wording; four ⚠️ callouts on the WebSocket signing contradictions |
| `02_account.md` | `get_position_mode` and `get_trading_settings` added |
| `04_market.md` | Kline types and quoting fixed, `quoteVol` fixed, `launchTime`/`delistTime` added, seven vendor defects annotated, funding-rate note attributed |
| `08_websocket.md` | Tp Sl `status` corrected, invented requirement removed, the discarded Description content restored, ISO-8601 warnings restored, both channel-name disputes recorded, five vendor defects annotated |
| `09_error_codes.md` | Missing `[sic]` on `30037` added, defects section written |
| `QUICK_REFERENCE.md` | The "both endpoints are a percentage" claim narrowed to what the code proves |
| `12_doc_defects.md` | New — the quarantine |
| `INTEGRATION_STATUS.md` | The plan-order family's undocumented status recorded |

## Follow-up worth its own item

The two private channel names cannot be settled from documentation. If Bitunix
is right that the channels are `balance` and `tpsl`, then Cachy subscribes with
names the gateway rejects, and **no balance update and no TP/SL update ever
arrives** — silently, because a rejected subscription is a push that does not
arrive. The code and the mirror agree with each other and disagree with the
vendor, and the code's comment justifies its choice by citing the mirror, so
there is no independent evidence either way.

A credentialed check against the live gateway resolves it. That is a code change
if it turns out to be wrong, so it is out of scope here.

## Links

- FEAT-0577 — the English translation pass that prompted this audit
- FEAT-0525 — the Bitget mirror, including the same class of findings on a
  vendor whose documentation is considerably worse
- BUG-0001 — never guess an exchange's wire format
