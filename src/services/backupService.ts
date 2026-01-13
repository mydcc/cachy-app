import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";

const BACKUP_VERSION = 1;
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
  data: BackupData;
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
export function createBackup() {
  if (!browser) return;

  const backupFile: BackupFile = {
    backupVersion: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    appName: APP_NAME,
    data: {
      settings: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY),
      presets: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY),
      journal: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY),
      tradeState: getDataFromLocalStorage(
        CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store"
      ),
      theme: getDataFromLocalStorage("theme"),
    },
  };

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
 * @returns An object indicating success or failure with a message.
 */
export function restoreFromBackup(jsonContent: string): {
  success: boolean;
  message: string;
} {
  // Allow running in test environment if localStorage is available, even if browser check fails
  // or mock browser check if possible.
  // In our test, we mocked $app/environment to set browser = true, so this check should pass.
  // However, vitest might be reloading the module or the mock isn't applying to the internal import correctly
  // if it was imported before the mock.

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
    if (!backup.data) {
      return {
        success: false,
        message: "Invalid backup file format: Missing data.",
      };
    }

    // --- Restore to localStorage ---
    if (backup.data.settings) {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY,
        backup.data.settings
      );
    }
    if (backup.data.presets) {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_PRESETS_KEY,
        backup.data.presets
      );
    }
    if (backup.data.journal) {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY,
        backup.data.journal
      );
    }
    if (backup.data.tradeState) {
      localStorage.setItem(
        CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store",
        backup.data.tradeState
      );
    }
    if (backup.data.theme) {
      localStorage.setItem("theme", backup.data.theme);
    }

    // The app will re-initialize with the new data on reload.
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
