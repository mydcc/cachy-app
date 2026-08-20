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

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CONSTANTS } from "../lib/constants";
import {
  isOpfsSupported,
  extractSnapshotMeta,
  saveOpfsSnapshot,
  triggerAutoBackup,
  checkOpfsSnapshotOnStartup,
  restoreFromOpfs,
  dismissOpfsRestore,
  autoBackupState,
  OPFS_BACKUP_FILENAME,
} from "./autoBackupService.svelte";
import type { BackupFile } from "./backupService";

// Helper mock for OPFS
function createMockOpfs(initialFiles: Record<string, string> = {}) {
  const files: Record<string, string> = { ...initialFiles };

  const mockWritable = {
    write: vi.fn(async (data: string) => {
      files[mockCurrentFile] = data;
    }),
    close: vi.fn(async () => {}),
  };

  let mockCurrentFile = "";

  const mockFileHandle = {
    getFile: vi.fn(async () => ({
      size: files[mockCurrentFile]?.length || 0,
      text: async () => files[mockCurrentFile] || "",
    })),
    createWritable: vi.fn(async () => mockWritable),
  };

  const mockRoot = {
    getFileHandle: vi.fn(async (name: string, opts?: { create?: boolean }) => {
      mockCurrentFile = name;
      if (!opts?.create && files[name] === undefined) {
        throw new Error("NotFoundError");
      }
      return mockFileHandle;
    }),
  };

  return {
    mockRoot,
    mockWritable,
    mockFileHandle,
    files,
  };
}

describe("autoBackupService", () => {
  let mockOpfs: ReturnType<typeof createMockOpfs>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();

    mockOpfs = createMockOpfs();

    // Mock navigator.storage
    Object.defineProperty(globalThis, "navigator", {
      value: {
        storage: {
          getDirectory: vi.fn(async () => mockOpfs.mockRoot),
        },
      },
      writable: true,
      configurable: true,
    });

    autoBackupState.isOpfsSupported = true;
    autoBackupState.lastSnapshotTime = null;
    autoBackupState.pendingRestore = null;
    autoBackupState.isRestoring = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isOpfsSupported", () => {
    it("returns true when navigator.storage.getDirectory is available", () => {
      expect(isOpfsSupported()).toBe(true);
    });

    it("returns false when navigator.storage is undefined", () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {},
        writable: true,
        configurable: true,
      });
      expect(isOpfsSupported()).toBe(false);
    });
  });

  describe("extractSnapshotMeta", () => {
    it("extracts entryCount, presetCount, and settings flag correctly", () => {
      const mockBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T12:00:00.000Z",
        data: {
          journal: JSON.stringify([{ id: "t1" }, { id: "t2" }]),
          presets: JSON.stringify({ default: { id: "p1" } }),
          settings: JSON.stringify({ riskPercentage: 1 }),
          tradeState: null,
          theme: "dark",
          quizState: null,
        },
      };

      const meta = extractSnapshotMeta(mockBackup);
      expect(meta.entryCount).toBe(2);
      expect(meta.presetCount).toBe(1);
      expect(meta.hasSettings).toBe(true);
    });

    it("handles empty or corrupt data gracefully", () => {
      const mockBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T12:00:00.000Z",
        data: {
          journal: "invalid json",
          presets: null,
          settings: null,
          tradeState: null,
          theme: null,
          quizState: null,
        },
      };

      const meta = extractSnapshotMeta(mockBackup);
      expect(meta.entryCount).toBe(0);
      expect(meta.presetCount).toBe(0);
      expect(meta.hasSettings).toBe(false);
    });
  });

  describe("saveOpfsSnapshot", () => {
    it("writes valid JSON payload to OPFS file", async () => {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify([{ id: "trade-123", symbol: "BTCUSDT" }]),
      );
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
        JSON.stringify({ riskPercentage: 2 }),
      );

      const success = await saveOpfsSnapshot();
      expect(success).toBe(true);
      expect(mockOpfs.mockWritable.write).toHaveBeenCalled();
      expect(mockOpfs.mockWritable.close).toHaveBeenCalled();

      const writtenContent = mockOpfs.files[OPFS_BACKUP_FILENAME];
      expect(writtenContent).toBeDefined();

      const parsed = JSON.parse(writtenContent);
      expect(parsed.appName).toBe("R-Calculator");
      expect(autoBackupState.lastSnapshotTime).toBe(parsed.timestamp);
    });

    it("does not trigger any outbound network requests (Class A Local-First boundary)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify([{ id: "trade-1" }]),
      );

      await saveOpfsSnapshot();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("triggerAutoBackup", () => {
    it("debounces save calls", async () => {
      vi.useFakeTimers();

      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify([{ id: "trade-1" }]),
      );

      triggerAutoBackup(100);
      triggerAutoBackup(100);
      triggerAutoBackup(100);

      expect(mockOpfs.mockWritable.write).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(150);

      expect(mockOpfs.mockWritable.write).toHaveBeenCalledTimes(1);
    });
  });

  describe("checkOpfsSnapshotOnStartup", () => {
    it("detects cleared localStorage and triggers pendingRestore with OPFS snapshot data", async () => {
      const sampleBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T10:30:00.000Z",
        data: {
          journal: JSON.stringify([{ id: "t1" }, { id: "t2" }, { id: "t3" }]),
          presets: JSON.stringify({ p1: { name: "Scalp" } }),
          settings: JSON.stringify({ defaultRisk: 1 }),
          tradeState: null,
          theme: "dark",
          quizState: null,
        },
      };

      // Populate mock OPFS with existing snapshot
      mockOpfs = createMockOpfs({
        [OPFS_BACKUP_FILENAME]: JSON.stringify(sampleBackup),
      });
      navigator.storage.getDirectory = vi.fn(async () => mockOpfs.mockRoot);

      // LocalStorage is empty (cache cleared)
      localStorage.clear();

      await checkOpfsSnapshotOnStartup();

      expect(autoBackupState.pendingRestore).not.toBeNull();
      expect(autoBackupState.pendingRestore?.entryCount).toBe(3);
      expect(autoBackupState.pendingRestore?.presetCount).toBe(1);
      expect(autoBackupState.pendingRestore?.hasSettings).toBe(true);
    });

    it("does not offer restore when localStorage already contains active data", async () => {
      const sampleBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T10:30:00.000Z",
        data: {
          journal: JSON.stringify([{ id: "t1" }]),
          presets: null,
          settings: null,
          tradeState: null,
          theme: null,
          quizState: null,
        },
      };

      mockOpfs = createMockOpfs({
        [OPFS_BACKUP_FILENAME]: JSON.stringify(sampleBackup),
      });
      navigator.storage.getDirectory = vi.fn(async () => mockOpfs.mockRoot);

      // LocalStorage already has data
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify([{ id: "t1" }]),
      );
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
        JSON.stringify({ riskPercentage: 1 }),
      );

      await checkOpfsSnapshotOnStartup();

      expect(autoBackupState.pendingRestore).toBeNull();
    });

    it("respects session dismiss key", async () => {
      const sampleBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T10:30:00.000Z",
        data: {
          journal: JSON.stringify([{ id: "t1" }]),
          presets: null,
          settings: null,
          tradeState: null,
          theme: null,
          quizState: null,
        },
      };

      mockOpfs = createMockOpfs({
        [OPFS_BACKUP_FILENAME]: JSON.stringify(sampleBackup),
      });
      navigator.storage.getDirectory = vi.fn(async () => mockOpfs.mockRoot);

      sessionStorage.setItem("cachy_opfs_restore_dismissed", "true");

      await checkOpfsSnapshotOnStartup();

      expect(autoBackupState.pendingRestore).toBeNull();
    });
  });

  describe("restoreFromOpfs and dismissOpfsRestore", () => {
    it("restores snapshot into localStorage", async () => {
      const sampleBackup: BackupFile = {
        backupVersion: 4,
        appName: "R-Calculator",
        timestamp: "2026-08-16T10:30:00.000Z",
        data: {
          journal: JSON.stringify([{ id: "trade-restored" }]),
          presets: JSON.stringify([{ name: "Preset 1" }]),
          settings: JSON.stringify({ defaultRisk: 2 }),
          tradeState: null,
          theme: "dark",
          quizState: null,
        },
      };

      autoBackupState.pendingRestore = {
        timestamp: sampleBackup.timestamp,
        entryCount: 1,
        presetCount: 1,
        hasSettings: true,
        rawJson: JSON.stringify(sampleBackup),
      };

      const result = await restoreFromOpfs();
      expect(result.success).toBe(true);

      expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY)).toContain("trade-restored");
      expect(localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY)).toContain("defaultRisk");
      expect(autoBackupState.pendingRestore).toBeNull();
    });

    it("dismisses restore prompt and persists session flag", () => {
      autoBackupState.pendingRestore = {
        timestamp: "2026-08-16T10:00:00.000Z",
        entryCount: 1,
        presetCount: 0,
        hasSettings: true,
        rawJson: "{}",
      };

      dismissOpfsRestore();

      expect(autoBackupState.pendingRestore).toBeNull();
      expect(sessionStorage.getItem("cachy_opfs_restore_dismissed")).toBe("true");
    });
  });
});
