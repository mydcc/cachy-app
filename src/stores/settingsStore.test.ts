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
        const current = get(settingsStore);
        expect(current.disclaimerAccepted).toBe(false);
        expect(current.accountTier).toBe('free'); // Check new default
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
        // Use new accountTier instead of isPro
        settingsStore.update(s => ({ ...s, accountTier: 'pro' }));
        settingsStore.update(s => ({ ...s, disclaimerAccepted: true }));

        const current = get(settingsStore);
        expect(current.accountTier).toBe('pro');
        expect(current.disclaimerAccepted).toBe(true);
    });
});
