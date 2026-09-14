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
 * Content contract for the quiz decks. Decks grow over time, so this pins the
 * parts that are expensive to repair later: ids are well-formed and unique,
 * German and English carry the same id set, and no field is empty. A bad deck
 * fails `npm test` instead of surfacing as lost progress in the UI.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUIZ_DECKS } from "./decks";
import { parseDeckCsv } from "./parse";

const ROOT = process.cwd();
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readDeck(publicPath: string) {
   const rel = publicPath.replace(/^\//, "");
   const file = path.join(ROOT, "static", rel);
   expect(existsSync(file), `missing deck file ${rel}`).toBe(true);
   return parseDeckCsv(readFileSync(file, "utf-8"));
}

describe("quiz deck registry", () => {
   it("has unique deck ids", () => {
      const ids = QUIZ_DECKS.map((deck) => deck.id);
      expect(new Set(ids).size).toBe(ids.length);
   });

   for (const deck of QUIZ_DECKS) {
      describe(`deck '${deck.id}'`, () => {
         it("loads both language files with cards", () => {
            expect(readDeck(deck.csv.en).length).toBeGreaterThan(0);
            expect(readDeck(deck.csv.de).length).toBeGreaterThan(0);
         });

         it("uses well-formed, unique ids in both languages", () => {
            for (const csvPath of [deck.csv.en, deck.csv.de]) {
               const ids = readDeck(csvPath).map((card) => card.id);
               expect(new Set(ids).size, `duplicate ids in ${csvPath}`).toBe(
                  ids.length,
               );
               for (const id of ids) {
                  expect(id, `${id} in ${csvPath}`).toMatch(ID_PATTERN);
               }
            }
         });

         it("parses every data row", () => {
            for (const csvPath of [deck.csv.en, deck.csv.de]) {
               const rel = csvPath.replace(/^\//, "");
               const raw = readFileSync(path.join(ROOT, "static", rel), "utf-8")
                  .split("\n")
                  .filter((line) => line.trim().length > 0);
               expect(readDeck(csvPath).length, `${rel} rows`).toBe(
                  raw.length - 1,
               );
            }
         });

         it("keeps German and English ids in sync", () => {
            const en = readDeck(deck.csv.en)
               .map((card) => card.id)
               .sort();
            const de = readDeck(deck.csv.de)
               .map((card) => card.id)
               .sort();
            expect(de).toEqual(en);
         });

         it("has no empty question or answer", () => {
            for (const csvPath of [deck.csv.en, deck.csv.de]) {
               for (const card of readDeck(csvPath)) {
                  expect(card.question.length, `${card.id} question`).toBeGreaterThan(0);
                  expect(card.answer.length, `${card.id} answer`).toBeGreaterThan(0);
               }
            }
         });
      });
   }
});
