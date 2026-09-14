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
 * Shared pattern-favorites state. Replaces the copied `favorites` /
 * `toggleFavorite` blocks in ChartPatternsView.svelte
 * (`chart_pattern_favorites`) and CandlestickPatternsView.svelte
 * (`candlestick_favorites`). Keys stay separate — no migration needed.
 */

import { browser } from "$app/environment";
import { safeJsonParse } from "../../utils/safeJson";

class PatternFavoritesState {
   favorites = $state<Set<string>>(new Set());
   readonly storageKey: string;

   constructor(storageKey: string) {
      this.storageKey = storageKey;
      if (!browser) return;
      try {
         const stored = localStorage.getItem(storageKey);
         if (stored) {
            const parsed = safeJsonParse(stored);
            if (Array.isArray(parsed)) {
               this.favorites = new Set(parsed.filter((id) => typeof id === "string"));
            }
         }
      } catch {
         // Corrupt storage — fall back to empty rather than crashing.
         this.favorites = new Set();
      }
   }

   toggle(id: string) {
      const next = new Set(this.favorites);
      if (next.has(id)) {
         next.delete(id);
      } else {
         next.add(id);
      }
      this.favorites = next;
      if (!browser) return;
      try {
         localStorage.setItem(this.storageKey, JSON.stringify([...next]));
      } catch {
         // Storage full or blocked — the in-memory set still works.
      }
   }
}

/** Creates isolated favorites state bound to one `localStorage` key. */
export function createPatternFavorites(storageKey: string): PatternFavoritesState {
   return new PatternFavoritesState(storageKey);
}

export type { PatternFavoritesState };
