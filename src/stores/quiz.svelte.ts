/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { locale, _ } from "../locales/i18n";
import { get } from "svelte/store";
import { toastService } from "../services/toastService.svelte";
import { effectsState } from "./effects.svelte";
import {
  DEFAULT_QUIZ_DECK_ID,
  QUIZ_DECKS,
  isQuizDeckId,
  type QuizDeck,
  type QuizDeckId,
} from "../lib/quiz/decks";
import { computeQuizProgress } from "../lib/quiz/progress";
import { parseDeckCsv } from "../lib/quiz/parse";
import type { FlashCard } from "../lib/quiz/types";

export type { FlashCard };

export type { QuizDeckId };

/*
 * Standalone flashcard quiz. Deliberately independent of the Trading Academy:
 * its own decks, its own progress, its own overlay. Cards carry a stable id in
 * the CSV so fixing a question's wording never loses saved progress.
 */
class QuizStore {
  questions = $state<FlashCard[]>([]);
  knownQuestionIds = $state<Set<string>>(new Set());
  activeQuestion = $state<FlashCard | null>(null);
  activeDeckId = $state<QuizDeckId>(DEFAULT_QUIZ_DECK_ID);
  isQuizActive = $state(false);
  isLoading = $state(false);

  constructor() {
    if (browser) {
      this.loadProgress();
      // Subscribe to locale changes to reload questions
      locale.subscribe((lang) => {
        this.loadQuestions(lang);
      });
    }
  }

  get activeDeck(): QuizDeck {
    return (
      QUIZ_DECKS.find((deck) => deck.id === this.activeDeckId) ?? QUIZ_DECKS[0]
    );
  }

  /** Cards in the loaded deck that are marked as known. */
  get knownCount(): number {
    return computeQuizProgress(this.questions, this.knownQuestionIds).known;
  }

  /** Total cards in the loaded deck. */
  get totalCount(): number {
    return this.questions.length;
  }

  get progress() {
    return computeQuizProgress(this.questions, this.knownQuestionIds);
  }

  loadProgress() {
    try {
      const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.knownQuestionIds = new Set(parsed);
        }
      }
      // One-time deck migration: older builds stored "tech", which no longer
      // exists, and any unknown value falls back to the default deck.
      const storedDeck = localStorage.getItem(
        CONSTANTS.LOCAL_STORAGE_QUIZ_DECK_KEY,
      );
      if (isQuizDeckId(storedDeck)) {
        this.activeDeckId = storedDeck;
      } else {
        this.activeDeckId = DEFAULT_QUIZ_DECK_ID;
      }
    } catch (e) {
      console.warn("Failed to load quiz progress", e);
    }
  }

  saveProgress() {
    if (!browser) return;
    try {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_QUIZ_KEY,
        JSON.stringify(Array.from(this.knownQuestionIds))
      );
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_QUIZ_DECK_KEY,
        this.activeDeckId
      );
    } catch (e) {
      console.error("Failed to save quiz progress", e);
    }
  }

  setDeck(deckId: QuizDeckId) {
    this.activeDeckId = deckId;
    if (browser) {
      try {
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_QUIZ_DECK_KEY, deckId);
      } catch (e) {
        console.error("Failed to save quiz deck", e);
      }
    }
    this.loadQuestions();
  }

  async loadQuestions(lang: string | null = null, deckId: QuizDeckId | null = null) {
    try {
      this.isLoading = true;

      // Determine language if not provided
      if (!lang) {
        lang = get(locale);
      }

      if (deckId) {
        this.activeDeckId = deckId;
      }
      const deck = this.activeDeck;
      const path = lang && lang.startsWith("de") ? deck.csv.de : deck.csv.en;

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      this.questions = this.parseCSV(text);
    } catch (e) {
      console.error("Failed to load flashcards", e);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Parses the deck CSV: an `id,question,answer` header followed by one card
   * per line. The id is authored, not derived, so editing a question no longer
   * resets its progress. Kept as a method for callers/tests; the rule lives in
   * `lib/quiz/parse`.
   */
  parseCSV(text: string): FlashCard[] {
    return parseDeckCsv(text);
  }

  /** Picks the next card to show: a random still-unknown one, or (once every
   * card in the deck is known) a random one from the full set. Shared by
   * startQuiz() and nextQuestion() so there is one selection rule, not two. */
  private pickQuestion(): FlashCard | null {
    if (this.questions.length === 0) return null;

    const unknownQuestions = this.questions.filter(
      (q) => !this.knownQuestionIds.has(q.id)
    );

    const pool = unknownQuestions.length === 0 ? this.questions : unknownQuestions;
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }

  startQuiz(deckId?: QuizDeckId) {
    if (deckId && deckId !== this.activeDeckId) {
      this.setDeck(deckId);
    }

    const question = this.pickQuestion();
    if (!question) {
      // Most likely the CSV fetch hasn't resolved yet -- say so instead of
      // silently doing nothing (BUG-0049).
      toastService.warning(get(_)("quiz.notReady"));
      return;
    }

    this.activeQuestion = question;
    this.isQuizActive = true;
  }

  /** Advances to a new card without closing the quiz (BUG-0049: answering a
   * card used to end the session instead of continuing it). */
  nextQuestion() {
    const question = this.pickQuestion();
    if (!question) {
      // The pool emptied out from under us (e.g. questions cleared
      // mid-session) -- nothing left to show, so end the session rather
      // than leave a stale card up.
      this.closeQuiz();
      return;
    }
    this.activeQuestion = question;
  }

  closeQuiz() {
    this.isQuizActive = false;
    setTimeout(() => {
      this.activeQuestion = null;
    }, 300);
  }

  markKnown() {
    if (this.activeQuestion) {
      this.knownQuestionIds.add(this.activeQuestion.id);
      this.saveProgress();
      // Quiz-specific event: the quiz has no connection to the Academy, so it
      // must not claim an Academy lesson was completed.
      effectsState.triggerDuckEvent({
        type: "quiz_correct",
        cardId: this.activeQuestion.id,
      });
    }
    this.nextQuestion();
  }

  markUnknown() {
    this.nextQuestion();
  }

  resetProgress() {
    this.knownQuestionIds = new Set();
    this.saveProgress();
  }

  exportState(): string {
    return JSON.stringify(Array.from(this.knownQuestionIds));
  }

  importState(json: string) {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        this.knownQuestionIds = new Set(parsed);
        this.saveProgress();
      }
    } catch (e) {
      console.error("Failed to import quiz state", e);
    }
  }
}

export const quizState = new QuizStore();
