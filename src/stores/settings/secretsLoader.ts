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
 * Shape-preserving redaction for the exchange-credential block (BUG-0280).
 * Callers pass `$state.snapshot(this.apiKeys)` so the autosave `$effect`
 * keeps tracking credential edits through the argument evaluation; the
 * returned placeholders (`_liveApiKeys` deliberately unused) are all this
 * serialization ever emits, so neither `toJSON()` nor anything downstream
 * of it can leak key, secret, or passphrase material.
 */
export function redactApiKeys(
  _liveApiKeys: Settings["apiKeys"],
): Settings["apiKeys"] {
  return {
    bitunix: { key: "", secret: "" },
    bitget: { key: "", secret: "", passphrase: "" },
  };
}

/** True when at least one credential field of the entry holds a value. */
export function apiKeyHasMaterial(
  entry: Settings["apiKeys"]["bitunix"],
): boolean {
  return (
    !!entry &&
    Object.values(entry).some((v) => typeof v === "string" && v.length > 0)
  );
}

const EXCHANGE_KEY_SLOTS = ["bitunix", "bitget"] as const;

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
   * component bound to it -- the encrypted branches replace it wholesale
   * (nothing to preserve: the plain keys must be empty until decryption
   * refills them), same as before this split.
   *
   * Three storage states exist (BUG-0280):
   * - master-password blobs + `isEncrypted`: locked until `unlock(password)`;
   * - device-key blobs without `isEncrypted`: obfuscation mode, unlocked,
   *   caller schedules the background device-key decryption;
   * - no blobs: legacy plaintext (kept in memory; the next save encrypts it)
   *   or nothing at all.
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
      const encrypted = merged.isEncrypted === true;
      return {
        isEncrypted: encrypted,
        // Obfuscation mode has nothing to unlock: the device key suffices.
        isLocked: encrypted,
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

  /**
   * Decrypts device-key-encrypted exchange credentials (BUG-0280) for the
   * obfuscation-mode background refill on load. Returns per-exchange
   * plaintext plus a failure count so callers can surface decryption
   * problems; a failed blob never yields partial credentials.
   */
  async decryptApiKeysWithDeviceKey(
    encryptedApiKeys: NonNullable<Settings["encryptedApiKeys"]>,
  ): Promise<{
    bitunix?: Settings["apiKeys"]["bitunix"];
    bitget?: Settings["apiKeys"]["bitget"];
    failures: number;
  }> {
    const hasStoredSecrets = Object.keys(encryptedApiKeys).length > 0;
    const deviceKey = await this.getDeviceKey(hasStoredSecrets);

    const restored: {
      bitunix?: Settings["apiKeys"]["bitunix"];
      bitget?: Settings["apiKeys"]["bitget"];
      failures: number;
    } = { failures: 0 };

    await Promise.all(
      EXCHANGE_KEY_SLOTS.map(async (exchange) => {
        const blob = encryptedApiKeys[exchange];
        if (!blob) return;
        try {
          const json = await cryptoService.decrypt(blob, deviceKey);
          restored[exchange] = JSON.parse(json);
        } catch (e) {
          restored.failures++;
          console.error(
            "[Settings] Failed to decrypt " + exchange + " API keys",
            e,
          );
        }
      }),
    );

    return restored;
  }

  /**
   * Encrypts the live exchange credentials into `data.encryptedApiKeys`
   * before persistence (BUG-0280) -- same treatment as `applyFieldEncryption`
   * gives `SENSITIVE_KEYS`, just for the nested `apiKeys` block, which
   * `toJSON()` only ever emits redacted. `canEncrypt = false` (locked
   * master-password session) keeps whatever ciphertext already exists.
   * With `allowClear = false` (background device-key decryption still
   * pending, live fields not yet refilled) existing blobs are preserved so
   * the startup autosave cannot race them away; clearing stays possible as
   * soon as the refill settled or the user typed new material.
   */
  async applyApiKeyEncryption(
    data: Settings,
    liveApiKeys: Settings["apiKeys"],
    canEncrypt: boolean,
    encryptionPassword: string | CryptoKey | undefined,
    allowClear: boolean,
  ): Promise<void> {
    if (!canEncrypt) return;

    if (!data.apiKeys) {
      data.apiKeys = redactApiKeys(liveApiKeys);
    }
    if (!data.encryptedApiKeys) {
      data.encryptedApiKeys = {};
    }

    for (const exchange of EXCHANGE_KEY_SLOTS) {
      const creds = liveApiKeys?.[exchange];
      const hasMaterial = apiKeyHasMaterial(creds);

      if (!hasMaterial) {
        if (allowClear) delete data.encryptedApiKeys[exchange];
        continue;
      }

      try {
        data.encryptedApiKeys[exchange] = await cryptoService.encrypt(
          JSON.stringify(creds),
          encryptionPassword,
        );
      } catch (err) {
        // Never fall back to plaintext: keep any previous ciphertext and
        // let the next save retry. The in-memory copy stays untouched.
        if (import.meta.env.DEV) {
          console.error(`[Settings] Failed to encrypt ${exchange} API keys:`, err);
        }
      }
    }
  }
}
