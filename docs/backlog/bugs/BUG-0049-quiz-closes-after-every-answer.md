---
id: BUG-0049
title: The quiz closes after every answer, has no close button and opens behind other windows
type: bug
status: done
priority: P2
milestone: M0
editions: [community, pro, private]
area: ui
data_class: A
adr: none
depends_on: []
---

# BUG-0049 — The quiz closes after every answer, has no close button and opens behind other windows

## Symptom

Three things, all in the flash-card quiz:

1. Answering a card — with either button — closes the quiz. Continuing means
   clicking the quiz button in the toolbar again for every single card.
2. There is no close button. The only ways out are clicking the backdrop or
   pressing Escape, and neither is signposted.
3. Opening the quiz while any window or modal is open shows a dimmed screen with
   no card.

## Evidence

**Derived**, three separate causes.

**1 — both answer buttons close.** `quiz.svelte.ts:192-202`:

```js
markKnown() {
    if (this.activeQuestion) {
        this.knownQuestionIds.add(this.activeQuestion.id);
        this.saveProgress();
    }
    this.closeQuiz();
}

markUnknown() {
    this.closeQuiz();
}
```

There is no "draw the next card" method on the store. `startQuiz()`
(`quiz.svelte.ts:162-183`) does the drawing, but it is only reachable from
`QuizButton.svelte:26` and the category pills in `FlashCard.svelte:88-110`.

**2 — no close control.** `FlashCard.svelte:70-199` renders the backdrop, the
category pills and the card. The only close paths are the backdrop's `onclick`
(line 75) and its `onkeydown` (line 78). No button exists.

**3 — stacking.** `FlashCard.svelte:73` uses `z-[200]`. `ModalFrame` is at
`10000` (`ModalFrame.svelte:154`) and `WindowContainer` at `11000`
(`WindowContainer.svelte:96`). The card renders underneath both; its own
`bg-black/60` backdrop is what the user sees.

A fourth, smaller one: `startQuiz()` returns silently when `questions.length`
is 0 (`quiz.svelte.ts:167`), so clicking the quiz button before the CSV has
loaded does nothing and says nothing.

## Cause

The card was designed as a one-shot prompt rather than a session. Its stacking
value predates the window manager's range.

## Fix

- Add `nextQuestion()` to the store: record progress, draw a new card from the
  unknown pool with the same logic `startQuiz()` uses, and leave `isQuizActive`
  true. `markKnown()` and `markUnknown()` call it instead of `closeQuiz()`.
  Factor the draw out of `startQuiz()` so there is one selection rule, not two.
- Add a visible close button to the card. `FlashCard.svelte`'s `$effect` at
  lines 51-55 already resets `isFlipped` when `activeQuestion` changes, so card
  advancement needs no extra work there.
- Take the z-index from the layer contract in
  [`FEAT-0041`](../features/FEAT-0041-window-layer-contract.md), on the modal
  layer.
- Give `startQuiz()` a visible response when no questions are loaded — the
  loading state already exists as `isLoading`.

Keep the card's look, the flip interaction and the category pills as they are.
The user asked for the quiz to stay what it is.

Implemented as written, with two additions the plan didn't call out:

- The z-index half was already done by [`FEAT-0041`](../features/FEAT-0041-window-layer-contract.md)
  before this item was picked up — `FlashCard.svelte` already reads
  `z-[var(--z-modal)]`. Nothing left to do here.
- The close button was first placed `top-4 right-4`, matching where a modal's
  own close button usually sits. `ToastContainer` anchors at
  `top: 24px; right: 24px`, and Playwright caught a real toast (an
  environment-network error, but the position is what matters) intercepting
  the click — a genuine toast firing while the quiz is open would cover a
  top-right close button in production too, not just in a test sandbox.
  Moved to `top-4 left-4`, which nothing else claims.

`pickQuestion()` factors the draw logic out of `startQuiz()` as specced;
`nextQuestion()` reuses it and falls back to `closeQuiz()` only if the pool
is empty (defensive — reachable if `questions` is cleared out from under an
active session, not through normal use).

## Verification

No automated component-rendering test for the close button's presence in the
DOM (no harness exists in this repo — see
[`FEAT-0050`](../features/FEAT-0050-window-manager-test-coverage.md)), but the
store-level behaviour is fully covered by real unit tests in
`src/stores/quiz.test.ts`, extended for this item: 22 tests total, up from 20
(2 net new — the pre-existing "marks question as known/unknown and closes
quiz" tests tested the *old*, now-wrong behaviour and were rewritten rather
than kept alongside new ones). Also verified end-to-end against the dev
server with Playwright: opened the quiz, flipped a card, answered "known",
confirmed the card stayed open and rendered (a real question — "What does the
term 'Hawkish' mean regarding central bank decisions?"), then confirmed the
close button is present, unobstructed, and closes the quiz on click
(screenshot).

## Acceptance criteria

- [x] A test asserts `markKnown()` leaves `isQuizActive` true and sets a
      different `activeQuestion`; it fails without the fix — the rewritten
      "marks question as known, saves progress, and advances instead of
      closing" test in the "Knowledge marking methods" block
- [x] The same for `markUnknown()` — the matching rewritten test
- [x] `markKnown()` still records the id in `knownQuestionIds` and persists it
      — same test, `saveProgress` spy assertion unchanged from before
- [x] A close button is present and closes the quiz — verified via Playwright,
      repositioned top-left after the toast-collision finding above
- [x] The quiz card renders above an open chart window and above an open modal
      — done by FEAT-0041, not re-verified here
- [x] Clicking the quiz button before the CSV loads produces visible feedback
      — `toastService.warning(get(_)("quiz.notReady"))`, covered by the
      rewritten "does not start quiz when no questions exist" test
- [x] The existing tests in `src/stores/quiz.test.ts` still pass — all 22
      pass, `npm test` green (926 passed, 6 skipped)

## Links

- `src/stores/quiz.svelte.ts` — `pickQuestion()`, `nextQuestion()`, `startQuiz()`
- `src/stores/quiz.test.ts`
- `src/components/shared/FlashCard.svelte` — close button
- `src/components/shared/QuizButton.svelte:26`
- `src/services/toastService.svelte.ts` — used for the not-ready warning
- `src/locales/locales/en.json`, `de.json` — `quiz.notReady`
- [`FEAT-0041`](../features/FEAT-0041-window-layer-contract.md) for the stacking half
