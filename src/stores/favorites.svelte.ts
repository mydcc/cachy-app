/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";
import { untrack } from "svelte";
import { settingsState, MAX_FAVORITE_SYMBOLS } from "./settings.svelte";
import { safeLocalStorage } from "../utils/storageWrapper";
import { stripLegacyVenueSuffix } from "../utils/symbolUtils";

/**
 * Legacy storage key. Read once for migration, then left in place -- deleting a
 * user's only copy of their data to tidy up is not a trade worth making.
 */
const LEGACY_STORE_KEY = "cachy_favorites";
const MIGRATION_FLAG_KEY = "cachy_favorites_migrated_v1";

const DEFAULT_FAVORITES = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];

/**
 * Favourites, backed by `settingsState.favoriteSymbols`.
 *
 * This class used to own a SECOND list in its own localStorage key, capped at
 * 4, while the symbol picker and the Market Dashboard wrote to and read from
 * `settingsState.favoriteSymbols` (capped at 12). The analyst rotated over this
 * one; the dashboard rendered that one. Adding a favourite in Settings
 * therefore had no effect on what got analysed, and the dashboard listed
 * symbols that would never receive a score (BUG-0232).
 *
 * It is now a thin view over the settings list. `items` deliberately stays a
 * property rather than becoming a method, so the ~8 existing call sites keep
 * working unchanged -- and because it reads a `$state` field, reactivity
 * propagates exactly as before.
 */
class FavoritesManager {
  constructor() {
    if (!browser) return;
    try {
      this.migrateLegacyStore();
      if (this.items.length === 0) {
        this.items = [...DEFAULT_FAVORITES];
      }
    } catch (e) {
      // Construction happens at module import, so anything thrown here takes
      // down every module that transitively imports favourites. Degrade to an
      // empty list instead.
      console.warn("Favorites initialisation failed", e);
    }
  }

  /**
   * Always an array. Callers do `.some()`, `.slice()` and `.includes()` on this
   * without guarding, and the field can legitimately be absent -- during SSR,
   * before settings finish loading, or under a partial test mock.
   */
  get items(): string[] {
    return settingsState.favoriteSymbols ?? [];
  }

  set items(value: string[]) {
    settingsState.favoriteSymbols = (value ?? []).slice(0, MAX_FAVORITE_SYMBOLS);
  }

  /**
   * Fold a pre-consolidation `cachy_favorites` list into the settings list.
   *
   * Two cases, deliberately handled differently:
   *
   * - The settings list is still the untouched factory default. That is a
   *   placeholder, not a choice, so the legacy list REPLACES it. Merging here
   *   would hand the user four symbols they never picked.
   * - The settings list has been edited. Then both lists are curated and which
   *   was edited last is not recoverable, so UNION them. Inheriting one extra
   *   favourite beats silently dropping one.
   */
  private migrateLegacyStore() {
    try {
      if (safeLocalStorage.getItem(MIGRATION_FLAG_KEY)) return;

      const stored = safeLocalStorage.getItem(LEGACY_STORE_KEY);
      safeLocalStorage.setItem(MIGRATION_FLAG_KEY, "1");
      if (!stored) return;

      const legacy = JSON.parse(stored)
        .filter((s: unknown): s is string => typeof s === "string")
        .map((s: string) => s.toUpperCase());
      if (!Array.isArray(legacy) || legacy.length === 0) return;

      const current = this.items;
      const isUntouchedDefault =
        current.length === DEFAULT_FAVORITES.length &&
        current.every((s, i) => s === DEFAULT_FAVORITES[i]);

      if (isUntouchedDefault) {
        this.items = legacy;
        return;
      }

      const merged = [...current];
      for (const symbol of legacy) {
        if (!merged.includes(symbol) && merged.length < MAX_FAVORITE_SYMBOLS) {
          merged.push(symbol);
        }
      }
      this.items = merged;
    } catch (e) {
      console.warn("Could not migrate legacy favorites", e);
    }
  }

  /**
   * Whether a symbol is favourited, matching across the legacy suffix.
   *
   * BUG-0599. Favourites written while Bitget symbols carried the V1 `_UMCBL`
   * suffix are still in the settings list, and the symbols arriving from the UI
   * no longer carry it. A plain `includes` therefore reports an existing
   * favourite as absent — and `toggleFavorite` would then append a second
   * entry instead of removing the first, leaving the original unreachable.
   */
  has(symbol: string): boolean {
    if (!symbol) return false;
    const wanted = stripLegacyVenueSuffix(symbol.toUpperCase());
    return this.items.some((f) => stripLegacyVenueSuffix(f.toUpperCase()) === wanted);
  }

  toggleFavorite(symbol: string) {
    if (!symbol) return;
    const upperSymbol = symbol.toUpperCase();
    const current = this.items;

    // Compared through the same canonical form as `has`, so an entry stored
    // under the legacy suffix toggles off instead of duplicating.
    if (this.has(upperSymbol)) {
      const wanted = stripLegacyVenueSuffix(upperSymbol);
      this.items = current.filter(
        (f) => stripLegacyVenueSuffix(f.toUpperCase()) !== wanted,
      );
      return;
    }

    if (current.length >= MAX_FAVORITE_SYMBOLS) {
      // Limit reached
      return;
    }
    this.items = [...current, upperSymbol];
  }

  // Compatibility
  subscribe(fn: (value: string[]) => void) {
    let localTimer: ReturnType<typeof setTimeout> | null = null;
    fn(this.items);
    const cleanup = $effect.root(() => {
      $effect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- bare read registers the $effect dependency
        this.items; // Track
        untrack(() => {
          if (localTimer) clearTimeout(localTimer);
          localTimer = setTimeout(() => {
            fn(this.items);
            localTimer = null;
          }, 20);
        });
      });
    });
    return () => {
      cleanup();
      if (localTimer) clearTimeout(localTimer);
    };
  }
}

export const favoritesState = new FavoritesManager();
