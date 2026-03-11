// @vitest-environment jsdom

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

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CONSTANTS } from "../lib/constants";

// Mock dependencies
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("../locales/i18n", () => ({
  locale: { subscribe: vi.fn() },
}));

global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });

vi.mock("svelte/store", () => ({
  get: vi.fn(() => "en"),
}));

// We need to import the quizState *after* mocks, but for vitest hoisting is automatic.
import { quizState } from "./quiz.svelte";

describe("QuizStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quizState.questions = [];
    quizState.knownQuestionIds = new Set();
    quizState.activeQuestion = null;
    quizState.isQuizActive = false;
    quizState.isLoading = false;
    localStorage.clear();

    // reset global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });



  describe("parseCSV", () => {
    it("parses unquoted strings correctly", () => {
      const csv = "Question 1,Answer 1\nQuestion 2,Answer 2";
      const cards = quizState.parseCSV(csv);

      expect(cards.length).toBe(2);
      expect(cards[0].question).toBe("Question 1");
      expect(cards[0].answer).toBe("Answer 1");
      expect(cards[1].question).toBe("Question 2");
      expect(cards[1].answer).toBe("Answer 2");

      // btoa(unescape(encodeURIComponent("Question 1"))).slice(0, 16) => "UXVlc3Rpb24gMQ=="
      expect(cards[0].id).toBe(btoa(unescape(encodeURIComponent("Question 1"))).slice(0, 16));
    });

    it("parses double-quoted strings correctly", () => {
      const csv = '"Question 1, with comma","Answer 1"\n"Question ""2""","Answer 2"';
      const cards = quizState.parseCSV(csv);

      expect(cards.length).toBe(2);
      expect(cards[0].question).toBe("Question 1, with comma");
      expect(cards[0].answer).toBe("Answer 1");
      expect(cards[1].question).toBe('Question "2"');
      expect(cards[1].answer).toBe("Answer 2");
    });

    it("ignores empty lines", () => {
      const csv = "Q1,A1\n\n\nQ2,A2\n";
      const cards = quizState.parseCSV(csv);
      expect(cards.length).toBe(2);
    });
  });


  describe("loadQuestions", () => {
    it("fetches English flashcards when lang is 'en'", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("Q1,A1\nQ2,A2"),
      });

      await quizState.loadQuestions("en");

      expect(global.fetch).toHaveBeenCalledWith(CONSTANTS.FLASHCARDS_CSV_PATH_EN);
      expect(quizState.questions.length).toBe(2);
      expect(quizState.questions[0].question).toBe("Q1");
      expect(quizState.isLoading).toBe(false);
    });

    it("fetches German flashcards when lang is 'de'", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("Frage 1,Antwort 1"),
      });

      await quizState.loadQuestions("de");

      expect(global.fetch).toHaveBeenCalledWith(CONSTANTS.FLASHCARDS_CSV_PATH_DE);
      expect(quizState.questions.length).toBe(1);
    });

    it("handles fetch errors gracefully", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await quizState.loadQuestions("en");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to load flashcards",
        expect.any(Error)
      );
      expect(quizState.isLoading).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe("loadProgress and saveProgress", () => {
    it("loads knownQuestionIds from localStorage", () => {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY, JSON.stringify(["id1", "id2"]));

      quizState.loadProgress();

      expect(quizState.knownQuestionIds.has("id1")).toBe(true);
      expect(quizState.knownQuestionIds.has("id2")).toBe(true);
      expect(quizState.knownQuestionIds.size).toBe(2);
    });

    it("saves knownQuestionIds to localStorage", () => {
      quizState.knownQuestionIds = new Set(["id3", "id4"]);

      quizState.saveProgress();

      const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY);
      expect(stored).toBe('["id3","id4"]');
    });

    it("handles parsing errors gracefully during loadProgress", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY, "{invalid json}");

      quizState.loadProgress();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Failed to load quiz progress",
        expect.any(SyntaxError)
      );
      expect(quizState.knownQuestionIds.size).toBe(0);

      consoleWarnSpy.mockRestore();
    });
  });

  describe("startQuiz and closeQuiz", () => {
    it("starts quiz when questions exist", () => {
      quizState.questions = [
        { id: "q1", question: "1?", answer: "1!" },
        { id: "q2", question: "2?", answer: "2!" },
      ];

      quizState.startQuiz();

      expect(quizState.isQuizActive).toBe(true);
      expect(quizState.activeQuestion).toBeDefined();
      expect(quizState.activeQuestion).not.toBeNull();
    });

    it("does not start quiz when no questions exist", () => {
      quizState.questions = [];
      quizState.startQuiz();

      expect(quizState.isQuizActive).toBe(false);
      expect(quizState.activeQuestion).toBeNull();
    });

    it("starts quiz picking only from unknown questions", () => {
      quizState.questions = [
        { id: "q1", question: "1?", answer: "1!" },
        { id: "q2", question: "2?", answer: "2!" },
      ];
      quizState.knownQuestionIds = new Set(["q1"]);

      quizState.startQuiz();

      expect(quizState.activeQuestion?.id).toBe("q2");
      expect(quizState.isQuizActive).toBe(true);
    });

    it("starts quiz picking any question if all are known", () => {
      quizState.questions = [
        { id: "q1", question: "1?", answer: "1!" }
      ];
      quizState.knownQuestionIds = new Set(["q1"]);

      quizState.startQuiz();

      expect(quizState.activeQuestion?.id).toBe("q1");
      expect(quizState.isQuizActive).toBe(true);
    });

    it("closes the quiz and clears active question asynchronously", () => {
      vi.useFakeTimers();

      quizState.questions = [
        { id: "q1", question: "1?", answer: "1!" }
      ];
      quizState.startQuiz();

      expect(quizState.isQuizActive).toBe(true);
      expect(quizState.activeQuestion).not.toBeNull();

      quizState.closeQuiz();

      expect(quizState.isQuizActive).toBe(false);
      expect(quizState.activeQuestion).not.toBeNull(); // Still there for animation

      vi.advanceTimersByTime(300);

      expect(quizState.activeQuestion).toBeNull();
    });
  });

  describe("Knowledge marking methods", () => {
    beforeEach(() => {
      quizState.activeQuestion = { id: "testId", question: "Q?", answer: "A!" };
      const saveProgressSpy = vi.spyOn(quizState, "saveProgress");
    });

    it("marks question as known and closes quiz", () => {
      const closeQuizSpy = vi.spyOn(quizState, "closeQuiz");
      const saveProgressSpy = vi.spyOn(quizState, "saveProgress");

      quizState.markKnown();

      expect(quizState.knownQuestionIds.has("testId")).toBe(true);
      expect(saveProgressSpy).toHaveBeenCalled();
      expect(closeQuizSpy).toHaveBeenCalled();

      closeQuizSpy.mockRestore();
      saveProgressSpy.mockRestore();
    });

    it("marks question as unknown and closes quiz", () => {
      const closeQuizSpy = vi.spyOn(quizState, "closeQuiz");

      quizState.markUnknown();

      expect(quizState.knownQuestionIds.has("testId")).toBe(false);
      expect(closeQuizSpy).toHaveBeenCalled();

      closeQuizSpy.mockRestore();
    });

    it("resets progress entirely", () => {
      const saveProgressSpy = vi.spyOn(quizState, "saveProgress");
      quizState.knownQuestionIds = new Set(["id1", "id2"]);

      quizState.resetProgress();

      expect(quizState.knownQuestionIds.size).toBe(0);
      expect(saveProgressSpy).toHaveBeenCalled();

      saveProgressSpy.mockRestore();
    });
  });

  describe("State export and import", () => {
    it("exports knownQuestionIds to a string", () => {
      quizState.knownQuestionIds = new Set(["idA", "idB"]);
      const exported = quizState.exportState();

      expect(exported).toBe('["idA","idB"]');
    });

    it("imports knownQuestionIds from a string", () => {
      const saveProgressSpy = vi.spyOn(quizState, "saveProgress");

      quizState.importState('["idX","idY"]');

      expect(quizState.knownQuestionIds.has("idX")).toBe(true);
      expect(quizState.knownQuestionIds.has("idY")).toBe(true);
      expect(quizState.knownQuestionIds.size).toBe(2);
      expect(saveProgressSpy).toHaveBeenCalled();

      saveProgressSpy.mockRestore();
    });

    it("handles parsing errors gracefully during importState", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      quizState.importState("{invalid json}");

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to import quiz state",
        expect.any(SyntaxError)
      );

      consoleErrorSpy.mockRestore();
    });
  });

});
