import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { CONSTANTS } from '../lib/constants';

// We need to mock $app/environment before importing settingsStore
vi.mock('$app/environment', () => ({
    browser: true
}));

// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key: string) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        }),
        _reset: () => { store = {}; }
    };
})();

Object.defineProperty(window, 'localStorage', {
    value: localStorageMock
});

describe('settingsStore', async () => {
    // Import dynamically after mocking environment and localStorage
    const { settingsStore } = await import('./settingsStore');

    beforeEach(() => {
        localStorageMock._reset();
        vi.clearAllMocks();
    });

    it('should initialize with default settings when localStorage is empty', () => {
        // Since store is singleton and already initialized on import,
        // we might test default values.
        // Note: For a true init test we'd need to re-import or isolate modules,
        // but checking default state is okay.

        // If the store was initialized with empty localStorage (which it was in the import above if not present),
        // it should have defaults.
        const current = get(settingsStore);
        expect(current.disclaimerAccepted).toBe(false);
    });

    it('should update and persist disclaimerAccepted', () => {
        settingsStore.update(s => ({ ...s, disclaimerAccepted: true }));

        const current = get(settingsStore);
        expect(current.disclaimerAccepted).toBe(true);

        // Verify persistence
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
            CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
            expect.stringContaining('"disclaimerAccepted":true')
        );
    });

    it('should preserve other settings when updating', () => {
        settingsStore.update(s => ({ ...s, isPro: true }));
        settingsStore.update(s => ({ ...s, disclaimerAccepted: true }));

        const current = get(settingsStore);
        expect(current.isPro).toBe(true);
        expect(current.disclaimerAccepted).toBe(true);
    });
});
