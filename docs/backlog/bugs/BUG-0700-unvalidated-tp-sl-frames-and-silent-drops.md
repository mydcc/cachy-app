---
id: BUG-0700
title: The tp_sl channel forwards frames unvalidated, and the store hides what it cannot use
type: bug
status: done
priority: P3
milestone: none
created: "2026-10-18"
editions: [community, pro, private]
area: execution
data_class: none
adr: none
depends_on: []
assignee: claude
---

# BUG-0700 — Unvalidated tp_sl frames, and drops with no trace

Found while reviewing #4137 (BUG-0697). All three are pre-existing and none is
introduced by it.

## Symptom

Three ways a TP/SL push is misread or lost without a trace:

1. **A `null` orderId becomes a real leg.** `updateFromWs` guards with
   `const orderId = data.orderId !== undefined ? String(data.orderId) : ""`
   (`src/stores/tpsl.svelte.ts:287`). `String(null)` is the truthy `"null"`, so
   the guard passes and the store gains a `null-tp` leg the venue has never
   heard of.
2. **A renamed price field disappears silently.** `if (price === undefined)
   return;` (`:347`) is the right guard for a frame about the other leg, but it
   is also where a `tpPrice`/`slPrice` rename dies. The comment above it claims
   a rename "would make every push vanish exactly here" — true for `orderId` and
   `symbol`, not for the prices.
3. **An unparseable trigger is swallowed.** `restingStopPrice`'s
   `catch { continue; }` (`:182-188`) skips a leg whose `triggerPrice` does not
   parse. If it is the only leg the answer is `null` — "no stop" — with nothing
   saying why.

## Evidence

**Derived**, by reading the code. (1) is directly reproducible in a unit test.
(2) and (3) need a fabricated frame, so they are diagnosability findings: the
fetch path self-heals both within `MAX_AGE_MS`, which bounds the damage.

Why it is worth an item at all: `channelDispatch.ts:302-303` forwards every
`tp_sl` frame verbatim — no schema validation, no normalisation — while the
`orders` branch beside it sanitises numeric ids (`:273-280`). The store is
therefore the only validator on this path.

## Cause

No validation at the channel boundary, and three guards written to be quiet
rather than to be legible. Each is defensible alone; together they mean a
malformed or renamed frame is indistinguishable from an absent one.

## Fix

Smallest useful change per case, and nothing more:

- (1) `data.orderId != null` instead of `!== undefined`, and drop the leg when
  the id is not a usable string. One line, with a test.
- (2) and (3) `logger.debug` at the drop, matching the dropped-push log at
  `:291` and the removal log BUG-0697 added. `debug` traces in development
  only — this is for diagnosis, not a production record.

## Acceptance criteria

- [x] A push with `orderId: null` creates no leg — the guard is `!= null` now,
      and the test casts deliberately, because the point is that the wire does
      not honour the type
- [x] A leg whose `triggerPrice` cannot be parsed is logged at `debug`
- [x] `restingStopPrice()` behaviour for an unparseable leg is unchanged —
      still `null`, never an invented number; the test asserts both the absence
      and the log
- [x] ~~A dropped frame whose price field is missing is logged at `debug`~~ —
      **rejected, the premise was wrong.** A rename makes *both* legs price-less
      on every frame, which is indistinguishable per frame from a frame that
      concerns only the other leg. A log there would fire on every ordinary
      single-leg push: noise, not a trace. That the guard covers a rename was
      itself the defect — the comment above it is what changed, and the fetch
      path is what surfaces a rename.

## Out of scope

- Adding schema validation to `channelDispatch`. That is a larger change and
  belongs with the `orders` branch's existing sanitiser.
- Any change to the terminality test. BUG-0697 and BUG-0699 own that.

## Links

- [BUG-0697](BUG-0697-a-venue-cancelled-leg-stays-resting.md) — the review this
  was found in; its `debug` log is the precedent for the two additions here
- [BUG-0698](BUG-0698-push-carries-fields-the-handler-ignores.md) — the same
  channel, the other half: fields it carries and nobody reads
- `src/services/bitunixWs/channelDispatch.ts` — the unvalidated boundary

## State

Done 2026-10-18 on branch `fix/bug-0697-venue-cancelled-leg-stays-resting`,
together with BUG-0697 and BUG-0699 — same handler, and two of these fixes sit
on lines BUG-0697 already touched.

Two of the three are real fixes with a test each; the third turned out to be a
comment defect rather than a code one. Both fixes are pinned: reverting the
`orderId` guard produces
`expected [ { sourceOrderId: 'null', …(5) } ] to deeply equal []`, and removing
the log fails with `expected "vi.fn()" to be called with arguments`.

The `orderId` guard is `!= null` rather than `!== undefined`, which is what a
trust boundary wants: `channelDispatch` forwards `tp_sl` frames verbatim, so the
type is an assertion about the wire that the wire does not honour.

Not verified against live frames — no observed `orderId: null` and no observed
unparseable trigger. Both guards are defensive, and both are cheap.
