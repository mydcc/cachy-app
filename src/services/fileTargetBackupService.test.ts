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

import { describe, it, expect, beforeEach, vi } from "vitest";
import { CONSTANTS } from "../lib/constants";
import { dbService } from "./dbService";
import {
  isFileSystemAccessSupported,
  pickFileTarget,
  clearFileTarget,
  writeFileTargetSnapshot,
  requestFileTargetPermission,
  setFileTargetInterval,
  fileTargetState,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  DEFAULT_INTERVAL_MINUTES,
} from "./fileTargetBackupService.svelte";

function createMockFileHandle(name: string, permission: "granted" | "denied" | "prompt" = "granted") {
  const writes: string[] = [];
  const mockWritable = {
    write: vi.fn(async (data: string) => {
      writes.push(data);
    }),
    close: vi.fn(async () => {}),
  };

  return {
    handle: {
      name,
      kind: "file" as const,
      queryPermission: vi.fn(async () => permission),
      requestPermission: vi.fn(async () => permission),
      createWritable: vi.fn(async () => mockWritable),
    },
    writes,
    mockWritable,
  };
}

describe("fileTargetBackupService", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();

    // Real FileSystemFileHandle instances are structured-clone-able in
    // Chromium; our vi.fn()-based mocks are not, so IndexedDB persistence
    // is stubbed here rather than exercised against fake-indexeddb.
    vi.spyOn(dbService, "put").mockResolvedValue(undefined);
    vi.spyOn(dbService, "get").mockResolvedValue(undefined);
    vi.spyOn(dbService, "delete").mockResolvedValue(undefined);

    fileTargetState[1] = {
      isConfigured: false,
      fileName: null,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      lastWriteTime: null,
      lastError: null,
      needsPermission: false,
    };
    fileTargetState[2] = { ...fileTargetState[1] };
  });

  describe("isFileSystemAccessSupported", () => {
    it("returns false when window.showSaveFilePicker is not defined", () => {
      expect(isFileSystemAccessSupported()).toBe(false);
    });

    it("returns true when window.showSaveFilePicker is a function", () => {
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn();
      expect(isFileSystemAccessSupported()).toBe(true);
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
  });

  describe("pickFileTarget", () => {
    it("returns unsupported when the File System Access API is unavailable", async () => {
      const result = await pickFileTarget(1);
      expect(result.success).toBe(false);
      expect(result.message).toBe("unsupported");
    });

    it("configures a slot, persists the handle, and writes an initial snapshot", async () => {
      const mock = createMockFileHandle("Cachy-AutoBackup-1.json");
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => mock.handle,
      );

      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        JSON.stringify([{ id: "trade-1" }]),
      );

      const result = await pickFileTarget(1, 5);

      expect(result.success).toBe(true);
      expect(fileTargetState[1].isConfigured).toBe(true);
      expect(fileTargetState[1].fileName).toBe("Cachy-AutoBackup-1.json");
      expect(mock.writes.length).toBe(1);
      const written = JSON.parse(mock.writes[0]);
      expect(written.appName).toBe("R-Calculator");

      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });

    it("does not trigger any outbound network requests (Class A Local-First boundary)", async () => {
      const mock = createMockFileHandle("Cachy-AutoBackup-1.json");
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => mock.handle,
      );
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await pickFileTarget(1, 5);

      expect(fetchSpy).not.toHaveBeenCalled();
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
  });

  describe("writeFileTargetSnapshot", () => {
    it("returns false and flags needsPermission when permission is not granted", async () => {
      const mock = createMockFileHandle("f.json", "prompt");
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => mock.handle,
      );
      await pickFileTarget(1, 5);
      // pickFileTarget's initial write happens while permission is 'granted' by
      // default in the mock factory; simulate it having lapsed afterwards.
      mock.handle.queryPermission = vi.fn(async () => "prompt");

      const success = await writeFileTargetSnapshot(1);
      expect(success).toBe(false);
      expect(fileTargetState[1].needsPermission).toBe(true);

      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });

    it("a write failure on one slot does not affect the other", async () => {
      const mockOk = createMockFileHandle("ok.json");
      const mockFail = createMockFileHandle("fail.json");
      mockFail.handle.createWritable = vi.fn(async () => {
        throw new Error("disk full");
      });

      let call = 0;
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => (call++ === 0 ? mockOk.handle : mockFail.handle),
      );

      await pickFileTarget(1, 5);
      await pickFileTarget(2, 5);

      const resultOk = await writeFileTargetSnapshot(1);
      const resultFail = await writeFileTargetSnapshot(2);

      expect(resultOk).toBe(true);
      expect(resultFail).toBe(false);
      expect(fileTargetState[2].lastError).toBe("writeFailed");
      expect(fileTargetState[1].lastError).toBeNull();

      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
  });

  describe("requestFileTargetPermission", () => {
    it("clears needsPermission and writes a snapshot on successful reconnect", async () => {
      const mock = createMockFileHandle("f.json");
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => mock.handle,
      );
      await pickFileTarget(1, 5);
      fileTargetState[1].needsPermission = true;
      mock.handle.requestPermission = vi.fn(async () => "granted");

      const ok = await requestFileTargetPermission(1);
      expect(ok).toBe(true);
      expect(fileTargetState[1].needsPermission).toBe(false);

      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
  });

  describe("setFileTargetInterval", () => {
    it("clamps interval to the [1, 15] minute range", () => {
      setFileTargetInterval(1, 0);
      expect(fileTargetState[1].intervalMinutes).toBe(MIN_INTERVAL_MINUTES);

      setFileTargetInterval(1, 999);
      expect(fileTargetState[1].intervalMinutes).toBe(MAX_INTERVAL_MINUTES);

      setFileTargetInterval(1, 7);
      expect(fileTargetState[1].intervalMinutes).toBe(7);
    });
  });

  describe("clearFileTarget", () => {
    it("removes the configured slot and its persisted config", async () => {
      const mock = createMockFileHandle("f.json");
      (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = vi.fn(
        async () => mock.handle,
      );
      await pickFileTarget(1, 5);
      expect(fileTargetState[1].isConfigured).toBe(true);

      await clearFileTarget(1);

      expect(fileTargetState[1].isConfigured).toBe(false);
      expect(fileTargetState[1].fileName).toBeNull();
      expect(
        localStorage.getItem(`${CONSTANTS.LOCAL_STORAGE_FILE_TARGET_CONFIG_PREFIX}1`),
      ).toBeNull();

      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
  });
});
