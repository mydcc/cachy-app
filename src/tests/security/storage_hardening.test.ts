// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsManager } from '../../stores/settings.svelte';
import { CONSTANTS } from '../../lib/constants';

// Mock environment
vi.mock("$app/environment", () => ({ browser: true, dev: true }));

// Mock CryptoService
let isSessionUnlocked = false;
vi.mock('../../services/cryptoService', () => {
  return {
    cryptoService: {
      encrypt: vi.fn(async (text: string, pwd?: string) => {
        if (!pwd && !isSessionUnlocked) throw new Error("Session locked and no password provided");
        // Use a safe separator
        return {
            ciphertext: `ENC|||${text}|||KEY|||${pwd || 'SESSION'}`,
            iv: 'mock-iv',
            salt: 'mock-salt',
            method: 'AES-GCM'
        };
      }),
      decrypt: vi.fn(async (blob: any, pwd?: string) => {
        if (!blob || !blob.ciphertext) throw new Error("Invalid blob");
        const parts = blob.ciphertext.split('|||');
        // parts[1] is text
        return parts[1];
      }),
      unlockSession: vi.fn(async (pwd: string) => {
        isSessionUnlocked = true;
        return true;
      }),
      lockSession: vi.fn(() => {
        isSessionUnlocked = false;
      }),
      isUnlocked: vi.fn(() => isSessionUnlocked)
    }
  };
});

describe('Security Fix: Secure Storage of Secrets', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    isSessionUnlocked = false;
  });

  it('should encrypt sensitive keys using Device Key when no Master Password is set', async () => {
    const settings = new SettingsManager();
    settings.openaiApiKey = "sk-test-1234567890";
    settings.apiProvider = "bitunix";

    (settings as any).effectActive = true;
    await (settings as any).save();

    const storedJson = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
    expect(storedJson).toBeTruthy();
    const stored = JSON.parse(storedJson!);

    expect(stored.openaiApiKey).toBe("");
    expect(stored.encryptedSecrets).toBeDefined();
    expect(stored.encryptedSecrets.openaiApiKey).toBeDefined();
    expect(stored.encryptedSecrets.openaiApiKey.ciphertext).toContain("ENC|||sk-test-1234567890|||KEY|||");
    expect(stored.encryptedSecrets.openaiApiKey.ciphertext).not.toContain("KEY|||SESSION");

    expect(stored.apiProvider).toBe("bitunix");
    expect(localStorage.getItem("cachy_device_id")).toBeTruthy();
  });

  it('should restore sensitive keys using Device Key on load', async () => {
    const deviceKey = "mock-device-key";
    localStorage.setItem("cachy_device_id", deviceKey);

    const initialData = {
        apiProvider: "bitunix",
        encryptedSecrets: {
            openaiApiKey: { ciphertext: "ENC|||sk-secret-restore|||KEY|||" + deviceKey, iv: "", salt: "", method: "AES-GCM" }
        }
    };
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(initialData));

    const settingsNew = new SettingsManager();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(settingsNew.openaiApiKey).toBe("sk-secret-restore");
  });

  it('should re-encrypt secrets when setting Master Password', async () => {
    const settings = new SettingsManager();
    settings.openaiApiKey = "sk-moving-to-secure";
    (settings as any).effectActive = true;
    await (settings as any).save();

    await settings.setMasterPassword("StrongPass123!");

    expect(settings.isEncrypted).toBe(true);

    const storedJson = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
    const stored = JSON.parse(storedJson!);

    // Should now be encrypted with SESSION key
    expect(stored.encryptedSecrets.openaiApiKey.ciphertext).toContain("KEY|||SESSION");
    expect(stored.openaiApiKey).toBe("");

    settings.lock();
    expect(settings.openaiApiKey).toBe("");

    await settings.unlock("StrongPass123!");
    expect(settings.openaiApiKey).toBe("sk-moving-to-secure");
  });

  it('should not save plain text if saving while locked', async () => {
      const settings = new SettingsManager();
      settings.openaiApiKey = "sk-initial";
      (settings as any).effectActive = true;
      await settings.setMasterPassword("pass");

      settings.lock();
      expect(settings.openaiApiKey).toBe("");

      settings.apiProvider = "bitget";
      await (settings as any).save();

      const storedJson = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
      const stored = JSON.parse(storedJson!);

      expect(stored.openaiApiKey).toBe("");
      expect(stored.apiProvider).toBe("bitget");

      expect(stored.encryptedSecrets.openaiApiKey).toBeDefined();
      expect(stored.encryptedSecrets.openaiApiKey.ciphertext).toContain("KEY|||SESSION");
  });
});
