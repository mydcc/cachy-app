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

import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { getBackupPayload, restoreFromBackup, type BackupFile } from "./backupService";

export const OPFS_BACKUP_FILENAME = "cachy_auto_backup.json";
const AUTO_BACKUP_DEBOUNCE_MS = 30000;
const SESSION_DISMISS_KEY = "cachy_opfs_restore_dismissed";

export interface PendingRestoreInfo {
  timestamp: string;
  entryCount: number;
  presetCount: number;
  hasSettings: boolean;
  rawJson: string;
}

export interface AutoBackupState {
  isOpfsSupported: boolean;
  lastSnapshotTime: string | null;
  pendingRestore: PendingRestoreInfo | null;
  isRestoring: boolean;
}

export const autoBackupState: AutoBackupState = $state({
  isOpfsSupported: false,
  lastSnapshotTime: null,
  pendingRestore: null,
  isRestoring: false,
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

/**
 * Checks if Origin Private File System (OPFS) is supported in the current environment.
 */
export function isOpfsSupported(): boolean {
  if (typeof navigator === "undefined" || !navigator.storage) {
    return false;
  }
  return typeof navigator.storage.getDirectory === "function";
}

/**
 * Gets the OPFS root directory handle.
 */
export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  if (!isOpfsSupported()) return null;
  try {
    return await navigator.storage.getDirectory();
  } catch (err) {
    console.error("AutoBackup: Failed to get OPFS directory handle", err);
    return null;
  }
}

/**
 * Parses snapshot data to count recovered items (trades, presets, etc.).
 */
export function extractSnapshotMeta(backup: BackupFile): {
  entryCount: number;
  presetCount: number;
  hasSettings: boolean;
} {
  let entryCount = 0;
  let presetCount = 0;
  let hasSettings = false;

  if (backup.data) {
    if (backup.data.journal) {
      try {
        const parsed = JSON.parse(backup.data.journal);
        if (Array.isArray(parsed)) {
          entryCount = parsed.length;
        } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.entries)) {
          entryCount = parsed.entries.length;
        }
      } catch {
        // Ignored
      }
    }
    if (backup.data.presets) {
      try {
        const parsed = JSON.parse(backup.data.presets);
        if (Array.isArray(parsed)) {
          presetCount = parsed.length;
        } else if (parsed && typeof parsed === "object") {
          presetCount = Object.keys(parsed).length;
        }
      } catch {
        // Ignored
      }
    }
    if (backup.data.settings) {
      hasSettings = true;
    }
  }

  return { entryCount, presetCount, hasSettings };
}

/**
 * Writes the current local data snapshot into OPFS silently.
 */
export async function saveOpfsSnapshot(): Promise<boolean> {
  if (!isOpfsSupported()) return false;

  try {
    const payload = await getBackupPayload();
    if (!payload) return false;

    // Do not save a completely empty backup over a potentially valid previous snapshot
    const meta = extractSnapshotMeta(payload);
    const hasAnyData = meta.entryCount > 0 || meta.presetCount > 0 || meta.hasSettings;

    const root = await getOpfsRoot();
    if (!root) return false;

    // If current localStorage is completely empty, don't overwrite OPFS unless forced
    if (!hasAnyData) {
      // Check if existing OPFS file exists and has data
      try {
        const existingHandle = await root.getFileHandle(OPFS_BACKUP_FILENAME, { create: false });
        const existingFile = await existingHandle.getFile();
        if (existingFile.size > 0) {
          // Keep existing OPFS snapshot
          return false;
        }
      } catch {
        // No existing file, can write
      }
    }

    const fileHandle = await root.getFileHandle(OPFS_BACKUP_FILENAME, { create: true });
    // createWritable with truncate
    const writable = await fileHandle.createWritable();
    const jsonStr = JSON.stringify(payload, null, 2);
    await writable.write(jsonStr);
    await writable.close();

    autoBackupState.lastSnapshotTime = payload.timestamp;
    return true;
  } catch (err) {
    console.error("AutoBackup: Failed to write OPFS snapshot", err);
    return false;
  }
}

/**
 * Triggers a debounced auto-backup snapshot.
 */
export function triggerAutoBackup(delayMs: number = AUTO_BACKUP_DEBOUNCE_MS): void {
  if (!isOpfsSupported()) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    saveOpfsSnapshot().catch((err) =>
      console.error("AutoBackup: Error during debounced save", err),
    );
  }, delayMs);
}

/**
 * Checks on application startup whether an OPFS snapshot is available and offers restore
 * if localStorage is empty/missing or significantly older.
 */
export async function checkOpfsSnapshotOnStartup(): Promise<void> {
  if (!isOpfsSupported()) {
    autoBackupState.isOpfsSupported = false;
    return;
  }

  autoBackupState.isOpfsSupported = true;

  if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_DISMISS_KEY) === "true") {
    return;
  }

  try {
    const root = await getOpfsRoot();
    if (!root) return;

    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await root.getFileHandle(OPFS_BACKUP_FILENAME, { create: false });
    } catch {
      // File does not exist yet
      return;
    }

    const file = await fileHandle.getFile();
    if (file.size === 0) return;

    const rawJson = await file.text();
    const backup: BackupFile = JSON.parse(rawJson);

    if (!backup || !backup.timestamp) return;

    autoBackupState.lastSnapshotTime = backup.timestamp;

    const opfsMeta = extractSnapshotMeta(backup);

    // Check current localStorage state
    let localJournalCount = 0;
    let localPresetCount = 0;
    let hasLocalSettings = false;

    if (typeof localStorage !== "undefined") {
      const rawJournal = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY);
      if (rawJournal) {
        try {
          const parsed = JSON.parse(rawJournal);
          localJournalCount = Array.isArray(parsed) ? parsed.length : (parsed?.entries?.length || 0);
        } catch {
          // Ignored
        }
      }

      const rawPresets = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY);
      if (rawPresets) {
        try {
          const parsed = JSON.parse(rawPresets);
          localPresetCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
        } catch {
          // Ignored
        }
      }

      if (localStorage.getItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY)) {
        hasLocalSettings = true;
      }
    }

    // Condition to offer restore:
    // 1. localStorage has 0 entries and 0 presets, while OPFS snapshot has data (classic cache clear / eviction).
    // 2. OR localStorage is missing settings and journal while OPFS has them.
    const isLocalEmpty = localJournalCount === 0 && localPresetCount === 0 && !hasLocalSettings;
    const hasOpfsData = opfsMeta.entryCount > 0 || opfsMeta.presetCount > 0 || opfsMeta.hasSettings;

    if (isLocalEmpty && hasOpfsData) {
      autoBackupState.pendingRestore = {
        timestamp: backup.timestamp,
        entryCount: opfsMeta.entryCount,
        presetCount: opfsMeta.presetCount,
        hasSettings: opfsMeta.hasSettings,
        rawJson,
      };
    }
  } catch (err) {
    console.error("AutoBackup: Error checking OPFS snapshot on startup", err);
  }
}

/**
 * Restores user data from the pending OPFS snapshot.
 */
export async function restoreFromOpfs(password?: string): Promise<{ success: boolean; message: string }> {
  if (!autoBackupState.pendingRestore) {
    return { success: false, message: "No pending restore snapshot available." };
  }

  autoBackupState.isRestoring = true;
  try {
    const res = await restoreFromBackup(autoBackupState.pendingRestore.rawJson, password);
    if (res.success) {
      autoBackupState.pendingRestore = null;
      if (browser) {
        window.location.reload();
      }
    }
    return res;
  } finally {
    autoBackupState.isRestoring = false;
  }
}

/**
 * Dismisses the OPFS restore prompt for the current session.
 */
export function dismissOpfsRestore(): void {
  autoBackupState.pendingRestore = null;
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
  }
}

/**
 * Initializes the automated backup lifecycle:
 * - Checks startup snapshot
 * - Listens for data changes and schedules debounced snapshots
 * - Returns a cleanup function for Svelte $effect
 */
export function initAutoBackup(): () => void {
  if (!browser || isInitialized) return () => {};

  isInitialized = true;
  autoBackupState.isOpfsSupported = isOpfsSupported();

  // Run startup check
  checkOpfsSnapshotOnStartup().catch((err) =>
    console.error("AutoBackup: Startup check failed", err),
  );

  // Listen to storage events from other tabs / local updates
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY ||
      e.key === CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY ||
      e.key === CONSTANTS.LOCAL_STORAGE_PRESETS_KEY ||
      e.key === (CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store")
    ) {
      triggerAutoBackup();
    }
  };

  window.addEventListener("storage", handleStorage);

  // Also take an initial snapshot after 10s if we already have data
  const initialSnapshotTimer = setTimeout(() => {
    triggerAutoBackup(0);
  }, 10000);

  return () => {
    window.removeEventListener("storage", handleStorage);
    if (debounceTimer) clearTimeout(debounceTimer);
    clearTimeout(initialSnapshotTimer);
    isInitialized = false;
  };
}
