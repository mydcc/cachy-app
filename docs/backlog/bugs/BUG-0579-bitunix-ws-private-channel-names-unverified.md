---
id: BUG-0579
title: "Bitunix private WebSocket channel names are unverified and may be silently dead"
type: bug
status: specced
priority: P1
area: exchange
created: "2026-09-28"
milestone: none
editions: ["community", "pro", "private"]
data_class: none
adr: none
depends_on: []
---

# Verify the Bitunix private WebSocket channel names before trusting them

## Symptom

Cachy subscribes to the Bitunix private WebSocket with two channel names that
the vendor's documentation does not use:

```ts
// src/services/bitunixWs.ts:1185
const channels = ["position", "order", "wallet", "tp_sl"];
```

Bitunix documents `balance` and `tpsl` — no underscore in the first, no
underscore in the second. The two sets do not intersect.

If the vendor spelling is correct, the venue never matches the two
subscriptions, and:

- **no balance update ever arrives** through the socket, and
- **no TP/SL update ever arrives** through the socket.

Neither fails loudly. A silently unsubscribed channel produces no error, no
error-log entry, and no UI signal — the push simply never comes, and the code
falls back to whatever REST poll it already does. The result is a *degraded*
socket that looks healthy, not a broken one.

That matters most for TP/SL. A bracket-order TP/SL leg that attaches on the
venue and is never reported back leaves the trader believing they are
unprotected, or — worse — believing a stop moved when it did not.

## Evidence

**The disagreement, both sides quoted.**

Bitunix's own pages, `tpsl` and `balance`:

| Source | Channel name |
|---|---|
| `Tp Sl Channel` — Description | *"Channel name is `tpsl`"* |
| `Tp Sl Channel` — Push Parameters, `ch` row | *"Channel name: tpsl"* |
| `Balance Channel` — Push Parameters, `ch` row | *"Channel name: balance"* |

`docs/bitunix-api/08_websocket.md`, transcribed in PR #3709:

| Location | Channel name |
|---|---|
| Balance-Updates heading | `wallet` |
| Push Parameters `ch` row | `wallet` |
| Tp Sl heading, `ch` row, cross-reference | `tp_sl` |

**The reference is circular, and the code says so itself.** The justification
for keeping `tp_sl` as a channel separate from `order` is written into
`src/services/bitunixWs.ts:1181-1184` and cites the local mirror:

```ts
// "tp_sl" carries bracket TP/SL leg attach/detach as its own event,
// independent of "order" — Bitunix attaches the two legs to a resting
// order asynchronously and does not reliably echo both back on the same
// "order" push (docs/bitunix-api/08_websocket.md:294-326).
```

So the code cites the mirror, and the mirror was transcribed from the docs. No
artefact in the chain observes the venue. The prepare page publishes no
authoritative list of private channel names either, so nothing on the live
site corroborates `wallet` or `tp_sl`.

Worse, the citation has already gone stale. `08_websocket.md:294-326` pointed at
the TP/SL region when the comment was written; after the re-transcription in
PR #3709 that line range is the **Position Channel** section. The code now
cites a passage that says nothing about channel names at all. A citation like
this reads as a checked reference to the next reader whether or not anyone
re-checked it.

**What the prior looks like.** It tilts *toward* the code being right, and this
should be recorded before anyone "fixes" it. If `wallet`/`tp_sl` were wrong,
TP/SL and balance sync would have been visibly broken for every Bitunix user
since the feature landed. Nobody ships a silently-dead socket channel and
leaves it. The likelier origin is that the mirror was written from **working
traffic** rather than from the rendered doc pages, in which case the code is
carrying information the current docs have since lost.

That is an argument against editing the code. It is not evidence, and it is not
a substitute for one authenticated connection.

## Cause

Not a defect in any one artefact — a **missing verification step**. The channel
names were recorded once, from a source whose provenance is unknown, and then
treated as settled because they appeared in a local reference. The reference
gained authority by being written down, and the code gained authority by citing
the reference.

This is the mirror's general failure mode, documented in
[`docs/bitunix-api/12_doc_defects.md`](../../bitunix-api/12_doc_defects.md): the
set silently repaired vendor defects in both directions without marking them,
so transcribed text, local correction and invention are indistinguishable on
the page.

## Fix

**Do not change the code on the strength of the documentation.** Changing
`wallet` → `balance` and `tp_sl` → `tpsl` because a doc page says so risks
breaking a socket that works. Equally, do not leave it as is: the current state
is a money-adjacent silent-failure risk resting on an unverified string.

One authenticated WebSocket connection answers this. A Bitunix API key with
read permission is enough — no orders, no funds, no writes:

1. Connect to the private WebSocket endpoint and authenticate.
2. Subscribe to **both** spellings for both channels:
   `["position", "order", "wallet", "tp_sl", "balance", "tpsl"]`.
3. Read the venue's reply. Bitunix echoes a `subscribe` confirmation per
   channel; a channel it does not know should produce either a distinct error
   or no confirmation at all.
4. Whichever names come back confirmed are the live ones. Compare against
   `bitunixWs.ts:1185` and fix the code **only if** the venue disagrees.

If the venue accepts both spellings, record that in the mirror and close this
as a documentation question. If it accepts neither, the socket has been dead
and this becomes a P0.

**Then correct the mirror, marking the repair.** If the venue confirms the
vendor spelling, `08_websocket.md` is wrong and must be fixed *with a
correction note* — the set's house rule is "transcribe verbatim, mark every
repair", precisely so this kind of change stays visible to the next audit.

**Secondary, worth doing regardless:** break the circular citation. The comment
at `bitunixWs.ts:1181-1184` should not point at a mirror that points back at
it. Once the names are verified, it should cite the observed venue response.

## Acceptance criteria

- [ ] One authenticated Bitunix private WebSocket connection is opened and both
      channel spellings are subscribed
- [ ] The venue's response is recorded verbatim in the bug — confirmed,
      rejected, or silently ignored, per channel
- [ ] `src/services/bitunixWs.ts:1185` is either left unchanged with the
      verification recorded, or corrected to the spelling the venue confirmed
- [ ] The fix, if any, is accompanied by a test asserting the subscribed
      channel names, so a future rename cannot silently diverge again
- [ ] `docs/bitunix-api/08_websocket.md` reflects the outcome, and any change to
      the transcribed value carries an explicit correction note
- [ ] `docs/bitunix-api/12_doc_defects.md` records this item in the
      undeclared-repair table
- [ ] The circular citation in `src/services/bitunixWs.ts:1181-1184` is replaced
      with the observed evidence

## Links

- PR #3709 — the Bitunix fidelity audit that surfaced this
- [`docs/bitunix-api/08_websocket.md`](../../bitunix-api/08_websocket.md) —
  the mirror, both sides of the disagreement
- [`docs/bitunix-api/12_doc_defects.md`](../../bitunix-api/12_doc_defects.md) —
  the house rules this bug exists to enforce
- BUG-0001 — never guess an exchange's wire format for a call that moves money
