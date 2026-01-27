
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsManager } from './settings.svelte';
import { cryptoService } from '../services/cryptoService';

// Mock browser environment
vi.mock('$app/environment', () => ({
    browser: true
}));

vi.mock('../services/cryptoService', () => ({
    cryptoService: {
        unlockSession: vi.fn().mockResolvedValue(true),
        lockSession: vi.fn(),
        encrypt: vi.fn().mockResolvedValue({ ciphertext: "encrypted", iv: "iv", salt: "salt", method: "AES-GCM" }),
        decrypt: vi.fn().mockResolvedValue('{"key":"decrypted-key","secret":"decrypted-secret"}')
    }
}));

const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => { store[key] = value }),
        clear: vi.fn(() => { store = {} }),
        removeItem: vi.fn((key: string) => { delete store[key] })
    };
})();

// Global setup
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

describe('SettingsManager Security', () => {
    let settingsState: SettingsManager;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorageMock.clear();
        settingsState = new SettingsManager();
    });

    it('should initially be unencrypted and unlocked (default)', () => {
        expect(settingsState.isEncrypted).toBe(false);
        expect(settingsState.isLocked).toBe(false);
    });

    it('should encrypt keys when setMasterPassword is called', async () => {
        // Setup initial plain keys
        settingsState.apiKeys.bitunix = { key: "plain", secret: "plain" };

        await settingsState.setMasterPassword("password123");

        expect(cryptoService.unlockSession).toHaveBeenCalledWith("password123");
        expect(cryptoService.encrypt).toHaveBeenCalledTimes(2);
        expect(settingsState.isEncrypted).toBe(true);
        expect(settingsState.encryptedApiKeys).toBeDefined();
    });

    it('should NOT serialize plain keys when encrypted', () => {
        settingsState.isEncrypted = true;
        settingsState.apiKeys.bitunix = { key: "secret", secret: "secret" };

        const json = settingsState.toJSON();

        expect(json.apiKeys.bitunix.key).toBe("");
        expect(json.isEncrypted).toBe(true);
    });

    it('should lock the session and clear memory', () => {
        settingsState.isEncrypted = true;
        settingsState.apiKeys.bitunix = { key: "secret", secret: "secret" };

        settingsState.lock();

        expect(settingsState.isLocked).toBe(true);
        expect(settingsState.apiKeys.bitunix.key).toBe("");
    });

    it('should unlock and restore keys', async () => {
        // Setup state with encrypted blob
        settingsState.isEncrypted = true;
        settingsState.encryptedApiKeys = {
            bitunix: { ciphertext: "abc", iv: "iv", salt: "s", method: "AES-GCM" }
        };
        settingsState.lock();

        const result = await settingsState.unlock("password123");

        expect(result).toBe(true);
        expect(cryptoService.decrypt).toHaveBeenCalled();
        expect(settingsState.apiKeys.bitunix.key).toBe("decrypted-key");
    });
});
