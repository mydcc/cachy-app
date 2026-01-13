import { describe, it, expect, beforeEach, vi } from 'vitest';
import { restoreFromBackup } from './backupService';
import { CONSTANTS } from '../lib/constants';

// Mock the SvelteKit environment module
vi.mock('$app/environment', () => ({
  browser: true,
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: () => {
      store = {};
    },
    getStore: () => store,
  };
})();

// Ensure global localStorage is available for the service
global.localStorage = localStorageMock as any;

// In some JSDOM environments, window.localStorage is read-only.
// We try to override it if possible, otherwise we might need to mock directly in the SUT or use a different approach.
try {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true // Ensure writable
  });
} catch (e) {
  console.warn("Could not define property localStorage on window", e);
}

// Mock for createObjectURL and revokeObjectURL
Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn() });
Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn() });


describe('backupService', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('restoreFromBackup', () => {
    it('should successfully restore a valid backup file', () => {
      const backupContent = JSON.stringify({
        backupVersion: 1,
        appName: 'R-Calculator',
        data: {
          settings: '{"theme":"dark"}',
          presets: '{"myPreset":{}}',
          journal: '[{"id":1}]',
        },
      });

      const result = restoreFromBackup(backupContent);
      expect(result.success).toBe(true);
      expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY)).toBe('{"theme":"dark"}');
      expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY)).toBe('{"myPreset":{}}');
      expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY)).toBe('[{"id":1}]');
    });

    it('should fail if the JSON is invalid', () => {
      // Mock console.error to suppress expected error output
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = restoreFromBackup('not a json');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not a valid backup file');
      expect(Object.keys(localStorageMock.getStore()).length).toBe(0);

      consoleSpy.mockRestore();
    });

    it('should fail if the app name is incorrect', () => {
      const backupContent = JSON.stringify({
        backupVersion: 1,
        appName: 'WrongApp',
        data: {},
      });
      const result = restoreFromBackup(backupContent);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not for this application');
    });

    it('should fail if the backup version is unsupported', () => {
      const backupContent = JSON.stringify({
        backupVersion: 99,
        appName: 'R-Calculator',
        data: {},
      });
      const result = restoreFromBackup(backupContent);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported backup version');
    });

    it('should fail if the data object is missing', () => {
      const backupContent = JSON.stringify({
        backupVersion: 1,
        appName: 'R-Calculator',
      });
      const result = restoreFromBackup(backupContent);
      expect(result.success).toBe(false);
      expect(result.message).toContain('Missing data');
    });

    it('should handle missing non-critical data gracefully', () => {
        const backupContent = JSON.stringify({
            backupVersion: 1,
            appName: 'R-Calculator',
            data: {
              settings: '{"theme":"light"}',
              presets: null, // Presets are missing
              journal: null, // Journal is missing
            },
          });

          const result = restoreFromBackup(backupContent);
          expect(result.success).toBe(true);
          expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY)).toBe('{"theme":"light"}');
          expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY)).toBeNull();
          expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY)).toBeNull();
    });
  });

  // Note: createBackup is harder to test in JSDOM because it involves DOM manipulation
  // (creating a link and clicking it) and Blob/URL APIs that might not be fully implemented.
  // The core logic of restoreFromBackup is the most critical to test.
});
