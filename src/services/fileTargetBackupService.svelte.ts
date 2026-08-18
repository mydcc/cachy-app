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
import { dbService } from "./dbService";
import { getBackupPayload, APP_NAME } from "./backupService";

// FEAT-0212 Phase 2: periodic write-through to up to two user-chosen local
// files via the File System Access API. Chromium-only; hidden in the UI
// (SystemTab.svelte) when unsupported. Reuses backupService's payload shape,
// same as the OPFS auto-snapshot in autoBackupService.svelte.ts.

export type FileTargetSlot = 1 | 2;
export const FILE_TARGET_SLOTS: FileTargetSlot[] = [1, 2];

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 15;
export const DEFAULT_INTERVAL_MINUTES = 5;

const HANDLE_KEY_PREFIX = "autoBackupFileHandle_";

interface FileTargetConfig {
  fileName: string;
  intervalMinutes: number;
}

export interface FileTargetInfo {
  isConfigured: boolean;
  fileName: string | null;
  intervalMinutes: number;
  lastWriteTime: string | null;
  lastError: string | null;
  needsPermission: boolean;
}

function createEmptyInfo(): FileTargetInfo {
  return {
    isConfigured: false,
    fileName: null,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    lastWriteTime: null,
    lastError: null,
    needsPermission: false,
  };
}

export const fileTargetState: Record<FileTargetSlot, FileTargetInfo> = $state({
  1: createEmptyInfo(),
  2: createEmptyInfo(),
});

const handles: Partial<Record<FileTargetSlot, FileSystemFileHandle>> = {};
const timers: Partial<Record<FileTargetSlot, ReturnType<typeof setInterval>>> = {};
let isInitialized = false;

/**
 * Checks whether the File System Access API (showSaveFilePicker + a
 * persistable FileSystemFileHandle) is available in the current browser.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

function configStorageKey(slot: FileTargetSlot): string {
  return `${CONSTANTS.LOCAL_STORAGE_FILE_TARGET_CONFIG_PREFIX}${slot}`;
}

function loadConfig(slot: FileTargetSlot): FileTargetConfig | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(configStorageKey(slot));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.fileName === "string" && typeof parsed?.intervalMinutes === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveConfig(slot: FileTargetSlot, config: FileTargetConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(configStorageKey(slot), JSON.stringify(config));
}

function clearConfig(slot: FileTargetSlot): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(configStorageKey(slot));
}

function clampInterval(minutes: number): number {
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutes)));
}

function stopTimer(slot: FileTargetSlot): void {
  const timer = timers[slot];
  if (timer) {
    clearInterval(timer);
    delete timers[slot];
  }
}

function startTimer(slot: FileTargetSlot): void {
  stopTimer(slot);
  const minutes = fileTargetState[slot].intervalMinutes;
  timers[slot] = setInterval(() => {
    writeFileTargetSnapshot(slot).catch((err) =>
      console.error(`FileTargetBackup: periodic write failed for slot ${slot}`, err),
    );
  }, minutes * 60 * 1000);
}

/**
 * Writes the current data snapshot to the given slot's file, verifying
 * write permission first. A failure here never touches the other slot.
 */
export async function writeFileTargetSnapshot(slot: FileTargetSlot): Promise<boolean> {
  const handle = handles[slot];
  if (!handle) return false;

  try {
    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      fileTargetState[slot].needsPermission = true;
      fileTargetState[slot].lastError = "permissionRequired";
      return false;
    }

    const payload = await getBackupPayload();
    if (!payload) {
      fileTargetState[slot].lastError = "noData";
      return false;
    }

    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();

    fileTargetState[slot].lastWriteTime = payload.timestamp;
    fileTargetState[slot].lastError = null;
    fileTargetState[slot].needsPermission = false;
    return true;
  } catch (err) {
    console.error(`FileTargetBackup: Failed to write slot ${slot}`, err);
    fileTargetState[slot].lastError = "writeFailed";
    return false;
  }
}

/**
 * Re-requests write permission for an already-picked file, must be called
 * from a user gesture (e.g. a button click) since periodic timer callbacks
 * cannot prompt.
 */
export async function requestFileTargetPermission(slot: FileTargetSlot): Promise<boolean> {
  const handle = handles[slot];
  if (!handle) return false;

  try {
    const result = await handle.requestPermission({ mode: "readwrite" });
    if (result === "granted") {
      fileTargetState[slot].needsPermission = false;
      fileTargetState[slot].lastError = null;
      await writeFileTargetSnapshot(slot);
      return true;
    }
    fileTargetState[slot].needsPermission = true;
    return false;
  } catch (err) {
    console.error(`FileTargetBackup: Permission request failed for slot ${slot}`, err);
    return false;
  }
}

/**
 * Opens the native "Save As" picker for a new or replacement target file,
 * persists the handle, and starts the periodic write timer.
 */
export async function pickFileTarget(
  slot: FileTargetSlot,
  intervalMinutes: number = DEFAULT_INTERVAL_MINUTES,
): Promise<{ success: boolean; message: string }> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, message: "unsupported" };
  }

  try {
    const suggestedName = `${APP_NAME}-AutoBackup-${slot}.json`;
    const handle = await window.showSaveFilePicker!({
      suggestedName,
      types: [{ description: "JSON Backup", accept: { "application/json": [".json"] } }],
    });

    handles[slot] = handle;
    const clampedMinutes = clampInterval(intervalMinutes);
    const config: FileTargetConfig = { fileName: handle.name, intervalMinutes: clampedMinutes };
    saveConfig(slot, config);
    await dbService.put("kv_store", handle, `${HANDLE_KEY_PREFIX}${slot}`);

    fileTargetState[slot] = {
      isConfigured: true,
      fileName: handle.name,
      intervalMinutes: clampedMinutes,
      lastWriteTime: null,
      lastError: null,
      needsPermission: false,
    };

    await writeFileTargetSnapshot(slot);
    startTimer(slot);

    return { success: true, message: "configured" };
  } catch (err) {
    // AbortError: user cancelled the picker — not a failure worth surfacing.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, message: "cancelled" };
    }
    console.error(`FileTargetBackup: Failed to pick target for slot ${slot}`, err);
    return { success: false, message: "pickFailed" };
  }
}

/**
 * Removes a configured file target: stops its timer, forgets the handle,
 * clears persisted config. Does not delete the file itself.
 */
export async function clearFileTarget(slot: FileTargetSlot): Promise<void> {
  stopTimer(slot);
  delete handles[slot];
  clearConfig(slot);
  fileTargetState[slot] = createEmptyInfo();

  try {
    await dbService.delete("kv_store", `${HANDLE_KEY_PREFIX}${slot}`);
  } catch (err) {
    console.error(`FileTargetBackup: Failed to clear stored handle for slot ${slot}`, err);
  }
}

/**
 * Updates the write interval (minutes, clamped 1-15) for a configured slot
 * and restarts its timer.
 */
export function setFileTargetInterval(slot: FileTargetSlot, minutes: number): void {
  const clamped = clampInterval(minutes);
  fileTargetState[slot].intervalMinutes = clamped;

  if (fileTargetState[slot].isConfigured) {
    const fileName = fileTargetState[slot].fileName ?? "";
    saveConfig(slot, { fileName, intervalMinutes: clamped });
    startTimer(slot);
  }
}

/**
 * Restores previously configured file targets from IndexedDB on startup and
 * (re)starts their periodic write timers. Returns a cleanup function for
 * Svelte $effect.
 */
export function initFileTargets(): () => void {
  if (!browser || isInitialized) return () => {};
  isInitialized = true;

  if (!isFileSystemAccessSupported()) {
    return () => {
      isInitialized = false;
    };
  }

  for (const slot of FILE_TARGET_SLOTS) {
    const config = loadConfig(slot);
    if (!config) continue;

    dbService
      .get<FileSystemFileHandle>("kv_store", `${HANDLE_KEY_PREFIX}${slot}`)
      .then(async (handle) => {
        if (!handle) return;
        handles[slot] = handle;
        fileTargetState[slot] = {
          isConfigured: true,
          fileName: config.fileName,
          intervalMinutes: config.intervalMinutes,
          lastWriteTime: null,
          lastError: null,
          needsPermission: false,
        };

        const permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") {
          fileTargetState[slot].needsPermission = true;
          return;
        }

        startTimer(slot);
      })
      .catch((err) => {
        console.error(`FileTargetBackup: Failed to restore handle for slot ${slot}`, err);
      });
  }

  return () => {
    for (const slot of FILE_TARGET_SLOTS) stopTimer(slot);
    isInitialized = false;
  };
}
