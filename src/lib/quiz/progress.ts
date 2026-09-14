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
 * Quiz progress for the current deck. Kept as a plain function (no store, no
 * runes) so the counting rule is unit-testable and the side-panel bar, the
 * store and any future UI all share one definition of "known".
 *
 * Only ids present in the loaded deck count: persisted ids from older quiz
 * versions (which were derived from the question text) or from other decks
 * are ignored instead of inflating the bar.
 */

export interface QuizProgress {
   total: number;
   known: number;
   open: number;
   percent: number;
}

export function computeQuizProgress(
   cards: readonly { id: string }[],
   knownIds: ReadonlySet<string>,
): QuizProgress {
   const total = cards.length;
   let known = 0;
   for (const card of cards) {
      if (knownIds.has(card.id)) known++;
   }
   const open = total - known;
   const percent = total === 0 ? 0 : Math.round((known / total) * 100);
   return { total, known, open, percent };
}
