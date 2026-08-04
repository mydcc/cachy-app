---
id: BUG-0049
title: The quiz closes after every answer, has no close button and opens behind other windows
type: bug
status: specced
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

## Acceptance criteria

- [ ] A test asserts `markKnown()` leaves `isQuizActive` true and sets a
      different `activeQuestion`; it fails without the fix
- [ ] The same for `markUnknown()`
- [ ] `markKnown()` still records the id in `knownQuestionIds` and persists it
- [ ] A close button is present and closes the quiz
- [ ] The quiz card renders above an open chart window and above an open modal
- [ ] Clicking the quiz button before the CSV loads produces visible feedback
- [ ] The existing tests in `src/stores/quiz.test.ts` still pass

## Links

- `src/stores/quiz.svelte.ts:162-202`
- `src/components/shared/FlashCard.svelte:51-55,70-79,176-195`
- `src/components/shared/QuizButton.svelte:26`
- [`FEAT-0041`](../features/FEAT-0041-window-layer-contract.md) for the stacking half
