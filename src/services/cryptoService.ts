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
// @ts-ignore
import CryptoJS from "crypto-js";

/**
 * CryptoService using Native Web Crypto API (SubtleCrypto) for performance.
 * Fallback to CryptoJS for legacy support.
 */


const STRONG_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 10000;
const SALT_SIZE = 16;
const IV_SIZE_GCM = 12; // GCM standard
const IV_SIZE_CBC = 16; // CBC standard
const KEY_SIZE = 256;

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  salt: string;
  method: "AES-GCM" | "AES-CBC";
}

const SECURE_DB_NAME = "CachySecurityDB";
const SECURE_STORE_NAME = "keys";
const DEVICE_KEY_ALIAS = "device_key";

class CryptoServiceImpl {
  private sessionKey: CryptoKey | null = null;
  private sessionSalt: Uint8Array | null = null; // To verify if salt matches

  /**
   * Unlocks the session by deriving and caching the key.
   * Returns true if successful (simple check).
   */
  async unlockSession(password: string): Promise<boolean> {
    try {
      const salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
      this.sessionKey = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, "SHA-256");
      this.sessionSalt = salt;
      return true;
    } catch (e) {
      console.error("Failed to unlock session", e);
      return false;
    }
  }

  lockSession() {
    this.sessionKey = null;
    this.sessionSalt = null;
  }

  isUnlocked(): boolean {
    return this.sessionKey !== null;
  }

  // --- Core Crypto Operations ---

  private async getPasswordKey(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
  }

  private async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array,
    iterations: number,
    hash: "SHA-256" | "SHA-1",
  ): Promise<CryptoKey> {
    const passwordKey = await this.getPasswordKey(password);
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as unknown as BufferSource,
        iterations,
        hash,
      },
      passwordKey,
      { name: "AES-GCM", length: KEY_SIZE }, // Derived key algorithm
      false, // non-extractable
      ["encrypt", "decrypt"],
    );
  }

  // --- Encryption ---

  public async encrypt(plaintext: string, password?: string | CryptoKey): Promise<EncryptedBlob> {
    if (!browser || !window.crypto || !window.crypto.subtle) {
      throw new Error("CryptoService requires generic Web Crypto API (Secure Context)");
    }

    try {
      let key: CryptoKey;
      let salt: Uint8Array;

      if (password instanceof CryptoKey) {
        if (password.algorithm.name === "PBKDF2") {
          salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
          key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-256" },
            password,
            { name: "AES-GCM", length: KEY_SIZE },
            false,
            ["encrypt"]
          );
        } else {
          key = password;
          salt = new Uint8Array(SALT_SIZE); // Dummy salt for blob consistency
        }
      } else if (this.sessionKey && !password) {
        key = this.sessionKey;
        salt = this.sessionSalt!;
      } else if (typeof password === 'string' && password) {
        salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
        key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, "SHA-256");
      } else {
        throw new Error("Session locked and no password or key provided");
      }

      const iv = window.crypto.getRandomValues(new Uint8Array(IV_SIZE_GCM));
      const enc = new TextEncoder();
      const encoded = enc.encode(plaintext);

      const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        key,
        encoded
      );

      return {
        ciphertext: bufferToBase64(ciphertextBuffer),
        iv: bufferToBase64(iv.buffer as unknown as ArrayBuffer),
        salt: bufferToBase64(salt.buffer as unknown as ArrayBuffer),
        method: "AES-GCM"
      };
    } catch (e) {
      console.error("Encryption failed", e);
      throw e;
    }
  }

  // --- Decryption ---

  public async decrypt(blob: EncryptedBlob, password?: string | CryptoKey): Promise<string> {
    try {
      const salt = base64ToBuffer(blob.salt);
      const iv = base64ToBuffer(blob.iv);
      const ciphertext = base64ToBuffer(blob.ciphertext);

      let key: CryptoKey;

      if (password instanceof CryptoKey) {
        if (password.algorithm.name === "PBKDF2") {
          key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-256" },
            password,
            { name: "AES-GCM", length: KEY_SIZE },
            false,
            ["decrypt"]
          );
        } else {
          key = password;
        }
      } else if (this.sessionKey && !password) {
        // Verify salt matches session
        if (this.sessionSalt && this.arraysEqual(salt, this.sessionSalt)) {
          key = this.sessionKey;
        } else {
          throw new Error("Data salt does not match session salt. Verification required.");
        }
      } else if (typeof password === 'string' && password) {
        // Determine Algo based on method or legacy fallback
        if (blob.method === "AES-GCM") {
          key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, "SHA-256");
        } else {
          // Legacy or CBC. Import as CBC key.
          const passwordKey = await this.getPasswordKey(password);
          key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-256" },
            passwordKey,
            { name: "AES-CBC", length: KEY_SIZE },
            false,
            ["decrypt"]
          );
        }
      } else {
        throw new Error("Session locked or incompatible salt");
      }

      const algo = blob.method === "AES-GCM" ?
        { name: "AES-GCM", iv: iv as unknown as BufferSource } :
        { name: "AES-CBC", iv: iv as unknown as BufferSource };

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        algo,
        key,
        ciphertext as unknown as BufferSource
      );

      return new TextDecoder().decode(decryptedBuffer);

    } catch (e) {
      // Fallback logic for legacy strings (not EncryptedBlob objects)? 
      // The old code handled raw strings. We might need a wrapper "legacyDecrypt"
      console.error("Decryption failed", e);
      throw e;
    }
  }

  // --- Secure Persistent Key Management ---

  /**
   * Generates or retrieves a persistent, non-extractable device key from IndexedDB.
   * This provides better security than localStorage as the key material cannot be easily exfiltrated via XSS.
   * For backward compatibility, legacy hex keys are imported as PBKDF2 keys to maintain the same derivation path.
   */
  public async getOrGenerateDeviceKey(legacyHexKey?: string): Promise<CryptoKey> {
    if (!browser) throw new Error("Browser environment required for Device Key");

    // 1. Try to load from IndexedDB
    let key = await this.loadKeyFromDB(DEVICE_KEY_ALIAS);
    if (key) return key;

    // 2. Migration or Generation
    if (legacyHexKey) {
      // Import legacy hex key as a non-extractable PBKDF2 CryptoKey to maintain derivation path
      const keyData = new Uint8Array(legacyHexKey.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      key = await window.crypto.subtle.importKey(
        "raw",
        keyData,
        "PBKDF2",
        false, // non-extractable
        ["deriveKey"]
      );
    } else {
      // Generate fresh non-extractable key.
      // We use PBKDF2 even for new keys to keep the EncryptedBlob structure (with salt) consistent.
      const randomData = window.crypto.getRandomValues(new Uint8Array(32));
      key = await window.crypto.subtle.importKey(
        "raw",
        randomData,
        "PBKDF2",
        false, // non-extractable
        ["deriveKey"]
      );
    }

    // 3. Persist to DB
    await this.saveKeyToDB(DEVICE_KEY_ALIAS, key);
    return key;
  }

  private async loadKeyFromDB(alias: string): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SECURE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(SECURE_STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(SECURE_STORE_NAME, "readonly");
          const getReq = tx.objectStore(SECURE_STORE_NAME).get(alias);
          getReq.onsuccess = () => resolve(getReq.result || null);
          getReq.onerror = () => reject(getReq.error);
        } catch (e) {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async saveKeyToDB(alias: string, key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SECURE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(SECURE_STORE_NAME);
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(SECURE_STORE_NAME, "readwrite");
        const putReq = tx.objectStore(SECURE_STORE_NAME).put(key, alias);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Helper
  private arraysEqual(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
}

// Internal Utils
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const cryptoService = new CryptoServiceImpl();

