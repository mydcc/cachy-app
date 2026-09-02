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
import type { ApiKeys, Settings } from "../settings.svelte";
import {
  migrateAccounts,
  migrateEncryptedAccountKeys,
  redactAccounts,
  type ExchangeAccount,
  type LegacyCredentialShape,
} from "./accounts";

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

/** True when at least one credential field of the entry holds a value. */
export function apiKeyHasMaterial(
  entry: ApiKeys | undefined,
): boolean {
  return (
    !!entry &&
    Object.values(entry).some((v) => typeof v === "string" && v.length > 0)
  );
}


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
  applyAccounts(
    merged: Settings & LegacyCredentialShape,
    currentAccounts: ExchangeAccount[],
  ): {
    isEncrypted: boolean;
    isLocked: boolean;
    encryptedAccountKeys: Record<string, EncryptedBlob> | undefined;
    accounts: ExchangeAccount[];
    activeAccountId: string;
  } {
    // Storage may still carry the venue-indexed shape (FEAT-0333). Both are
    // read through the migration, so a profile converts on the load that
    // first sees it and nothing downstream has to know which shape it came
    // from. Nothing is decrypted here: the ciphertext is only re-indexed.
    const stored = migrateAccounts(merged, {
      accounts: merged.accounts,
      activeAccountId: merged.activeAccountId,
    });
    const encryptedAccountKeys =
      merged.encryptedAccountKeys ??
      migrateEncryptedAccountKeys(merged.encryptedApiKeys);

    if (
      encryptedAccountKeys &&
      Object.keys(encryptedAccountKeys).length > 0
    ) {
      const encrypted = merged.isEncrypted === true;
      return {
        isEncrypted: encrypted,
        // Obfuscation mode has nothing to unlock: the device key suffices.
        isLocked: encrypted,
        encryptedAccountKeys,
        // Names and ids survive, credentials do not — they come back from
        // the ciphertext, and until they do nothing may present stale
        // material as if it were live.
        accounts: redactAccounts(stored.accounts),
        activeAccountId: stored.activeAccountId,
      };
    }

    // Legacy plaintext, or nothing at all. Credentials are written into the
    // existing account objects rather than replacing them, because the
    // credential form binds to them — the same reason the venue-indexed
    // path assigned into `currentApiKeys` instead of returning a new object.
    // Storage decides *membership*; the live objects keep their identity.
    //
    // This used to start from `currentAccounts` and only ever add, which
    // meant a live account with no stored counterpart survived the load.
    // With the cross-tab `storage` listener calling `load()`, an account
    // deleted in one tab came back in another — and that tab's next
    // autosave wrote it back to disk, undoing the deletion for both.
    // The encrypted branch above is already authoritative, because it
    // returns `redactAccounts(stored.accounts)`; only this one was not.
    const accounts = stored.accounts.map((account) => {
      const live = currentAccounts.find(
        (existing) => existing.id === account.id,
      );
      if (!live) return account;
      // Assign into the existing object rather than replacing it: the
      // credential form binds to these, for the reason given above.
      live.keys = account.keys;
      return live;
    });

    return {
      isEncrypted: false,
      isLocked: false,
      encryptedAccountKeys,
      accounts,
      activeAccountId: stored.activeAccountId,
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
  async decryptAccountKeysWithDeviceKey(
    encryptedAccountKeys: Record<string, EncryptedBlob>,
  ): Promise<{ keysByAccount: Record<string, ApiKeys>; failures: number }> {
    const accountIds = Object.keys(encryptedAccountKeys);
    const deviceKey = await this.getDeviceKey(accountIds.length > 0);

    const restored: { keysByAccount: Record<string, ApiKeys>; failures: number } =
      { keysByAccount: {}, failures: 0 };

    await Promise.all(
      accountIds.map(async (accountId) => {
        const blob = encryptedAccountKeys[accountId];
        if (!blob) return;
        try {
          const json = await cryptoService.decrypt(blob, deviceKey);
          restored.keysByAccount[accountId] = JSON.parse(json);
        } catch (e) {
          restored.failures++;
          console.error(
            "[Settings] Failed to decrypt API keys for account " + accountId,
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
  async applyAccountKeyEncryption(
    data: Settings,
    liveAccounts: readonly ExchangeAccount[],
    canEncrypt: boolean,
    encryptionPassword: string | CryptoKey | undefined,
    allowClear: boolean,
  ): Promise<void> {
    if (!canEncrypt) return;

    if (!data.accounts) {
      data.accounts = redactAccounts(liveAccounts);
    }
    if (!data.encryptedAccountKeys) {
      data.encryptedAccountKeys = {};
    }

    for (const account of liveAccounts) {
      const creds = account.keys;
      const hasMaterial = apiKeyHasMaterial(creds);

      if (!hasMaterial) {
        if (allowClear) delete data.encryptedAccountKeys[account.id];
        continue;
      }

      try {
        data.encryptedAccountKeys[account.id] = await cryptoService.encrypt(
          JSON.stringify(creds),
          encryptionPassword,
        );
      } catch (err) {
        // Never fall back to plaintext: keep any previous ciphertext and
        // let the next save retry. The in-memory copy stays untouched.
        if (import.meta.env.DEV) {
          console.error(
            `[Settings] Failed to encrypt API keys for account ${account.id}:`,
            err,
          );
        }
      }
    }

    // Ciphertext for an account that no longer exists is Class A material
    // the user believes they deleted. The loop above only ever visits live
    // accounts, so a removed account's blob would otherwise sit in
    // `localStorage` indefinitely. Gated on `allowClear` for the same
    // reason the per-account `delete` above is: a partial save must not be
    // able to erase credentials it simply could not see.
    if (allowClear) {
      const liveIds = new Set(liveAccounts.map((account) => account.id));
      for (const id of Object.keys(data.encryptedAccountKeys)) {
        if (!liveIds.has(id)) delete data.encryptedAccountKeys[id];
      }
    }
  }
}
