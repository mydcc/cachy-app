import { writable } from 'svelte/store';

const STORAGE_KEY = 'cachy_favorites';
const MAX_FAVORITES = 4;

function createFavoritesStore() {
    // Initial load from localStorage
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const initial: string[] = stored ? JSON.parse(stored) : [];

    const { subscribe, update } = writable<string[]>(initial);

    return {
        subscribe,
        toggleFavorite: (symbol: string) => {
            if (!symbol) return;
            // Normalize symbol (uppercase) for consistency
            const s = symbol.toUpperCase();
            
            update(favorites => {
                let newFavorites;
                if (favorites.includes(s)) {
                    // Remove if exists
                    newFavorites = favorites.filter(f => f !== s);
                } else {
                    // Add if not exists and limit not reached
                    if (favorites.length >= MAX_FAVORITES) {
                        // User requirement said "up to 4", implies hard limit.
                        return favorites;
                    }
                    newFavorites = [...favorites, s];
                }
                
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
                }
                return newFavorites;
            });
        },
        removeFavorite: (symbol: string) => {
             update(favorites => {
                const newFavorites = favorites.filter(f => f !== symbol.toUpperCase());
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
                }
                return newFavorites;
             });
        }
    };
}

export const favoritesStore = createFavoritesStore();
