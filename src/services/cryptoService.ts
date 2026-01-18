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

/**
 * Encrypts a string using a password.
 * Returns an object with the encrypted data.
 * Crypto-JS handles salt and IV internally if we pass a password string.
 */
export async function encrypt(
  text: string,
  password: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  // CryptoJS.AES.encrypt returns a CipherParams object
  const encrypted = CryptoJS.AES.encrypt(text, password);

  return {
    ciphertext: encrypted.toString(),
    salt: encrypted.salt ? encrypted.salt.toString() : "",
    iv: encrypted.iv ? encrypted.iv.toString() : "",
  };
}

/**
 * Decrypts a ciphertext using a password.
 */
export async function decrypt(
  ciphertext: string,
  password: string,
  _saltB64?: string, // Kept for interface compatibility with previous version
  _ivB64?: string, // Kept for interface compatibility with previous version
): Promise<string> {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      throw new Error("Decryption failed. Probably wrong password.");
    }

    return decryptedText;
  } catch (e) {
    throw new Error("Decryption failed. Probably wrong password.");
  }
}
