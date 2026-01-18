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

import CryptoJS from "crypto-js";

/**
 * CryptoService for AES-256-bit encryption/decryption using crypto-js.
 * This is used to protect sensitive data in backups.
 */

const STRONG_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 10000;

/**
 * Encrypts a string using a password with robust PBKDF2 key derivation.
 * Returns an object with the encrypted data, salt, and IV.
 */
export async function encrypt(
  text: string,
  password: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  // 1. Generate random Salt (128-bit)
  const salt = CryptoJS.lib.WordArray.random(128 / 8);

  // 2. Derive Key (256-bit) using PBKDF2 with 600k iterations (OWASP recommendation)
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: STRONG_ITERATIONS,
  });

  // 3. Generate random IV (128-bit)
  const iv = CryptoJS.lib.WordArray.random(128 / 8);

  // 4. Encrypt using AES-256 (CBC is default) with proper Key and IV
  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
  };
}

/**
 * Decrypts ciphertext using PBKDF2 derived key (Standard for Backup V3+).
 * Auto-detects iteration count by trying Strong first, then Legacy.
 */
export async function decrypt(
  ciphertext: string,
  password: string,
  saltB64: string,
  ivB64: string,
): Promise<string> {
  const salt = CryptoJS.enc.Base64.parse(saltB64);
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  // Helper to try decryption with specific iterations
  const tryDecrypt = (iterations: number): string | null => {
    try {
      const key = CryptoJS.PBKDF2(password, salt, {
        keySize: 256 / 32,
        iterations: iterations,
      });

      const bytes = CryptoJS.AES.decrypt(ciphertext, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });

      const text = bytes.toString(CryptoJS.enc.Utf8);
      // Basic validation: Decrypted text must be non-empty string
      return text && text.length > 0 ? text : null;
    } catch (e) {
      return null;
    }
  };

  // 1. Try Strong Iterations (New Standard)
  let decryptedText = tryDecrypt(STRONG_ITERATIONS);

  // 2. If failed, try Legacy Iterations (Backward Compatibility)
  if (!decryptedText) {
    decryptedText = tryDecrypt(LEGACY_ITERATIONS);
  }

  if (!decryptedText) {
    throw new Error("Decryption failed. Probably wrong password.");
  }

  return decryptedText;
}

/**
 * Legacy Decryption for Backup V2 (Weak default KDF).
 * Kept for backward compatibility.
 */
export async function decryptLegacy(
  ciphertext: string,
  password: string,
): Promise<string> {
  try {
    // Legacy: Default OpenSSL KDF (Weak)
    const bytes = CryptoJS.AES.decrypt(ciphertext, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      throw new Error("Legacy decryption failed.");
    }

    return decryptedText;
  } catch (e) {
    throw new Error("Legacy decryption failed.");
  }
}
