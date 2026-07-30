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
import { locale } from "../locales/i18n";
import { get } from "svelte/store";

export interface FlashCard {
  id: string;
  question: string;
  answer: string;
}

export type QuizCategory = "trading" | "tech";

class QuizStore {
  questions = $state<FlashCard[]>([]);
  knownQuestionIds = $state<Set<string>>(new Set());
  activeQuestion = $state<FlashCard | null>(null);
  activeCategory = $state<QuizCategory>("trading");
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

  loadProgress() {
    try {
      const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.knownQuestionIds = new Set(parsed);
        }
      }
      const storedCat = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_QUIZ_CATEGORY_KEY);
      if (storedCat === "tech" || storedCat === "trading") {
        this.activeCategory = storedCat;
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
        CONSTANTS.LOCAL_STORAGE_QUIZ_CATEGORY_KEY,
        this.activeCategory
      );
    } catch (e) {
      console.error("Failed to save quiz progress", e);
    }
  }

  setCategory(category: QuizCategory) {
    this.activeCategory = category;
    if (browser) {
      try {
        localStorage.setItem(CONSTANTS.LOCAL_STORAGE_QUIZ_CATEGORY_KEY, category);
      } catch (e) {
        console.error("Failed to save quiz category", e);
      }
    }
    this.loadQuestions();
  }

  async loadQuestions(lang: string | null = null, category: QuizCategory | null = null) {
    try {
      this.isLoading = true;

      // Determine language if not provided
      if (!lang) {
        lang = get(locale);
      }

      const cat = category || this.activeCategory;

      // Select path based on language & category
      let path: string;
      if (cat === "trading") {
        path = (lang && lang.startsWith("de"))
          ? CONSTANTS.FLASHCARDS_TRADING_CSV_PATH_DE
          : CONSTANTS.FLASHCARDS_TRADING_CSV_PATH_EN;
      } else {
        path = (lang && lang.startsWith("de"))
          ? CONSTANTS.FLASHCARDS_CSV_PATH_DE
          : CONSTANTS.FLASHCARDS_CSV_PATH_EN;
      }

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

  startQuiz(category?: QuizCategory) {
    if (category && category !== this.activeCategory) {
      this.setCategory(category);
    }

    if (this.questions.length === 0) return;

    // Filter unknown questions
    const unknownQuestions = this.questions.filter(
      (q) => !this.knownQuestionIds.has(q.id)
    );

    if (unknownQuestions.length === 0) {
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
    setTimeout(() => {
      this.activeQuestion = null;
    }, 300);
  }

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
