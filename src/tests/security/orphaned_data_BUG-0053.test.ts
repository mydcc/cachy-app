import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsManager } from '../../stores/settings.svelte';
import { CONSTANTS } from '../../lib/constants';

vi.mock("$app/environment", () => ({ browser: true, dev: true }));


let dbStorage: Record<string, string> = {};

vi.mock('../../services/cryptoService', () => {
  return {
    cryptoService: {
      getOrGenerateDeviceKey: vi.fn().mockImplementation(async (legacyKey, allowRegenerate) => {
         if (!dbStorage['device_key']) {
             if (!allowRegenerate) throw new Error("Device key not found in DB");
             dbStorage['device_key'] = "generated-key";
         }
         return dbStorage['device_key'];
      }),
      encrypt: vi.fn().mockImplementation(async (text) => {
        return {
            ciphertext: "enc:" + text,
            iv: 'mock-iv',
            salt: 'mock-salt',
            method: 'AES-GCM'
        };
      }),
      decrypt: vi.fn().mockImplementation(async (blob, key) => {
        if (!blob || !blob.ciphertext) throw new Error("Invalid blob");
        if (key !== "generated-key") throw new Error("Decryption failed");
        return blob.ciphertext.substring(4);
      }),
      unlockSession: vi.fn(async () => true),
      lockSession: vi.fn(),
      isUnlocked: vi.fn(() => true)
    }
  };
});


describe('BUG-0053: Orphaned Data Canary', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    dbStorage = {};
  });

  it('refuses to mint a replacement key when canary shows encryptedSecrets exists but cannot be opened', async () => {

    // Simulate setting up data
    dbStorage['device_key'] = "generated-key";

        // Simulate a manual save of a secret (since the internals are tricky to access)
    const initialData = {
        apiProvider: "bitunix",
        encryptedSecrets: {
            openaiApiKey: { ciphertext: "enc:my-api-key", iv: "", salt: "", method: "AES-GCM" }
        },
        deviceKeyCanary: { ciphertext: "enc:cachy_canary_v1", iv: "", salt: "", method: "AES-GCM" }
    };
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(initialData));

    // Clear the device key to simulate it being lost
    dbStorage = {};

    // Attempt to load settings
    const settingsNew = new SettingsManager();
    // Wait for the background decryption to attempt processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should populate decryptionFailures with the key
    expect(settingsNew.decryptionFailures.length).toBe(1);
    expect(settingsNew.decryptionFailures[0]).toBe('openaiApiKey');

    // Should NOT have generated a new device key
    expect(dbStorage['device_key']).toBeUndefined();
  });
});
