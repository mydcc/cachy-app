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
  kdfHash?: "SHA-512" | "SHA-256";
}

const SECURE_DB_NAME = "CachySecurityDB";
const SECURE_STORE_NAME = "keys";
const DEVICE_KEY_ALIAS = "device_key";

class CryptoServiceImpl {
  // Non-extractable PBKDF2 base key derived from the user's password.
  // The raw password is never stored — only this opaque CryptoKey handle,
  // which the Web Crypto API protects from JavaScript read access.
  private sessionBaseKey: CryptoKey | null = null;
  // Cache derived AES keys by salt to avoid redundant PBKDF2 derivations
  private sessionKeyCache: Map<string, CryptoKey> = new Map();

  /**
   * Unlocks the session by importing the password as a non-extractable PBKDF2 CryptoKey.
   * The raw password is discarded after import — only the opaque key handle is retained.
   * AES keys are derived on-demand per salt during encrypt/decrypt.
   * Returns true if successful.
   */
  async unlockSession(password: string): Promise<boolean> {
    try {
      // Import the password as a non-extractable PBKDF2 base key
      const baseKey = await this.getPasswordKey(password);
      // Verify the key can be used for derivation
      const testSalt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
      await window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: testSalt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-512" },
        baseKey,
        { name: "AES-GCM", length: KEY_SIZE },
        false,
        ["encrypt", "decrypt"]
      );
      this.sessionBaseKey = baseKey;
      this.sessionKeyCache.clear();
      return true;
    } catch (e) {
      console.error("Failed to unlock session", e);
      return false;
    }
  }

  lockSession() {
    this.sessionBaseKey = null;
    this.sessionKeyCache.clear();
  }

  isUnlocked(): boolean {
    return this.sessionBaseKey !== null;
  }

  /**
   * Derives (or retrieves from cache) an AES key for the given salt using the session base key.
   */
  private async getSessionKeyForSalt(salt: Uint8Array, usages: KeyUsage[], hashAlgo: "SHA-512" | "SHA-256" | "SHA-1" = "SHA-512"): Promise<CryptoKey> {
    if (!this.sessionBaseKey) {
      throw new Error("Session locked and no password provided");
    }
    const saltKey = bufferToBase64(salt.buffer as unknown as ArrayBuffer) + "_" + hashAlgo;
    const cached = this.sessionKeyCache.get(saltKey);
    if (cached) return cached;
    const key = await window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: hashAlgo },
      this.sessionBaseKey,
      { name: "AES-GCM", length: KEY_SIZE },
      false,
      ["encrypt", "decrypt"]
    );
    this.sessionKeyCache.set(saltKey, key);
    return key;
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
    hash: "SHA-512" | "SHA-256" | "SHA-1",
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
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-512" },
            password,
            { name: "AES-GCM", length: KEY_SIZE },
            false,
            ["encrypt"]
          );
        } else {
          key = password;
          salt = new Uint8Array(SALT_SIZE); // Dummy salt for blob consistency
        }
      } else if (this.sessionBaseKey && !password) {
        salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
        // Derive key directly without caching — fresh random salts are never reused
        key = await window.crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: "SHA-512" },
          this.sessionBaseKey,
          { name: "AES-GCM", length: KEY_SIZE },
          false,
          ["encrypt", "decrypt"]
        );
      } else if (typeof password === 'string' && password) {
        salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
        key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, "SHA-512");
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
        method: "AES-GCM",
        kdfHash: "SHA-512"
      };
    } catch (e) {
      console.error("Encryption failed", e);
      throw e;
    }
  }

  // --- Decryption ---

  private async attemptDecrypt(blob: EncryptedBlob, password?: string | CryptoKey, hashAlgo: "SHA-512" | "SHA-256" | "SHA-1" = "SHA-512"): Promise<string> {
    try {
      const salt = base64ToBuffer(blob.salt);
      const iv = base64ToBuffer(blob.iv);
      const ciphertext = base64ToBuffer(blob.ciphertext);

      let key: CryptoKey;

      if (password instanceof CryptoKey) {
        if (password.algorithm.name === "PBKDF2") {
          key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: hashAlgo },
            password,
            { name: "AES-GCM", length: KEY_SIZE },
            false,
            ["decrypt"]
          );
        } else {
          key = password;
        }
      } else if (this.sessionBaseKey && !password) {
        // Derive key from session base key + blob's salt
        key = await this.getSessionKeyForSalt(salt, ["decrypt"], hashAlgo);
      } else if (typeof password === 'string' && password) {
        // Determine Algo based on method or legacy fallback
        if (blob.method === "AES-GCM") {
          key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, hashAlgo);
        } else {
          // Legacy or CBC. Import as CBC key.
          const passwordKey = await this.getPasswordKey(password);
          key = await window.crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: STRONG_ITERATIONS, hash: hashAlgo },
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

  public async decrypt(blob: EncryptedBlob, password?: string | CryptoKey): Promise<string> {
    // If the blob records which hash was used, use it directly (no trial decryption).
    if (blob.kdfHash) {
      return await this.attemptDecrypt(blob, password, blob.kdfHash);
    }

    // AES-CBC blobs are legacy and were never encrypted with SHA-512.
    // AES-CBC lacks an authentication tag, so decrypting with the wrong key
    // can silently return garbage instead of throwing. Skip the fallback.
    if (blob.method === "AES-CBC") {
      return await this.attemptDecrypt(blob, password, "SHA-256");
    }

    // Try SHA-512 first, fall back to SHA-256 if needed for backward compatibility.
    try {
      return await this.attemptDecrypt(blob, password, "SHA-512");
    } catch (e) {
      // Only fall back to SHA-256 if the error is a decryption failure
      // (OperationError), which indicates a key mismatch due to hash algorithm.
      // Other errors (e.g., session locked, invalid base64) should fail fast.
      if (e instanceof DOMException && e.name === "OperationError") {
        return await this.attemptDecrypt(blob, password, "SHA-256");
      }
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

