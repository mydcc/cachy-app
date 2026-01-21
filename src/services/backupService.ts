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
import { encrypt, decrypt, decryptLegacy } from "./cryptoService";

const BACKUP_VERSION = 4; // Version 4: PBKDF2 600k Iterations + Strict Data Validation
const APP_NAME = "R-Calculator";

// The structure for the data payload in the backup
interface BackupData {
  settings: string | null; // Stored as a raw string from localStorage
  presets: string | null; // Stored as a raw string from localStorage
  journal: string | null; // Stored as a raw string from localStorage
  tradeState: string | null; // Stored as a raw string from localStorage
  theme: string | null; // Stored as a raw string from localStorage
}

// The overall structure of the backup file
interface BackupFile {
  backupVersion: number;
  timestamp: string;
  appName: string;
  data?: BackupData;
  encryptedData?: string; // Base64 ciphertext if encrypted
  isEncrypted?: boolean;
  salt?: string; // Base64
  iv?: string; // Base64
}

/**
 * Retrieves raw data directly from localStorage.
 * @param key The localStorage key.
 * @returns The raw string data or null if not found.
 */
function getDataFromLocalStorage(key: string): string | null {
  if (!browser) return null;
  return localStorage.getItem(key);
}

/**
 * Creates a JSON backup file of the user's data and triggers a download.
 */
export async function createBackup(password?: string) {
  if (!browser) return;

  // Validation: Ensure we are not backing up garbage
  const getValidatedData = (key: string): string | null => {
    const raw = getDataFromLocalStorage(key);
    if (!raw) return null;
    try {
      JSON.parse(raw); // Check if valid JSON
      return raw;
    } catch (e) {
      console.error(
        `Backup Logic: Detected corrupt JSON for key ${key}. Skipping.`,
      );
      // Optional: We could throw interrupt here, but skipping corrupt keys might be safer for user data retrieval
      return null;
    }
  };

  const rawData: BackupData = {
    settings: getValidatedData(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY),
    presets: getValidatedData(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY),
    journal: getValidatedData(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY),
    tradeState: getValidatedData(
      CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store",
    ),
    theme: getDataFromLocalStorage("theme"), // Theme is often just a string ("dark"|"light"), not JSON
  };

  const backupFile: BackupFile = {
    backupVersion: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    appName: APP_NAME,
  };

  if (password) {
    const dataString = JSON.stringify(rawData);
    const { ciphertext, salt, iv } = await encrypt(dataString, password);
    backupFile.encryptedData = ciphertext;
    backupFile.salt = salt;
    backupFile.iv = iv;
    backupFile.isEncrypted = true;
  } else {
    backupFile.data = rawData;
    backupFile.isEncrypted = false;
  }

  const jsonString = JSON.stringify(backupFile, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().split("T")[0];
  link.download = `${APP_NAME}-Backup-${date}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Restores user data from a JSON backup file content.
 * This function writes the data to localStorage and then triggers a page reload.
 * @param jsonContent The string content of the uploaded JSON file.
 * @param password Optional password for encrypted backups.
 * @returns An object indicating success or failure with a message.
 */
export async function restoreFromBackup(
  jsonContent: string,
  password?: string,
): Promise<{
  success: boolean;
  message: string;
  needsPassword?: boolean;
}> {
  if (!browser && typeof localStorage === "undefined") {
    return {
      success: false,
      message: "Backup can only be restored in a browser environment.",
    };
  }

  try {
    const backup: BackupFile = JSON.parse(jsonContent);

    // --- Validation ---
    if (backup.appName !== APP_NAME) {
      return {
        success: false,
        message: "This backup file is not for this application.",
      };
    }
    if (!backup.backupVersion || backup.backupVersion > BACKUP_VERSION) {
      return {
        success: false,
        message: `Unsupported backup version. This app supports up to version ${BACKUP_VERSION}.`,
      };
    }

    let data: BackupData | undefined;

    if (backup.isEncrypted) {
      if (!password) {
        return {
          success: false,
          message: "app.backupPasswordRequired",
          needsPassword: true,
        };
      }

      try {
        let decryptedJson: string;

        // Legacy Support for Version 2 (and 1 if encrypted)
        // V3 also supports weak encryption if it was created before this patch, but marked as V3.
        // However, our new decrypt function auto-detects iterations, so we can just call decrypt().
        // For strictness, only V1/V2 force decryptLegacy.
        if (backup.backupVersion < 3) {
          decryptedJson = await decryptLegacy(
            backup.encryptedData || "",
            password,
          );
        } else {
          // Version 3+ (Stronger or Strongest Encryption)
          if (!backup.encryptedData || !backup.salt || !backup.iv) {
            return {
              success: false,
              message:
                "Invalid encrypted backup file format (Missing Salt/IV).",
            };
          }
          decryptedJson = await decrypt(
            backup.encryptedData,
            password,
            backup.salt,
            backup.iv,
          );
        }

        data = JSON.parse(decryptedJson);
      } catch (e) {
        return {
          success: false,
          message: "app.backupWrongPassword",
        };
      }
    } else {
      data = backup.data;
    }

    if (!data) {
      return {
        success: false,
        message: "Invalid backup file format: Missing data.",
      };
    }

    // --- Restore to localStorage ---
    if (data.settings) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY, data.settings);
    }
    if (data.presets) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY, data.presets);
    }
    if (data.journal) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY, data.journal);
    }
    if (data.tradeState) {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store",
        data.tradeState,
      );
    }
    if (data.theme) {
      localStorage.setItem("theme", data.theme);
    }

    return {
      success: true,
      message: "Restore successful! The application will now reload.",
    };
  } catch (error) {
    console.error("Failed to parse or restore backup file.", error);
    return {
      success: false,
      message: "The selected file is not a valid backup file.",
    };
  }
}
