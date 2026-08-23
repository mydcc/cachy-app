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
import { SENSITIVE_KEYS } from "../stores/settings/secretsLoader";
import { cryptoService } from "./cryptoService";

export const BACKUP_VERSION = 4; // Version 4: PBKDF2 600k Iterations + Strict Data Validation
export const APP_NAME = "R-Calculator";

// The structure for the data payload in the backup
export interface BackupData {
  settings: string | null; // Stored as a raw string from localStorage
  presets: string | null; // Stored as a raw string from localStorage
  journal: string | null; // Stored as a raw string from localStorage
  tradeState: string | null; // Stored as a raw string from localStorage
  theme: string | null; // Stored as a raw string from localStorage
  quizState: string | null; // Stored as a raw string from localStorage
  riskLimits?: string | null; // Optional: FEAT-0013 risk limits & kill switch
  paperTrading?: string | null; // Optional: FEAT-0012 paper trading state
  orderAudit?: string | null; // Optional: FEAT-0015 order audit log
}

// The overall structure of the backup file
export interface BackupFile {
  backupVersion: number;
  timestamp: string;
  appName: string;
  data?: BackupData;
  encryptedData?: string; // Base64 ciphertext if encrypted
  isEncrypted?: boolean;
  salt?: string; // Base64
  iv?: string; // Base64
  kdfHash?: "SHA-512" | "SHA-256"; // PBKDF2 hash algorithm used for key derivation
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  success: boolean;
  message: string;
  needsPassword?: boolean;
  rejectedSections?: string[];
}

/**
 * Safe check for host/URL strings to prevent injection of malicious schemes
 * (e.g. javascript:, data:, vbscript:) or invalid structures.
 */
export function isSafeHostOrUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return true; // empty string is acceptable

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return false;
  }

  if (lower.includes("://")) {
    try {
      const url = new URL(trimmed);
      return ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  // Host/port format (e.g., localhost:11434, 127.0.0.1:8080, api.example.com, or relative path /api)
  return /^[a-zA-Z0-9.\-_:/~?#[\]@!$&'()*+,;=]+$/.test(trimmed);
}

/**
 * Validates the serialized settings payload.
 */
export function validateSettings(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return false;
    }

    // Sanity check known boolean flags
    const knownBooleanKeys = [
      "hasConsentedTelemetry",
      "hasAcceptedDisclaimer",
      "hasCompletedOnboarding",
      "isEncrypted",
      "isLocked",
      "soundEnabled",
      "hapticsEnabled",
      "notificationsEnabled",
      "autoHideHeader",
      "compactLayout",
      "showPositionSummary",
      "developerMode",
      "showRuler",
      "showPnlInHeader",
      "privacyMode",
      "expertMode",
      "twoFactorEnabled",
      "enableAuditLog",
      "liveSyncEnabled",
    ];

    for (const key of knownBooleanKeys) {
      if (key in parsed && parsed[key] !== null && parsed[key] !== undefined) {
        if (typeof parsed[key] !== "boolean") {
          return false;
        }
      }
    }

    // Sanity check known host / URL fields
    const knownUrlKeys = [
      "ollamaCustomHost",
      "customApiUrl",
      "spacetimedbHost",
      "backendUrl",
      "webhookUrl",
      "proxyUrl",
    ];

    for (const key of knownUrlKeys) {
      if (key in parsed && parsed[key] !== null && parsed[key] !== undefined) {
        if (!isSafeHostOrUrl(parsed[key])) {
          return false;
        }
      }
    }

    // Sanity check apiKeys structure if present
    if (
      "apiKeys" in parsed &&
      parsed.apiKeys !== null &&
      parsed.apiKeys !== undefined &&
      (typeof parsed.apiKeys !== "object" || Array.isArray(parsed.apiKeys))
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the serialized presets payload.
 */
export function validatePresets(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return false;
    }
    if (Array.isArray(parsed)) {
      return parsed.every(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item),
      );
    }
    // Object map
    return Object.values(parsed).every(
      (item) => typeof item === "object" && item !== null && !Array.isArray(item),
    );
  } catch {
    return false;
  }
}

/**
 * Validates the serialized journal payload.
 */
export function validateJournal(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.every(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item),
      );
    }
    if (typeof parsed === "object" && parsed !== null) {
      if ("entries" in parsed && Array.isArray(parsed.entries)) {
        return parsed.entries.every(
          (item: unknown) => typeof item === "object" && item !== null && !Array.isArray(item),
        );
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Validates the serialized tradeState payload.
 */
export function validateTradeState(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Validates the theme identifier string.
 */
export function validateTheme(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  const cleaned = raw.trim().replace(/^"|"$/g, "");
  return /^[a-zA-Z0-9_-]{1,64}$/.test(cleaned);
}

/**
 * Validates the serialized quizState payload.
 */
export function validateQuizState(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Validates the serialized riskLimits payload.
 */
export function validateRiskLimits(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Validates the serialized paperTrading payload.
 */
export function validatePaperTrading(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * Validates the serialized orderAudit payload.
 */
export function validateOrderAudit(raw: unknown): boolean {
  if (typeof raw !== "string" || !raw.trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Validates all present sections of a BackupData payload.
 */
export function validateBackupSections(data: BackupData): {
  valid: boolean;
  rejectedSections: string[];
} {
  const rejectedSections: string[] = [];

  if (data.settings !== null && data.settings !== undefined) {
    if (!validateSettings(data.settings)) rejectedSections.push("settings");
  }
  if (data.presets !== null && data.presets !== undefined) {
    if (!validatePresets(data.presets)) rejectedSections.push("presets");
  }
  if (data.journal !== null && data.journal !== undefined) {
    if (!validateJournal(data.journal)) rejectedSections.push("journal");
  }
  if (data.tradeState !== null && data.tradeState !== undefined) {
    if (!validateTradeState(data.tradeState)) rejectedSections.push("tradeState");
  }
  if (data.theme !== null && data.theme !== undefined) {
    if (!validateTheme(data.theme)) rejectedSections.push("theme");
  }
  if (data.quizState !== null && data.quizState !== undefined) {
    if (!validateQuizState(data.quizState)) rejectedSections.push("quizState");
  }
  if (data.riskLimits !== null && data.riskLimits !== undefined) {
    if (!validateRiskLimits(data.riskLimits)) rejectedSections.push("riskLimits");
  }
  if (data.paperTrading !== null && data.paperTrading !== undefined) {
    if (!validatePaperTrading(data.paperTrading)) rejectedSections.push("paperTrading");
  }
  if (data.orderAudit !== null && data.orderAudit !== undefined) {
    if (!validateOrderAudit(data.orderAudit)) rejectedSections.push("orderAudit");
  }

  return {
    valid: rejectedSections.length === 0,
    rejectedSections,
  };
}

/**
 * Retrieves raw data directly from localStorage.
 * @param key The localStorage key.
 * @returns The raw string data or null if not found.
 */
function getDataFromLocalStorage(key: string): string | null {
  if (!browser && typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

/**
 * Strips exchange credentials, API keys, and sensitive tokens from settings JSON
 * for unencrypted backup exports (BUG-0283).
 */
export function sanitizeSettingsForUnencryptedExport(settingsJson: string | null): string | null {
  if (!settingsJson) return null;
  try {
    const parsed = JSON.parse(settingsJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

    // Blank out exchange credentials
    parsed.apiKeys = {
      bitunix: { key: "", secret: "" },
      bitget: { key: "", secret: "", passphrase: "" },
    };
    delete parsed.encryptedApiKeys;
    delete parsed.encryptedSecrets;

    // Blank out third-party and AI API keys (SENSITIVE_KEYS inventory + extras)
    for (const key of SENSITIVE_KEYS) {
      if (key in parsed) {
        parsed[key] = "";
      }
    }
    parsed.openrouterApiKey = "";
    parsed.imgurClientId = "";

    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

/**
 * Generates the BackupFile structure containing validated data from localStorage.
 */
export async function getBackupPayload(password?: string): Promise<BackupFile | null> {
  if (!browser && typeof localStorage === "undefined") return null;

  // Validation: Ensure we are not backing up garbage
  const getValidatedData = (key: string): string | null => {
    const raw = getDataFromLocalStorage(key);
    if (!raw) return null;
    try {
      JSON.parse(raw); // Check if valid JSON
      return raw;
    } catch {
      console.error(
        `Backup Logic: Detected corrupt JSON for key ${key}. Skipping.`,
      );
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
    theme:
      getDataFromLocalStorage(CONSTANTS.LOCAL_STORAGE_THEME_KEY) ||
      getDataFromLocalStorage("theme"),
    quizState: getValidatedData(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY),
    riskLimits: getValidatedData(CONSTANTS.LOCAL_STORAGE_RISK_KEY),
    paperTrading: getValidatedData(CONSTANTS.LOCAL_STORAGE_PAPER_KEY),
    orderAudit: getValidatedData(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY),
  };

  const backupFile: BackupFile = {
    backupVersion: BACKUP_VERSION,
    timestamp: new Date().toISOString(),
    appName: APP_NAME,
  };

  if (password) {
    const dataString = JSON.stringify(rawData);
    const blob = await cryptoService.encrypt(dataString, password);
    backupFile.encryptedData = blob.ciphertext;
    backupFile.salt = blob.salt;
    backupFile.iv = blob.iv;
    backupFile.kdfHash = blob.kdfHash;
    backupFile.isEncrypted = true;
  } else {
    // Unencrypted backup: sanitize sensitive credentials and API keys (BUG-0283)
    const sanitizedData: BackupData = {
      ...rawData,
      settings: sanitizeSettingsForUnencryptedExport(rawData.settings),
    };
    backupFile.data = sanitizedData;
    backupFile.isEncrypted = false;
  }

  return backupFile;
}

/**
 * Creates a JSON backup file of the user's data and triggers a download.
 */
export async function createBackup(password?: string) {
  if (!browser) return;

  const backupFile = await getBackupPayload(password);
  if (!backupFile) return;

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
 * @returns An object indicating success or failure with a message and optional rejected sections.
 */
export async function restoreFromBackup(
  jsonContent: string,
  password?: string,
): Promise<RestoreResult> {
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
        // New CryptoService handles legacy via CBC fallback if method is AES-CBC.
        // We defaults to AES-CBC for backups < V4 if needed, but usually explicit.

        let method: "AES-GCM" | "AES-CBC" = "AES-GCM"; // Default for V4
        if (backup.backupVersion < 4) {
          method = "AES-CBC";
        }

        if (!backup.encryptedData || !backup.salt || !backup.iv) {
          return {
            success: false,
            message: "Invalid encrypted backup file format (Missing Salt/IV).",
          };
        }

        decryptedJson = await cryptoService.decrypt({
          ciphertext: backup.encryptedData,
          salt: backup.salt,
          iv: backup.iv,
          method: method,
          kdfHash: backup.kdfHash
        }, password);

        data = JSON.parse(decryptedJson);
      } catch {
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

    // --- Strict Structural & Schema Validation (BUG-0284) ---
    const validation = validateBackupSections(data);
    if (!validation.valid) {
      return {
        success: false,
        message: `Backup restore rejected: Invalid section(s): ${validation.rejectedSections.join(", ")}. No changes were applied.`,
        rejectedSections: validation.rejectedSections,
      };
    }

    // --- Restore to localStorage (Fail-Closed: Only executed after all validations pass) ---
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
      const sanitizedTheme = data.theme.replace(/^"|"$/g, "").trim();
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY, sanitizedTheme);
      localStorage.setItem("theme", sanitizedTheme);
    }
    if (data.quizState) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_QUIZ_KEY, data.quizState);
    }
    if (data.riskLimits) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY, data.riskLimits);
    }
    if (data.paperTrading) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY, data.paperTrading);
    }
    if (data.orderAudit) {
      localStorage.setItem(CONSTANTS.LOCAL_STORAGE_ORDER_AUDIT_KEY, data.orderAudit);
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
