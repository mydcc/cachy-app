import { browser } from "$app/environment";
import CryptoJS from "crypto-js";

/**
 * CryptoService using Native Web Crypto API (SubtleCrypto) for performance.
 * Fallback to CryptoJS for legacy support.
 */

const STRONG_ITERATIONS = 600000;
const LEGACY_ITERATIONS = 10000;
const SALT_SIZE = 16; // 128-bit
const IV_SIZE = 16; // 128-bit
const KEY_SIZE = 256;

// Utilities for ArrayBuffer <-> Base64
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

async function getPasswordKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
}

async function deriveKey(
  passwordKey: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  hash: "SHA-256" | "SHA-1",
): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations,
      hash,
    },
    passwordKey,
    { name: "AES-CBC", length: KEY_SIZE },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts a string using a password with robust PBKDF2 key derivation (SHA-256).
 * Returns an object with the encrypted data, salt, and IV.
 */
export async function encrypt(
  text: string,
  password: string,
): Promise<{ ciphertext: string; salt: string; iv: string }> {
  if (!browser || !window.crypto || !window.crypto.subtle) {
    // Fallback to CryptoJS if not in browser or no crypto support (unlikely)
    return encryptCryptoJS(text, password);
  }

  try {
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_SIZE));
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_SIZE));
    const passwordKey = await getPasswordKey(password);

    // Always upgrade to SHA-256 for new encryptions
    const key = await deriveKey(
      passwordKey,
      salt,
      STRONG_ITERATIONS,
      "SHA-256",
    );

    const enc = new TextEncoder();
    const encoded = enc.encode(text);

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-CBC", iv },
      key,
      encoded,
    );

    return {
      ciphertext: bufferToBase64(ciphertextBuffer),
      salt: bufferToBase64(salt.buffer),
      iv: bufferToBase64(iv.buffer),
    };
  } catch (e) {
    console.error("Native encryption failed, falling back to CryptoJS", e);
    return encryptCryptoJS(text, password);
  }
}

/**
 * Decrypts ciphertext using PBKDF2 derived key.
 * Tries Native API (SHA-256 then SHA-1) first, then falls back to CryptoJS.
 */
export async function decrypt(
  ciphertext: string,
  password: string,
  saltB64: string,
  ivB64: string,
): Promise<string> {
  if (browser && window.crypto && window.crypto.subtle) {
    try {
      const salt = base64ToBuffer(saltB64);
      const iv = base64ToBuffer(ivB64);
      const ciphertextBuffer = base64ToBuffer(ciphertext);
      const passwordKey = await getPasswordKey(password);

      // Strategy:
      // 1. Try Strong Iterations + SHA-256 (New Standard)
      // 2. Try Strong Iterations + SHA-1 (Old CryptoJS default)
      // 3. Try Legacy Iterations + SHA-1 (Very old CryptoJS default potentially?) -> Actually logic says Legacy was 10000 iter.

      const attempts = [
        { iter: STRONG_ITERATIONS, hash: "SHA-256" as const },
        { iter: STRONG_ITERATIONS, hash: "SHA-1" as const },
        { iter: LEGACY_ITERATIONS, hash: "SHA-1" as const },
      ];

      for (const attempt of attempts) {
        try {
          const key = await deriveKey(
            passwordKey,
            salt as any,
            attempt.iter,
            attempt.hash,
          );
          const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: "AES-CBC", iv: iv as any },
            key,
            ciphertextBuffer as any,
          );
          const dec = new TextDecoder();
          const text = dec.decode(decryptedBuffer);
          if (text) return text;
        } catch (innerE) {
          // Continue to next attempt
        }
      }
    } catch (e) {
      console.warn("Native decryption failed, trying CryptoJS fallback...", e);
    }
  }

  // Fallback to CryptoJS (Synchronous, blocking, but compatible)
  return decryptCryptoJS(ciphertext, password, saltB64, ivB64);
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
    const bytes = CryptoJS.AES.decrypt(ciphertext, password);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedText) throw new Error("Legacy decryption failed.");
    return decryptedText;
  } catch (e) {
    throw new Error("Legacy decryption failed.");
  }
}

// --- Internal CryptoJS Fallbacks ---

function encryptCryptoJS(text: string, password: string) {
  const salt = CryptoJS.lib.WordArray.random(128 / 8);
  const key = CryptoJS.PBKDF2(password, salt, {
    keySize: 256 / 32,
    iterations: STRONG_ITERATIONS,
  });
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  const encrypted = CryptoJS.AES.encrypt(text, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return Promise.resolve({
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    salt: salt.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
  });
}

function decryptCryptoJS(
  ciphertext: string,
  password: string,
  saltB64: string,
  ivB64: string,
) {
  const salt = CryptoJS.enc.Base64.parse(saltB64);
  const iv = CryptoJS.enc.Base64.parse(ivB64);

  const tryDecrypt = (iterations: number) => {
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
      return text && text.length > 0 ? text : null;
    } catch (e) {
      return null;
    }
  };

  let decryptedText = tryDecrypt(STRONG_ITERATIONS);
  if (!decryptedText) decryptedText = tryDecrypt(LEGACY_ITERATIONS);

  if (!decryptedText) {
    return Promise.reject(
      new Error("Decryption failed. Probably wrong password."),
    );
  }
  return Promise.resolve(decryptedText);
}
