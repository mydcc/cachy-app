import { browser } from "$app/environment";
import { CONSTANTS } from "../lib/constants";
import { encrypt, decrypt } from "./cryptoService";

const BACKUP_VERSION = 2; // Incrementing version for encryption support
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
  iv?: string;   // Base64
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

  const rawData: BackupData = {
    settings: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_SETTINGS_KEY),
    presets: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_PRESETS_KEY),
    journal: getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_JOURNAL_KEY),
    tradeState: getDataFromLocalStorage(
      CONSTANTS.LOCAL_STORAGE_TRADE_KEY || "cachy_trade_store"
    ),
    theme: getDataFromLocalStorage("theme"),
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
  password?: string
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

      if (!backup.encryptedData || !backup.salt || !backup.iv) {
        return {
          success: false,
          message: "Invalid encrypted backup file format.",
        };
      }

      try {
        const decryptedJson = await decrypt(
          backup.encryptedData,
          password,
          backup.salt,
          backup.iv
        );
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
        data.tradeState
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
