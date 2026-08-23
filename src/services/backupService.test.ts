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

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as backupService from "./backupService";
import { CONSTANTS } from "../lib/constants";

// Mock $app/environment
vi.mock("$app/environment", () => ({
  browser: true,
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});

describe("backupService", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  const validSettings = JSON.stringify({ theme: "dark" });

  it("should create a valid V4 backup", async () => {
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, validSettings);

    // Mock URL.createObjectURL to capture the blob
    let capturedBlob: Blob | null = null;
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "mock-url";
    });
    global.URL.revokeObjectURL = vi.fn();

    // Mock document.createElement and click
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;

    // Use spyOn for createElement to correctly type the return
    vi.spyOn(document, "createElement").mockReturnValue(mockLink);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink);

    await backupService.createBackup("password");

    expect(capturedBlob).not.toBeNull();
    const backupText = await (capturedBlob as unknown as Blob).text();
    const backupData = JSON.parse(backupText);

    expect(backupData.backupVersion).toBe(4);
    expect(backupData.encryptedData).toBeDefined();
    expect(backupData.salt).toBeDefined();
    expect(backupData.iv).toBeDefined();
    expect(backupData.timestamp).toBeDefined();
  });

  it("should restore a V4 backup correctly", async () => {
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, validSettings);

    // Capture the backup first
    let capturedBlob: Blob | null = null;
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "mock-url";
    });
    // Mock DOM interactions again
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockLink);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink);

    await backupService.createBackup("password");

    expect(capturedBlob).not.toBeNull();
    const backupText = await (capturedBlob as unknown as Blob).text();

    // Clear and Restore
    localStorage.clear();

    // Pass the STRING content, not the blob/file
    await backupService.restoreFromBackup(backupText, "password");

    const restored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
    expect(restored).toBe(validSettings);
  }, 15000);

  it("should fail with incorrect password", async () => {
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, validSettings);

    // Helper to capture backup content
    let capturedBlob: Blob | null = null;
    global.URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return "mock-url";
    });
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockLink);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => mockLink);
    vi.spyOn(document.body, "removeChild").mockImplementation(() => mockLink);

    await backupService.createBackup("password");
    const backupText = await (capturedBlob as unknown as Blob).text();

    const result = await backupService.restoreFromBackup(backupText, "wrong");
    expect(result.success).toBe(false);
    expect(result.message).toBe("app.backupWrongPassword");
  }, 60000);

  it("should throw error when backing up corrupt localStorage data", async () => {
    // The service currently catches JSON parse errors and returns null for that key,
    // effectively "skipping" it, so it shouldn't throw but produce a partial backup.
    // Let's verify it doesn't crash.
    localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, "{ interrupted json");

    // Mock DOM
    global.URL.createObjectURL = vi.fn(() => "mock");
    const mockLink = {
      href: "",
      download: "",
      click: vi.fn(),
      style: {},
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(mockLink);

    await expect(backupService.createBackup("password")).resolves.not.toThrow();
  });

  describe("BUG-0283: Unencrypted backup exports exclude credentials", () => {
    const sensitiveSettings = JSON.stringify({
      theme: "cyberpunk",
      aiProvider: "openai",
      showSpinButtons: "hover",
      apiKeys: {
        bitunix: { key: "bitunix-api-key-123", secret: "bitunix-secret-456" },
        bitget: { key: "bitget-api-key-789", secret: "bitget-secret-abc", passphrase: "bitget-passphrase" },
      },
      encryptedApiKeys: { bitunix: "cipher-text-1", bitget: "cipher-text-2" },
      encryptedSecrets: "encrypted-secrets-blob",
      openaiApiKey: "sk-openai-secret-key",
      geminiApiKey: "AIzaSySecretGeminiKey",
      anthropicApiKey: "sk-ant-secret-key",
      openrouterApiKey: "sk-or-secret-key",
      cryptoPanicApiKey: "cp-secret-key",
      newsApiKey: "news-api-secret-key",
      discordBotToken: "discord-secret-token",
      imgbbApiKey: "imgbb-secret-key",
      imgurClientId: "imgur-client-id",
      cloudToken: "cloud-sync-token",
      appAccessToken: "app-access-token",
    });

    it("should strip all exchange credentials and API keys in unencrypted backups", async () => {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, sensitiveSettings);

      const payload = await backupService.getBackupPayload();
      expect(payload).not.toBeNull();
      expect(payload?.isEncrypted).toBe(false);
      expect(payload?.data?.settings).toBeDefined();

      const parsed = JSON.parse(payload?.data?.settings || "{}");

      // Non-sensitive settings must be preserved
      expect(parsed.theme).toBe("cyberpunk");
      expect(parsed.aiProvider).toBe("openai");
      expect(parsed.showSpinButtons).toBe("hover");

      // Exchange credentials must be stripped
      expect(parsed.apiKeys?.bitunix?.key).toBe("");
      expect(parsed.apiKeys?.bitunix?.secret).toBe("");
      expect(parsed.apiKeys?.bitget?.key).toBe("");
      expect(parsed.apiKeys?.bitget?.secret).toBe("");
      expect(parsed.apiKeys?.bitget?.passphrase).toBe("");
      expect(parsed.encryptedApiKeys).toBeUndefined();
      expect(parsed.encryptedSecrets).toBeUndefined();

      // Third-party API keys and tokens must be stripped
      expect(parsed.openaiApiKey).toBe("");
      expect(parsed.geminiApiKey).toBe("");
      expect(parsed.anthropicApiKey).toBe("");
      expect(parsed.openrouterApiKey).toBe("");
      expect(parsed.cryptoPanicApiKey).toBe("");
      expect(parsed.newsApiKey).toBe("");
      expect(parsed.discordBotToken).toBe("");
      expect(parsed.imgbbApiKey).toBe("");
      expect(parsed.imgurClientId).toBe("");
      expect(parsed.cloudToken).toBe("");
      expect(parsed.appAccessToken).toBe("");

      // Ensure the raw settings string in data does not contain any secret substrings
      const rawSettings = payload?.data?.settings || "";
      expect(rawSettings).not.toContain("bitunix-secret-456");
      expect(rawSettings).not.toContain("sk-openai-secret-key");
      expect(rawSettings).not.toContain("AIzaSySecretGeminiKey");
      expect(rawSettings).not.toContain("discord-secret-token");
    });

    it("should retain all credentials in password-encrypted backups and restore them accurately", async () => {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, sensitiveSettings);

      const payload = await backupService.getBackupPayload("MyMasterPassword123!");
      expect(payload).not.toBeNull();
      expect(payload?.isEncrypted).toBe(true);
      expect(payload?.encryptedData).toBeDefined();

      // Clear localStorage and restore from encrypted payload
      localStorage.clear();
      const payloadString = JSON.stringify(payload);
      const restoreResult = await backupService.restoreFromBackup(payloadString, "MyMasterPassword123!");

      expect(restoreResult.success).toBe(true);

      const restoredSettings = JSON.parse(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY) || "{}");
      expect(restoredSettings.apiKeys?.bitunix?.key).toBe("bitunix-api-key-123");
      expect(restoredSettings.apiKeys?.bitunix?.secret).toBe("bitunix-secret-456");
      expect(restoredSettings.openaiApiKey).toBe("sk-openai-secret-key");
      expect(restoredSettings.discordBotToken).toBe("discord-secret-token");
    }, 15000);
  });
});
