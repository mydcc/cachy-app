/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

/**
 * Centralized localStorage wrapper with error handling and quota management.
 * 
 * Benefits:
 * - Consistent error handling across the app
 * - QuotaExceededError detection and user feedback
 * - Safe fallback for SSR/non-browser environments
 * - Centralized logging for debugging
 */

export interface StorageOptions {
    /** Show UI error notification on failure (requires uiState) */
    showError?: boolean;
    /** Silent mode - suppress console logging */
    silent?: boolean;
}

class SafeLocalStorage {
    /**
     * Safely retrieve an item from localStorage
     * @param key Storage key
     * @param options Optional configuration
     * @returns The stored value or null if not found/error
     */
    getItem(key: string, options: StorageOptions = {}): string | null {
        if (!browser) return null;

        try {
            return localStorage.getItem(key);
        } catch (e) {
            if (!options.silent) {
                console.error('[Storage] Failed to read:', key, e);
            }
            return null;
        }
    }

    /**
     * Safely store an item in localStorage
     * @param key Storage key
     * @param value Value to store
     * @param options Optional configuration
     * @returns true if successful, false otherwise
     */
    setItem(key: string, value: string, options: StorageOptions = {}): boolean {
        if (!browser) return false;

        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                console.error('[Storage] Quota exceeded for key:', key);
                console.error('[Storage] Current usage:', this.getUsageInfo());

                if (options.showError) {
                    // Dynamically import to avoid circular dependency
                    import('../stores/ui.svelte').then(({ uiState }) => {
                        uiState.showError(
                            'Speicher voll! Bitte löschen Sie alte Daten oder erstellen Sie ein Backup.'
                        );
                    });
                }
            } else {
                if (!options.silent) {
                    console.error('[Storage] Failed to write:', key, e);
                }
            }
            return false;
        }
    }

    /**
     * Safely remove an item from localStorage
     * @param key Storage key
     * @param options Optional configuration
     * @returns true if successful, false otherwise
     */
    removeItem(key: string, options: StorageOptions = {}): boolean {
        if (!browser) return false;

        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            if (!options.silent) {
                console.error('[Storage] Failed to remove:', key, e);
            }
            return false;
        }
    }

    /**
     * Clear all items from localStorage
     * @param options Optional configuration
     * @returns true if successful, false otherwise
     */
    clear(options: StorageOptions = {}): boolean {
        if (!browser) return false;

        try {
            localStorage.clear();
            return true;
        } catch (e) {
            if (!options.silent) {
                console.error('[Storage] Failed to clear:', e);
            }
            return false;
        }
    }

    /**
     * Get storage usage information
     * @returns Object with usage stats
     */
    getUsageInfo(): { totalKeys: number; estimatedSize: number; keys: string[] } {
        if (!browser) {
            return { totalKeys: 0, estimatedSize: 0, keys: [] };
        }

        try {
            const keys = Object.keys(localStorage);
            let estimatedSize = 0;

            for (const key of keys) {
                const value = localStorage.getItem(key);
                if (value) {
                    // Rough estimate: key + value length in bytes (UTF-16)
                    estimatedSize += (key.length + value.length) * 2;
                }
            }

            return {
                totalKeys: keys.length,
                estimatedSize,
                keys
            };
        } catch (e) {
            console.error('[Storage] Failed to get usage info:', e);
            return { totalKeys: 0, estimatedSize: 0, keys: [] };
        }
    }

    /**
     * Check if localStorage is available and working
     * @returns true if localStorage is functional
     */
    isAvailable(): boolean {
        if (!browser) return false;

        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get estimated available space (rough approximation)
     * Most browsers have ~5-10MB limit
     * @returns Estimated available bytes
     */
    getEstimatedAvailableSpace(): number {
        const TYPICAL_LIMIT = 5 * 1024 * 1024; // 5MB
        const usage = this.getUsageInfo();
        return Math.max(0, TYPICAL_LIMIT - usage.estimatedSize);
    }
}

export const safeLocalStorage = new SafeLocalStorage();
