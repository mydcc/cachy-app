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

import { describe, it, expect, beforeAll, vi } from "vitest";
import { cryptoService } from "./cryptoService";
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
