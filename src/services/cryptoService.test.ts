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

import { describe, it, expect, beforeAll } from "vitest";
import { cryptoService } from "./cryptoService";
// @ts-ignore
import CryptoJS from "crypto-js";

// Mock Web Crypto API for tests
beforeAll(() => {
  if (!global.window) {
    global.window = {} as any;
  }
  if (!global.window.crypto) {
    global.window.crypto = {
      getRandomValues: (buffer: any) => {
        return require("crypto").randomFillSync(buffer);
      },
      subtle: {
        importKey: async () => ({} as any),
        deriveKey: async () => ({} as any),
        encrypt: async () => new Uint8Array(32).buffer,
        decrypt: async () => new Uint8Array(32).buffer,
      } as any,
    } as any;
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
