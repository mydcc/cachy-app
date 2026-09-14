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

/*
 * Flashcard deck registry. Today there is exactly one deck; the registry is
 * the seam that makes a second one a data entry, not a code change. Each deck
 * names its own German/English CSV, so the quiz never hardcodes a path or a
 * category name again.
 */

import { CONSTANTS } from "../constants";

export type QuizDeckId = "trading";

export interface QuizDeck {
   id: QuizDeckId;
   /** Translation key for the deck's display name (used when >1 deck exists). */
   labelKey: string;
   csv: {
      en: string;
      de: string;
   };
}

export const QUIZ_DECKS: readonly QuizDeck[] = [
   {
      id: "trading",
      labelKey: "quiz.categoryTrading",
      csv: {
         en: CONSTANTS.FLASHCARDS_TRADING_CSV_PATH_EN,
         de: CONSTANTS.FLASHCARDS_TRADING_CSV_PATH_DE,
      },
   },
];

export const DEFAULT_QUIZ_DECK_ID: QuizDeckId = "trading";

/** True for deck ids that are currently registered. */
export function isQuizDeckId(value: unknown): value is QuizDeckId {
   return typeof value === "string" && QUIZ_DECKS.some((deck) => deck.id === value);
}
