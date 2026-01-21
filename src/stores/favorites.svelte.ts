/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

const STORE_KEY = "cachy_favorites";
const MAX_FAVORITES = 4;

class FavoritesManager {
    items = $state<string[]>([]);

    constructor() {
        if (browser) {
            this.load();
            // If we have no favorites at all, or it's the first time (initially null/empty), set defaults.
            if (!this.items || this.items.length === 0) {
                this.items = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "LINKUSDT"];
                this.save();
            }
        }
    }

    private load() {
        try {
            const stored = localStorage.getItem(STORE_KEY);
            if (stored) {
                this.items = JSON.parse(stored);
            }
        } catch (e) {
            console.error("Failed to parse favorites from localStorage", e);
        }
    }

    private save() {
        if (!browser) return;
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(this.items));
        } catch (e) {
            console.warn("Could not save favorites to localStorage", e);
        }
    }

    toggleFavorite(symbol: string) {
        if (!symbol) return;
        const upperSymbol = symbol.toUpperCase();

        if (this.items.includes(upperSymbol)) {
            this.items = this.items.filter((f) => f !== upperSymbol);
        } else {
            if (this.items.length >= MAX_FAVORITES) {
                // Limit reached
                return;
            }
            this.items = [...this.items, upperSymbol];
        }
        this.save();
    }

    // Compatibility
    subscribe(fn: (value: string[]) => void) {
        fn(this.items);
        return $effect.root(() => {
            $effect(() => {
                fn(this.items);
            });
        });
    }
}

export const favoritesState = new FavoritesManager();
