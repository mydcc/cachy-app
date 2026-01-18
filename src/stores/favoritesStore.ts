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

import { writable } from "svelte/store";
import { browser } from "$app/environment";

const STORE_KEY = "cachy_favorites";
const MAX_FAVORITES = 4;

function createFavoritesStore() {
  let initialValue: string[] = [];
  if (browser) {
    try {
      const stored = localStorage.getItem(STORE_KEY);
      if (stored) {
        initialValue = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to parse favorites from localStorage", e);
    }
  }

  const { subscribe, update } = writable<string[]>(initialValue);

  // Subscribe to changes to persist to localStorage
  subscribe((value) => {
    if (browser) {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(value));
      } catch (e) {
        console.warn("Could not save favorites to localStorage", e);
      }
    }
  });

  return {
    subscribe,
    toggleFavorite: (symbol: string) => {
      if (!symbol) return;
      const upperSymbol = symbol.toUpperCase();

      update((favorites) => {
        if (favorites.includes(upperSymbol)) {
          return favorites.filter((f) => f !== upperSymbol);
        } else {
          if (favorites.length >= MAX_FAVORITES) {
            // Limit reached, do not add
            // Optionally we could trigger a UI notification here, but keeping it simple for now
            return favorites;
          }
          return [...favorites, upperSymbol];
        }
      });
    },
  };
}

export const favoritesStore = createFavoritesStore();
