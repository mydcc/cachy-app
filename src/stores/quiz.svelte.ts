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

export interface FlashCard {
  id: string;
  question: string;
  answer: string;
}

class QuizStore {
  questions = $state<FlashCard[]>([]);
  knownQuestionIds = $state<Set<string>>(new Set());
  activeQuestion = $state<FlashCard | null>(null);
  isQuizActive = $state(false);
  isLoading = $state(false);

  constructor() {
    if (browser) {
      this.loadProgress();
      this.loadQuestions();
    }
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
    } catch (e) {
      console.error("Failed to save quiz progress", e);
    }
  }

  async loadQuestions() {
    try {
      this.isLoading = true;
      const response = await fetch(CONSTANTS.FLASHCARDS_CSV_PATH);
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

  parseCSV(text: string): FlashCard[] {
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const cards: FlashCard[] = [];

    // Simple regex for CSV splitting: matches comma only if followed by even number of quotes
    const regex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    lines.forEach((line) => {
      const parts = line.split(regex);

      if (parts.length >= 2) {
        let question = parts[0].trim();
        let answer = parts[1].trim();

        // Unquote
        if (question.startsWith('"') && question.endsWith('"')) {
          question = question.slice(1, -1).replace(/""/g, '"');
        }
        if (answer.startsWith('"') && answer.endsWith('"')) {
          answer = answer.slice(1, -1).replace(/""/g, '"');
        }

        // Simple ID generation
        const id = btoa(unescape(encodeURIComponent(question))).slice(0, 16);

        cards.push({ id, question, answer });
      }
    });
    return cards;
  }

  startQuiz() {
    if (this.questions.length === 0) return;

    // Filter unknown questions
    const unknownQuestions = this.questions.filter(
      (q) => !this.knownQuestionIds.has(q.id)
    );

    if (unknownQuestions.length === 0) {
      // All known! Maybe show a specific "Mastered" card?
      // For now, we might reset or just pick one at random from all
      // But user wanted "Stack of un-known questions".
      // If empty, let's just pick any random one to keep playing, or handle "Done" UI.
      // I'll pick a random one from ALL to allow replay, but user knows they finished.
      // Or better: Show nothing and return? No, better to replay.
      const randomIndex = Math.floor(Math.random() * this.questions.length);
      this.activeQuestion = this.questions[randomIndex];
    } else {
      const randomIndex = Math.floor(Math.random() * unknownQuestions.length);
      this.activeQuestion = unknownQuestions[randomIndex];
    }

    this.isQuizActive = true;
  }

  closeQuiz() {
    this.isQuizActive = false;
    // Delay clearing active question for animation if needed, but for now immediate
    setTimeout(() => {
        this.activeQuestion = null;
    }, 300);
  }

  markKnown() {
    if (this.activeQuestion) {
      this.knownQuestionIds.add(this.activeQuestion.id);
      // Reactivity hack for Sets in Svelte 5 (reassign)
      this.knownQuestionIds = new Set(this.knownQuestionIds);
      this.saveProgress();
    }
    this.closeQuiz();
  }

  markUnknown() {
    // Just close, remains in pool
    this.closeQuiz();
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
