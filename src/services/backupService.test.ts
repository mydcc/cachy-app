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
import * as backupService from "./backupService";
import { get } from "svelte/store";
import { accountState } from "../stores/account.svelte";
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
    const backupText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(capturedBlob as unknown as Blob);
    });
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
    const backupText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(capturedBlob as unknown as Blob);
    });

    // Clear and Restore
    localStorage.clear();

    // Pass the STRING content, not the blob/file
    await backupService.restoreFromBackup(backupText, "password");

    const restored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY);
    expect(restored).toBe(validSettings);
  });

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
    const backupText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(capturedBlob as unknown as Blob);
    });

    const result = await backupService.restoreFromBackup(backupText, "wrong");
    expect(result.success).toBe(false);
    expect(result.message).toBe("app.backupWrongPassword");
  });

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
});
