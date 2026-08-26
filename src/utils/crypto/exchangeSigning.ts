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

/**
 * Client-Side Exchange Request Signing (WebCrypto API)
 * Implements FEAT-0285 / ADR-0013: Zero-transit credential signing in browser context.
 */

export interface BitunixClientSignatureResult {
  nonce: string;
  timestamp: string;
  signature: string;
  queryString: string;
  bodyStr: string;
}

export interface BitgetClientSignatureResult {
  timestamp: string;
  signature: string;
  queryString: string;
  bodyStr: string;
}

export interface SigningOverrides {
  nonce?: string;
  timestamp?: string;
}

/**
 * Convert ArrayBuffer to lower-case hexadecimal string.
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Convert ArrayBuffer to Base64 string.
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generate cryptographically secure random hexadecimal nonce.
 */
export function getRandomNonceHex(byteLength = 16): string {
  const array = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(array);
  return bufferToHex(array.buffer);
}

/**
 * Validates Bitunix API credentials.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateBitunixKeys(
  apiKey: unknown,
  apiSecret: unknown,
): string | null {
  if (typeof apiKey !== "string" || apiKey.length < 5) {
    return "Invalid API Key (must be string > 5 chars)";
  }
  if (typeof apiSecret !== "string" || apiSecret.length < 5) {
    return "Invalid API Secret (must be string > 5 chars)";
  }
  return null;
}

/**
 * Validates Bitget API credentials.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateBitgetKeys(
  apiKey: unknown,
  apiSecret: unknown,
  passphrase: unknown,
): string | null {
  if (typeof apiKey !== "string" || apiKey.length < 5) {
    return "Invalid API Key (must be string > 5 chars)";
  }
  if (typeof apiSecret !== "string" || apiSecret.length < 5) {
    return "Invalid API Secret (must be string > 5 chars)";
  }
  if (typeof passphrase !== "string" || passphrase.length < 1) {
    return "Invalid Passphrase (required)";
  }
  return null;
}

/**
 * Asynchronously validates Bitunix API credentials with a structural signature test.
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateBitunixKeysAsync(
  apiKey: unknown,
  apiSecret: unknown,
): Promise<string | null> {
  const syncError = validateBitunixKeys(apiKey, apiSecret);
  if (syncError) return syncError;

  try {
    const testResult = await signBitunixRequest(
      apiKey as string,
      apiSecret as string,
      {},
      null,
    );

    if (!testResult.signature || testResult.signature.length < 10) {
      return "Signature generation failed (check credentials)";
    }
    return null;
  } catch (e) {
    return `Credential validation error: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

/**
 * Asynchronously validates Bitget API credentials with a structural signature test.
 * Full parity with server-side validateBitgetKeys (structural HMAC generation).
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateBitgetKeysAsync(
  apiKey: unknown,
  apiSecret: unknown,
  passphrase: unknown,
): Promise<string | null> {
  const syncError = validateBitgetKeys(apiKey, apiSecret, passphrase);
  if (syncError) return syncError;

  try {
    const testResult = await signBitgetRequest(
      apiSecret as string,
      "GET",
      "/api/v5/account/balance",
      {},
      null,
    );

    if (!testResult.signature || testResult.signature.length < 10) {
      return "Signature generation failed (check credentials)";
    }
    return null;
  } catch (e) {
    return `Credential validation error: ${e instanceof Error ? e.message : "unknown"}`;
  }
}

/**
 * Generates the headers and signature required for Bitunix API calls using WebCrypto.
 * Implements standard Bitunix signing:
 * 1. Digest = SHA256(nonce + timestamp + apiKey + queryParamsStr + bodyStr)
 * 2. Signature = SHA256(Digest + apiSecret)
 */
export async function signBitunixRequest(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string> = {},
  body: unknown = null,
  overrides?: SigningOverrides,
): Promise<BitunixClientSignatureResult> {
  const nonce = overrides?.nonce ?? getRandomNonceHex(16);
  const timestamp = overrides?.timestamp ?? Date.now().toString();

  // Sort and stringify query params for the signature input
  // Format: key1val1key2val2... (no delimiters)
  const sortedKeys = Object.keys(params).sort();
  const queryParamsStr = sortedKeys.map((key) => key + params[key]).join("");

  // Standard query string for the URL (key1=val1&key2=val2) sorted alphabetically
  const queryString = new URLSearchParams(
    Object.entries(params).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)),
  ).toString();

  // Handle Body
  let bodyStr = "";
  if (body !== null && body !== undefined && body !== "") {
    if (typeof body === "string") {
      bodyStr = body;
    } else {
      bodyStr = JSON.stringify(body);
    }
  }

  const encoder = new TextEncoder();
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + bodyStr;
  const digestBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(digestInput),
  );
  const digest = bufferToHex(digestBuffer);

  const signInput = digest + apiSecret;
  const sigBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(signInput),
  );
  const signature = bufferToHex(sigBuffer);

  return {
    nonce,
    timestamp,
    signature,
    queryString,
    bodyStr,
  };
}

/**
 * Generates the headers and signature required for Bitget API calls (Mix V1) using WebCrypto.
 * Algorithm: Base64(HMAC-SHA256(timestamp + method + requestPath + body, secret))
 */
export async function signBitgetRequest(
  apiSecret: string,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body: unknown = null,
  overrides?: { timestamp?: string },
): Promise<BitgetClientSignatureResult> {
  const timestamp = overrides?.timestamp ?? Date.now().toString();

  // Handle Query String for GET
  let queryString = "";
  let fullPath = path;

  if (method.toUpperCase() === "GET" && Object.keys(params).length > 0) {
    queryString = new URLSearchParams(params).toString();
    fullPath = `${path}?${queryString}`;
  }

  // Handle Body for POST
  let bodyStr = "";
  if (
    method.toUpperCase() === "POST" &&
    body !== null &&
    body !== undefined &&
    body !== ""
  ) {
    if (typeof body === "string") {
      bodyStr = body;
    } else {
      bodyStr = JSON.stringify(body);
    }
  }

  const preHash = timestamp + method.toUpperCase() + fullPath + bodyStr;
  const encoder = new TextEncoder();

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(preHash),
  );

  const signature = bufferToBase64(sigBuffer);

  return {
    timestamp,
    signature,
    queryString,
    bodyStr,
  };
}
