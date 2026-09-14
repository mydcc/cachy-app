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

import type { FlashCard } from "./types";

/*
 * Deck CSV parsing, kept free of the store so it is unit-testable and so the
 * content check reads decks exactly the way the app does.
 *
 * Format: an `id,question,answer` header followed by one card per line. Rows
 * with a missing id or fewer than three fields are dropped rather than
 * guessed at.
 */

// Matches a comma only if the rest of the line holds an even number of
// quotes, i.e. the comma is not inside a quoted field.
const CSV_SEPARATOR = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

function unquote(value: string): string {
   if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1).replace(/""/g, '"');
   }
   return value;
}

export function parseDeckCsv(text: string): FlashCard[] {
   const lines = text.split("\n").filter((l) => l.trim().length > 0);
   const cards: FlashCard[] = [];

   lines.forEach((line, index) => {
      // Header row ("id,question,answer").
      if (index === 0 && line.split(CSV_SEPARATOR)[0]?.trim().toLowerCase() === "id") {
         return;
      }

      const parts = line.split(CSV_SEPARATOR);
      if (parts.length < 3) return;

      const id = parts[0].trim();
      if (!id) return;

      cards.push({
         id,
         question: unquote(parts[1].trim()),
         answer: unquote(parts[2].trim()),
      });
   });

   return cards;
}
