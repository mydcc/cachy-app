// @vitest-environment happy-dom
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

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { cryptoService, isValidLegacyHexKey } from "./cryptoService";
import legacyFixture from "./__fixtures__/legacy-aes-cbc-blob.json";

vi.mock("$app/environment", () => ({
  browser: true,
}));

// Mock Web Crypto API for tests
beforeAll(() => {
  if (!global.window) {
    global.window = {} as unknown as Window & typeof globalThis;
  }
  if (!global.window.crypto) {
    global.window.crypto = {
      getRandomValues: (buffer: ArrayBufferView) => {
        return require("crypto").randomFillSync(buffer);
      },
      subtle: {
        importKey: async () => ({}),
        deriveKey: async () => ({}),
        encrypt: async () => new Uint8Array(32).buffer,
        decrypt: async () => new Uint8Array(32).buffer,
      },
    } as unknown as Crypto;
  }
});

describe("CryptoService", () => {
  it.skip("should encrypt and decrypt a string using generated key", async () => {
    // Skipped because full SubtleCrypto mock is complex
    const original = "my-secret-api-key";
    const password = "master-password";

    // Encrypt
    const encryptedBlob = await cryptoService.encrypt(original, password);

    expect(encryptedBlob.ciphertext).toBeDefined();
    expect(encryptedBlob.iv).toBeDefined();
    expect(encryptedBlob.salt).toBeDefined();
    expect(encryptedBlob.method).toBe("AES-GCM");

    // Decrypt
    const decrypted = await cryptoService.decrypt(encryptedBlob, password);
    expect(decrypted).toBe(original);
  });

  it.skip("should fail decryption with wrong password", async () => {
    const original = "secret";
    const blob = await cryptoService.encrypt(original, "correct-password");

    await expect(cryptoService.decrypt(blob, "wrong-password")).rejects.toThrow();
  });

  it.skip("should handle session unlocking", async () => {
    const password = "session-password";

    // Unlock session
    const unlocked = await cryptoService.unlockSession(password);
    expect(unlocked).toBe(true);
    expect(cryptoService.isUnlocked()).toBe(true);

    // Encrypt without explicit password (uses session)
    const blob = await cryptoService.encrypt("data-using-session");

    // Decrypt using session
    const decrypted = await cryptoService.decrypt(blob);
    expect(decrypted).toBe("data-using-session");

    // Lock session
    cryptoService.lockSession();
    expect(cryptoService.isUnlocked()).toBe(false);

    // Try decrypting without password after lock
    await expect(cryptoService.decrypt(blob)).rejects.toThrow();
  });
});

// BUG-0004: legacy AES-CBC credential blobs (pre-Web-Crypto rewrite,
// commit 560a15c7) were encrypted with PBKDF2 at LEGACY_ITERATIONS (10000)
// and SHA-1, but attemptDecrypt() always derived at STRONG_ITERATIONS
// (600000), which for AES-CBC — no authentication tag — can silently
// return garbage instead of throwing. See docs/TODO.md item 12 and
// docs/backlog/bugs/BUG-0004-legacy-aes-cbc-blobs.md.
describe("CryptoService — legacy AES-CBC blobs (BUG-0004)", () => {
  it("decrypts a pre-rewrite blob encrypted at LEGACY_ITERATIONS/SHA-1", async () => {
    const decrypted = await cryptoService.decrypt(
      legacyFixture.blob as EncryptedBlobFixture,
      legacyFixture.password,
    );
    expect(decrypted).toBe(legacyFixture.plaintext);
  });

  it("rejects the legacy blob with the wrong password instead of returning garbage", async () => {
    await expect(
      cryptoService.decrypt(legacyFixture.blob as EncryptedBlobFixture, "not-the-password"),
    ).rejects.toThrow();
  });

  it("still round-trips AES-GCM blobs through the same password path", async () => {
    const original = "current-format-secret";
    const password = "another-password";

    const blob = await cryptoService.encrypt(original, password);
    expect(blob.method).toBe("AES-GCM");

    const decrypted = await cryptoService.decrypt(blob, password);
    expect(decrypted).toBe(original);
  });

  it("treats a successfully-padded but non-UTF-8 plaintext as garbage, not a result", async () => {
    // Simulates the case AES-CBC can't prevent on its own: PKCS7 padding
    // happens to validate under the wrong key, but the recovered bytes
    // aren't valid UTF-8. attemptDecrypt()'s fatal decode must catch this
    // rather than returning it (with replacement characters) as if it were
    // real plaintext.
    const invalidUtf8 = new Uint8Array([0x80, 0x81, 0x82, 0x83]).buffer;
    const decryptSpy = vi
      .spyOn(window.crypto.subtle, "decrypt")
      .mockResolvedValue(invalidUtf8);

    await expect(
      cryptoService.decrypt(legacyFixture.blob as EncryptedBlobFixture, legacyFixture.password),
    ).rejects.toThrow();

    decryptSpy.mockRestore();
  });
});

interface EncryptedBlobFixture {
  ciphertext: string;
  iv: string;
  salt: string;
  method: "AES-GCM" | "AES-CBC";
  kdfHash?: "SHA-512" | "SHA-256";
}

// BUG-0520: the legacy ladder's third rung (LEGACY_ITERATIONS = 10000,
// SHA-1) can never fire for a device CryptoKey — device keys postdate the
// CryptoJS rewrite (b8537c98 came after 560a15c7), so no device-key blob
// exists at those parameters. The ladder must not waste a duplicate
// derivation there, and the session cache key must include the iteration
// count so a varied count can never return a stale key.
describe("CryptoService — legacy ladder with device CryptoKey (BUG-0520)", () => {
  async function importDeviceKey(): Promise<CryptoKey> {
    return window.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("device-key-material-32-bytes!!"),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  }

  it("never derives at LEGACY_ITERATIONS for a CryptoKey caller", async () => {
    const deviceKey = await importDeviceKey();
    const deriveSpy = vi.spyOn(window.crypto.subtle, "deriveKey");
    deriveSpy.mockClear();
    try {
      await expect(
        cryptoService.decrypt(legacyFixture.blob as EncryptedBlobFixture, deviceKey),
      ).rejects.toThrow();
      const iterations = deriveSpy.mock.calls.map(
        (call) => (call[0] as Pbkdf2Params).iterations,
      );
      expect(iterations.length).toBeGreaterThan(0);
      expect(iterations).not.toContain(10000);
      expect(deriveSpy).toHaveBeenCalledTimes(2);
    } finally {
      deriveSpy.mockRestore();
    }
  });

  it("keys the session cache by iteration count", async () => {
    await cryptoService.unlockSession("cache-key-password");
    try {
      const svc = cryptoService as unknown as {
        getSessionKeyForSalt(
          salt: Uint8Array,
          usages: KeyUsage[],
          hash: "SHA-512" | "SHA-256" | "SHA-1",
          iterations?: number,
        ): Promise<CryptoKey>;
      };
      const salt = window.crypto.getRandomValues(new Uint8Array(16));
      const keyStrong = await svc.getSessionKeyForSalt(salt, ["decrypt"], "SHA-512", 600000);
      const keyStrongCached = await svc.getSessionKeyForSalt(salt, ["decrypt"], "SHA-512", 600000);
      const keyLegacy = await svc.getSessionKeyForSalt(salt, ["decrypt"], "SHA-512", 10000);
      expect(keyStrongCached).toBe(keyStrong);
      expect(keyLegacy).not.toBe(keyStrong);
    } finally {
      cryptoService.lockSession();
    }
  });
});

// BUG-0517: the BUG-0053 canary guard ran before the legacy device-key
// migration, so an upgrading user (legacy `cachy_device_id` + encrypted
// secrets) got DeviceKeyLost while the key sat untouched in localStorage.
// BUG-0518: the guard input is now a centrally computed option, not a
// per-caller argument.
describe("CryptoService — legacy migration vs loss guard (BUG-0517/0518)", () => {
  const svc = cryptoService as unknown as {
    loadKeyFromDB: (alias: string) => Promise<CryptoKey | null>;
    saveKeyToDB: (alias: string, key: CryptoKey) => Promise<void>;
  };
  const LEGACY_HEX = "ab".repeat(32);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubDb() {
    vi.spyOn(svc, "loadKeyFromDB").mockResolvedValue(null);
    return vi.spyOn(svc, "saveKeyToDB").mockResolvedValue(undefined);
  }

  async function importLegacyKey(hex: string): Promise<CryptoKey> {
    const bytes = hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16));
    return window.crypto.subtle.importKey(
      "raw",
      new Uint8Array(bytes),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  }

  it("migrates the legacy key when secrets exist instead of throwing DeviceKeyLost", async () => {
    const saveSpy = stubDb();
    const legacyKey = await importLegacyKey(LEGACY_HEX);
    const canaryBlob = await cryptoService.encrypt("canary", legacyKey);

    const migrated = await cryptoService.getOrGenerateDeviceKey({
      legacyHexKey: LEGACY_HEX,
      canaryBlob,
      hasOrphanedCiphertext: true,
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    await expect(cryptoService.decrypt(canaryBlob, migrated)).resolves.toBe("canary");
  });

  it("migrates legacy data predating the canary without a check", async () => {
    const saveSpy = stubDb();

    const migrated = await cryptoService.getOrGenerateDeviceKey({
      legacyHexKey: LEGACY_HEX,
      hasOrphanedCiphertext: true,
    });

    expect(migrated).toBeDefined();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });

  it("persists nothing and still reports DeviceKeyLost when the migrated key fails the canary", async () => {
    const saveSpy = stubDb();
    const otherKey = await importLegacyKey("cd".repeat(32));
    const foreignCanary = await cryptoService.encrypt("canary", otherKey);

    await expect(
      cryptoService.getOrGenerateDeviceKey({
        legacyHexKey: LEGACY_HEX,
        canaryBlob: foreignCanary,
        hasOrphanedCiphertext: true,
      }),
    ).rejects.toThrow("DeviceKeyLost");
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("refuses to mint a replacement key when ciphertext exists and no legacy key does (BUG-0053)", async () => {
    const saveSpy = stubDb();

    await expect(
      cryptoService.getOrGenerateDeviceKey({ hasOrphanedCiphertext: true }),
    ).rejects.toThrow("DeviceKeyLost");
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("mints a fresh key on first run (nothing stored anywhere)", async () => {
    const saveSpy = stubDb();

    const key = await cryptoService.getOrGenerateDeviceKey({});
    expect(key).toBeDefined();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    const key2 = await cryptoService.getOrGenerateDeviceKey();
    expect(key2).toBeDefined();
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it("returns the IndexedDB key without consulting guard or migration", async () => {
    const stored = {} as CryptoKey;
    vi.spyOn(svc, "loadKeyFromDB").mockResolvedValue(stored);
    const saveSpy = vi.spyOn(svc, "saveKeyToDB").mockResolvedValue(undefined);

    await expect(
      cryptoService.getOrGenerateDeviceKey({
        legacyHexKey: LEGACY_HEX,
        hasOrphanedCiphertext: true,
      }),
    ).resolves.toBe(stored);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["non-hex characters", "zz".repeat(32)],
    ["odd length", "abc"],
    ["empty string", ""],
    ["valid hex but truncated (32 chars)", "ab".repeat(16)],
    ["valid hex but too long (66 chars)", `ab${"cd".repeat(32)}`],
  ])("treats invalid legacy input (%s) as no legacy key", async (_label, badHex) => {
    const saveSpy = stubDb();

    await expect(
      cryptoService.getOrGenerateDeviceKey({
        legacyHexKey: badHex,
        hasOrphanedCiphertext: true,
      }),
    ).rejects.toThrow("DeviceKeyLost");
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("treats invalid legacy input as absent on first run (mints, does not import garbage)", async () => {
    const saveSpy = stubDb();

    const key = await cryptoService.getOrGenerateDeviceKey({ legacyHexKey: "zz" });
    expect(key).toBeDefined();
    expect(saveSpy).toHaveBeenCalledTimes(1);
  });
});

describe("isValidLegacyHexKey (BUG-0517)", () => {
  it("accepts 64-char hex (either case) — the only shape the legacy generator wrote", () => {
    expect(isValidLegacyHexKey("ab".repeat(32))).toBe(true);
    expect(isValidLegacyHexKey("AB00FF".padEnd(64, "0"))).toBe(true);
  });

  it("rejects empty, odd-length, non-hex, and wrong-length input", () => {
    expect(isValidLegacyHexKey("")).toBe(false);
    expect(isValidLegacyHexKey("abc")).toBe(false);
    expect(isValidLegacyHexKey("zz".repeat(32))).toBe(false);
    expect(isValidLegacyHexKey("ab cd")).toBe(false);
    expect(isValidLegacyHexKey("AB00FF")).toBe(false);
    expect(isValidLegacyHexKey("ab".repeat(16))).toBe(false);
    expect(isValidLegacyHexKey("ab".repeat(33))).toBe(false);
  });
});
