// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SettingsManager } from "./settings.svelte";
import { cryptoService } from "../services/cryptoService";

// Mock browser environment
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("../services/cryptoService", () => ({
  cryptoService: {
    unlockSession: vi.fn().mockResolvedValue(true),
    lockSession: vi.fn(),
    isUnlocked: vi.fn().mockReturnValue(true),
    encrypt: vi
      .fn()
      .mockResolvedValue({
        ciphertext: "encrypted",
        iv: "iv",
        salt: "salt",
        method: "AES-GCM",
      }),
    decrypt: vi
      .fn()
      .mockResolvedValue('{"key":"decrypted-key","secret":"decrypted-secret"}'),
    getOrGenerateDeviceKey: vi
      .fn()
      .mockResolvedValue({ algorithm: { name: "PBKDF2" } } as unknown as CryptoKey),
  },
}));

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
  };
})();

// Global setup
Object.defineProperty(global, "localStorage", { value: localStorageMock });

describe("SettingsManager Security", () => {
  let settingsState: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    settingsState = new SettingsManager();
  });

  it("should initially be unencrypted and unlocked (default)", () => {
    expect(settingsState.isEncrypted).toBe(false);
    expect(settingsState.isLocked).toBe(false);
  });

  it("should encrypt keys when setMasterPassword is called", async () => {
    // Setup initial plain keys
    settingsState.apiKeys.bitunix = { key: "plain", secret: "plain" };

    await settingsState.setMasterPassword("password123");

    expect(cryptoService.unlockSession).toHaveBeenCalledWith("password123");
    expect(cryptoService.encrypt).toHaveBeenCalled();
    expect(settingsState.isEncrypted).toBe(true);
    expect(settingsState.encryptedApiKeys).toBeDefined();
  });

  it("should NOT serialize plain keys when encrypted", () => {
    settingsState.isEncrypted = true;
    settingsState.apiKeys.bitunix = { key: "secret", secret: "secret" };

    const json = settingsState.toJSON();

    expect(json.apiKeys.bitunix.key).toBe("");
    expect(json.isEncrypted).toBe(true);
  });

  it("should lock the session and clear memory", () => {
    settingsState.isEncrypted = true;
    settingsState.apiKeys.bitunix = { key: "secret", secret: "secret" };

    settingsState.lock();

    expect(settingsState.isLocked).toBe(true);
    expect(settingsState.apiKeys.bitunix.key).toBe("");
  });

  it("should unlock and restore keys", async () => {
    // Setup state with encrypted blob
    settingsState.isEncrypted = true;
    settingsState.encryptedApiKeys = {
      bitunix: { ciphertext: "abc", iv: "iv", salt: "s", method: "AES-GCM" },
    };
    settingsState.lock();

    const result = await settingsState.unlock("password123");

    expect(result).toBe(true);
    expect(cryptoService.decrypt).toHaveBeenCalled();
    expect(settingsState.apiKeys.bitunix.key).toBe("decrypted-key");
  });
});

/**
 * BUG-0280: exchange API keys bypassed the device-key encryption path and
 * sat in localStorage as plaintext whenever no master password was set.
 * These tests pin the fixed behaviour: nothing readable ever reaches
 * storage, legacy plaintext blobs are migrated on load, and a reload
 * restores the credentials from their device-key-encrypted blobs.
 */
describe("SettingsManager exchange-key encryption at rest (BUG-0280)", () => {
  const STORAGE_KEY = "cryptoCalculatorSettings";
  let settingsState: SettingsManager;

  const saveInternal = (mgr: SettingsManager) =>
    (mgr as unknown as { save(): Promise<void> }).save();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    settingsState = new SettingsManager();
  });

  it("reproduces the defect: saving without a master password must not persist plaintext exchange credentials", async () => {
    settingsState.apiKeys.bitunix = { key: "bu-key", secret: "bu-secret" };
    settingsState.apiKeys.bitget = {
      key: "bg-key",
      secret: "bg-secret",
      passphrase: "bg-pass",
    };

    await saveInternal(settingsState);

    const stored = localStorageMock.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("bu-key");
    expect(stored).not.toContain("bg-secret");
    expect(stored).not.toContain("bg-pass");
    const parsed = JSON.parse(stored!) as {
      encryptedApiKeys?: Record<string, unknown>;
    };
    expect(parsed.encryptedApiKeys?.bitunix).toBeDefined();
    expect(parsed.encryptedApiKeys?.bitget).toBeDefined();
  });

  it("never serializes key or secret material into toJSON(), even unencrypted", () => {
    settingsState.apiKeys.bitunix = { key: "k1", secret: "s1" };
    settingsState.apiKeys.bitget = { key: "k2", secret: "s2", passphrase: "p2" };

    const json = settingsState.toJSON();

    expect(json.apiKeys.bitunix.key).toBe("");
    expect(json.apiKeys.bitunix.secret).toBe("");
    expect(json.apiKeys.bitget.key).toBe("");
    expect(json.apiKeys.bitget.passphrase).toBe("");
    expect(JSON.stringify(json)).not.toContain("s1");
    expect(JSON.stringify(json)).not.toContain("s2");
  });

  it("migrates legacy plaintext exchange keys to ciphertext on load", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitunix",
        apiKeys: { bitunix: { key: "legacy-key", secret: "legacy-secret" } },
      }),
    );

    const fresh = new SettingsManager();

    // Keys remain usable in memory ...
    expect(fresh.apiKeys.bitunix.key).toBe("legacy-key");

    // ... and the one-time migration re-persists them encrypted.
    await vi.waitFor(() => {
      const stored = localStorageMock.getItem(STORAGE_KEY);
      expect(stored).toContain("encryptedApiKeys");
      expect(stored).not.toContain("legacy-secret");
    });
  });

  it("restores device-key-encrypted exchange keys after a reload without any master password", async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiProvider: "bitunix",
        encryptedApiKeys: {
          bitunix: { ciphertext: "c1", iv: "i", salt: "s", method: "AES-GCM" },
        },
      }),
    );
    vi.mocked(cryptoService.decrypt).mockResolvedValue(
      '{"key":"dk","secret":"ds"}',
    );

    const fresh = new SettingsManager();
    await fresh.secretsReady;

    expect(fresh.isEncrypted).toBe(false);
    expect(fresh.isLocked).toBe(false);
    expect(fresh.apiKeys.bitunix.key).toBe("dk");
    expect(fresh.apiKeys.bitunix.secret).toBe("ds");
    expect(fresh.decryptionFailures).toBe(0);
  });
});

/**
 * Guards engineering-log item 24a
 * (docs/archive/engineering-log-2026-h1.md). The AI key fields once defaulted
 * to `import.meta.env.VITE_*_API_KEY`. Vite inlines every VITE_-prefixed variable
 * into the client bundle, so a production build made with those variables set
 * shipped the operator's AI keys to every visitor as plain JavaScript. The
 * fallback is gone; this fails if anyone reintroduces it.
 */
describe("SettingsManager AI keys do not come from the build environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores VITE_*_API_KEY even when the build environment defines it", () => {
    vi.stubEnv("VITE_OPENAI_API_KEY", "sk-operator-openai");
    vi.stubEnv("VITE_GEMINI_API_KEY", "operator-gemini");
    vi.stubEnv("VITE_ANTHROPIC_API_KEY", "sk-ant-operator");

    const fresh = new SettingsManager();

    expect(fresh.openaiApiKey).toBe("");
    expect(fresh.geminiApiKey).toBe("");
    expect(fresh.anthropicApiKey).toBe("");
  });

  it("keeps them out of the serialized settings, so nothing leaks into storage", () => {
    vi.stubEnv("VITE_OPENAI_API_KEY", "sk-operator-openai");

    const json = new SettingsManager().toJSON();

    expect(JSON.stringify(json)).not.toContain("sk-operator-openai");
  });
});

/**
 * Chart settings: the rebasing price-scale modes (Percentage/IndexedTo100)
 * shipped briefly with #2310 and made absolute Entry/Liquidation/TP/SL
 * labels unreadable ("% scale confusion"). They were removed from the type;
 * these tests pin that stored legacy values fold back to the previous
 * hard-coded Logarithmic behavior and that the reset button restores every
 * chart field.
 */
describe("SettingsManager chart settings (scale modes & reset)", () => {
  const STORAGE_KEY = "cryptoCalculatorSettings";
  let settingsState: SettingsManager;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    settingsState = new SettingsManager();
  });

  it("normalizes a stored 'percent' mode back to logarithmic on load", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ chartPriceScaleMode: "percent" }),
    );

    const reloaded = new SettingsManager();

    expect(reloaded.chartPriceScaleMode).toBe("log");
  });

  it("normalizes a stored 'indexed' mode back to logarithmic on load", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ chartPriceScaleMode: "indexed" }),
    );

    const reloaded = new SettingsManager();

    expect(reloaded.chartPriceScaleMode).toBe("log");
  });

  it("keeps explicit linear/log values", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ chartPriceScaleMode: "linear" }),
    );
    expect(new SettingsManager().chartPriceScaleMode).toBe("linear");

    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ chartPriceScaleMode: "log" }),
    );
    expect(new SettingsManager().chartPriceScaleMode).toBe("log");
  });

  it("resetChartSettings restores every chart field to its default", () => {
    settingsState.chartPriceScaleMode = "linear";
    settingsState.chartInvertScale = true;
    settingsState.chartDecimalsMode = "fixed";
    settingsState.chartFixedDecimals = 7;
    settingsState.chartShowGrid = false;
    settingsState.chartWatermark = true;
    settingsState.chartSecondsVisible = true;
    settingsState.chartCountdownEnabled = true;

    settingsState.resetChartSettings();

    expect(settingsState.chartPriceScaleMode).toBe("log");
    expect(settingsState.chartInvertScale).toBe(false);
    expect(settingsState.chartDecimalsMode).toBe("auto");
    expect(settingsState.chartFixedDecimals).toBe(2);
    expect(settingsState.chartShowGrid).toBe(true);
    expect(settingsState.chartWatermark).toBe(false);
    expect(settingsState.chartSecondsVisible).toBe(false);
    expect(settingsState.chartCountdownEnabled).toBe(false);
  });
});
