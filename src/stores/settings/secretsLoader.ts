/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
import { cryptoService, type EncryptedBlob } from "../../services/cryptoService";
import type { Settings } from "../settings.svelte";

/**
 * Fields whose plain-text value is Klasse-A and gets encrypted before it
 * ever reaches `localStorage` (FEAT-0197 PR 3). Lives here, not on
 * `SettingsManager`, because every consumer of it -- `SecretsLoader` itself,
 * plus `unlock()`/`lock()`/`setMasterPassword()` on `SettingsManager` -- is
 * about the same encrypted-secret concern.
 */
export const SENSITIVE_KEYS: (keyof Settings)[] = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "discordBotToken",
  "newsApiKey",
  "cryptoPanicApiKey",
  "cmcApiKey",
  "imgbbApiKey",
  "appAccessToken",
  "cloudToken",
];

/**
 * Encrypted-credential handling and the `secretsReady` handshake, as one
 * unit with one owner. `SettingsManager` constructs this and calls into it
 * from `load()` and `save()`; it can't import `settings.svelte.ts` back
 * (circular with the class that constructs it), so it takes only what each
 * method needs as parameters rather than reaching for `SettingsManager`
 * fields itself -- same collaborator shape as `EntitlementStore` (PR 2) and
 * FEAT-0196's `activeTechnicals/*` split.
 */
export class SecretsLoader {
  private _deviceKey: string | CryptoKey | null = null;
  private _deviceKeyPromise: Promise<string | CryptoKey> | null = null;

  /**
   * Securely retrieves the device key used to obfuscate secrets when no
   * master password is set. Migrates from localStorage to IndexedDB if
   * necessary. Cached for the lifetime of this instance.
   *
   * The in-flight promise is shared: parallel callers (the device-key-lost
   * canary check and background decryption) must hit
   * `getOrGenerateDeviceKey` exactly once — both to keep a single IndexedDB
   * round-trip and so one-shot loss guards ("refuse to mint a replacement
   * key") cannot be consumed by one caller while the other silently gets a
   * fresh, wrong key.
   */
  getDeviceKey(hasStoredSecrets: boolean): Promise<string | CryptoKey> {
    if (!browser) return Promise.resolve("server-side-key-placeholder");
    if (this._deviceKey) return Promise.resolve(this._deviceKey);
    if (this._deviceKeyPromise) return this._deviceKeyPromise;

    // 1. Check for legacy key in localStorage for migration
    const legacyKey = localStorage.getItem("cachy_device_id");

    // 2. Get or Generate secure key (handles migration if legacyKey provided)
    this._deviceKeyPromise = cryptoService
      .getOrGenerateDeviceKey(legacyKey || undefined, hasStoredSecrets)
      .then((key) => {
        this._deviceKey = key;

        // 3. Cleanup legacy key once the migration succeeded
        if (legacyKey) {
          if (import.meta.env.DEV) {
            console.warn(
              "[Settings] Migrated device key from localStorage to secure storage.",
            );
          }
          localStorage.removeItem("cachy_device_id");
        }

        return key;
      })
      .catch((e) => {
        // Don't cache failures: a transient IndexedDB error must be
        // retryable instead of poisoning every later caller.
        this._deviceKeyPromise = null;
        throw e;
      });

    return this._deviceKeyPromise;
  }

  /**
   * Resolves `encryptedApiKeys` / `isEncrypted` / `isLocked` / `apiKeys` from
   * a merged settings blob. `currentApiKeys` is mutated in place for the
   * legacy (unencrypted) branch to preserve its object identity for any
   * component bound to it -- the encrypted branch replaces it wholesale
   * (nothing to preserve: the plain keys must be empty while locked), same
   * as before this split.
   */
  applyApiKeys(
    merged: Settings,
    currentApiKeys: Settings["apiKeys"],
  ): {
    isEncrypted: boolean;
    isLocked: boolean;
    encryptedApiKeys: Settings["encryptedApiKeys"];
    apiKeys: Settings["apiKeys"];
  } {
    if (
      merged.encryptedApiKeys &&
      Object.keys(merged.encryptedApiKeys).length > 0
    ) {
      return {
        isEncrypted: true,
        isLocked: true,
        encryptedApiKeys: merged.encryptedApiKeys,
        apiKeys: {
          bitunix: { key: "", secret: "" },
          bitget: { key: "", secret: "", passphrase: "" },
        },
      };
    }

    if (merged.apiKeys) {
      if (merged.apiKeys.bitunix) currentApiKeys.bitunix = merged.apiKeys.bitunix;
      if (merged.apiKeys.bitget) currentApiKeys.bitget = merged.apiKeys.bitget;
    }
    return {
      isEncrypted: false,
      isLocked: false,
      encryptedApiKeys: merged.encryptedApiKeys,
      apiKeys: currentApiKeys,
    };
  }

  /**
   * Device-key loss detection via the `_deviceKeyCanary` blob that
   * `applyFieldEncryption` always writes: if the canary cannot be decrypted
   * with the current device key, IndexedDB lost its key and **every**
   * encrypted secret is unrecoverable until re-entered. Distinguishes this
   * total-loss case from single corrupted blobs (plain failure count).
   * Legacy data without a canary counts as "not lost" to avoid false alarms.
   */
  async isDeviceKeyLost(
    encryptedSecrets: Record<string, EncryptedBlob> | undefined,
  ): Promise<boolean> {
    const canary = encryptedSecrets?.["_deviceKeyCanary"];
    if (!canary) return false;
    try {
      const hasStoredSecrets = Object.keys(encryptedSecrets || {}).length > 0;
      const deviceKey = await this.getDeviceKey(hasStoredSecrets);
      await cryptoService.decrypt(canary, deviceKey);
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Decrypts `encryptedSecrets` in obfuscation mode (no master password) and
   * writes each decrypted `SENSITIVE_KEYS` value back via `setSensitiveField`.
   * Returns the failure count. The caller is responsible for resolving
   * `secretsReady` once this settles (success or failure) -- that's a
   * `SettingsManager` invariant this class has no business owning.
   */
  async decryptSecrets(
    encryptedSecrets: Record<string, EncryptedBlob> | undefined,
    setSensitiveField: (key: keyof Settings, value: string) => void,
  ): Promise<number> {
    const hasStoredSecrets = Object.keys(encryptedSecrets || {}).length > 0;
    const deviceKey = await this.getDeviceKey(hasStoredSecrets);
    const entries = Object.entries(encryptedSecrets || {});
    let failures = 0;

    await Promise.all(
      entries.map(async ([key, blob]) => {
        if (key === "_deviceKeyCanary") return;
        try {
          const decrypted = await cryptoService.decrypt(blob, deviceKey);
          if (SENSITIVE_KEYS.includes(key as keyof Settings)) {
            setSensitiveField(key as keyof Settings, decrypted);
          }
        } catch (e) {
          failures++;
          console.error("[Settings] Failed to decrypt secret " + key, e);
        }
      }),
    );

    return failures;
  }

  /**
   * Encrypts every non-empty `SENSITIVE_KEYS` field on `data` in place
   * (mutates and redacts the plain-text value), plus the device-key canary.
   * `canEncrypt = false` (session locked, no key available) just redacts
   * without touching whatever ciphertext is already in `data.encryptedSecrets`.
   */
  async applyFieldEncryption(
    data: Settings,
    canEncrypt: boolean,
    encryptionPassword: string | CryptoKey | undefined,
  ): Promise<void> {
    if (!data.encryptedSecrets) {
      data.encryptedSecrets = {};
    }

    if (!canEncrypt) {
      for (const key of SENSITIVE_KEYS) {
        // @ts-expect-error -- dynamic index over SENSITIVE_KEYS on an untyped payload
        data[key] = "";
      }
      return;
    }

    const encryptionTasks = SENSITIVE_KEYS.map(async (key) => {
      const value = data[key];

      if (typeof value === "string" && value.length > 0) {
        try {
          const blob = await cryptoService.encrypt(value, encryptionPassword);
          data.encryptedSecrets![key] = blob;
          // @ts-expect-error -- dynamic index over SENSITIVE_KEYS on an untyped payload
          data[key] = "";
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error(`[Settings] Failed to encrypt ${key}:`, err);
          }
          // @ts-expect-error -- dynamic index over SENSITIVE_KEYS on an untyped payload
          data[key] = "";
        }
      }
    });

    // Always write a canary to detect key loss without data loss
    encryptionTasks.push(
      (async () => {
        try {
          data.encryptedSecrets!["_deviceKeyCanary"] = await cryptoService.encrypt(
            "canary",
            encryptionPassword,
          );
        } catch (e) {
          if (import.meta.env.DEV) console.error("Failed to encrypt canary", e);
        }
      })(),
    );

    await Promise.all(encryptionTasks);
  }
}
