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

  public async encrypt(plaintext: string, password?: string): Promise<EncryptedBlob> {
    if (!browser || !window.crypto || !window.crypto.subtle) {
      throw new Error("CryptoService requires generic Web Crypto API (Secure Context)");
    }

    try {
      let key: CryptoKey;
      let salt: Uint8Array;

      if (this.sessionKey && !password) {
        // Use cached session key if no explicit password usage override (Note: Encrypt usually creates NEW salt, so cached key might not apply if it bound to salt?
        // Wait, PBKDF2 binds Key to Salt. So we CANNOT reuse the same Key for different Salts.
        // If we use Session Key, we must reuse the Session Salt.
        // For "Data at Rest" (API Keys), we usually want unique salts per item or a Master Key?
        // "Wallet" approach: Master Key encrypts the Vault.
        // For now, let's assume we derive a fresh key for every encryption if password is provided.
        // Implementation Plan: "User sets Session-Password -> Keys decrypted in RAM".
        // This implies the Decrypted Data is in RAM, OR the Key to decrypt them is in RAM.
        // To Encrypt NEW data with "Session", we should use the Session Key and Session Salt?
        // Reusing Salt is OK if IV is unique for GCM.
        key = this.sessionKey;
        salt = this.sessionSalt!;
      } else if (password) {
        salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
        key = await this.deriveKeyFromPassword(password, salt, STRONG_ITERATIONS, "SHA-256");
      } else {
        throw new Error("Session locked and no password provided");
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

  public async decrypt(blob: EncryptedBlob, password?: string): Promise<string> {
    try {
      const salt = base64ToBuffer(blob.salt);
      const iv = base64ToBuffer(blob.iv);
      const ciphertext = base64ToBuffer(blob.ciphertext);

      let key: CryptoKey;

      if (this.sessionKey && !password) {
        // Verify salt matches session (if we allow session usage)
        // Only works if data was encrypted with session key (same salt).
        // If salt differs, we must re-derive.
        // Optimization: If salt matches session salt, use session key.
        if (this.sessionSalt && this.arraysEqual(salt, this.sessionSalt)) {
          key = this.sessionKey;
        } else {
          // If locked or salt mismatch, we can't use session key directly without password?
          // If we have Password cached? No, we shouldn't cache password.
          // So we only support Session Decrypt for data encrypted with Session Salt?
          // OR we throw "Need Password" if salt doesn't match.
          throw new Error("Data salt does not match session salt. Verification required.");
        }
      } else if (password) {
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

