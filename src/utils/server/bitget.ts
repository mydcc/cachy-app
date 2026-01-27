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

import { createHmac } from "crypto";

export interface BitgetSignatureResult {
  timestamp: string;
  signature: string;
  queryString: string;
  bodyStr: string;
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

  // Structural validation of signature generation
  try {
    const testResult = generateBitgetSignature(
      apiSecret,
      "GET",
      "/api/v5/account/balance",
      {},
      null
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
 * Generates the headers and signature required for Bitget API calls (Mix V1).
 * Algorithm: Base64(HMAC-SHA256(timestamp + method + requestPath + body, secret))
 *
 * @param apiSecret - The user's API Secret
 * @param method - HTTP Method (GET, POST)
 * @param path - Request Path (e.g. /api/mix/v1/order/placeOrder)
 * @param params - Query parameters (for GET requests).
 * @param body - Request body (for POST requests).
 */
export function generateBitgetSignature(
  apiSecret: string,
  method: string,
  path: string,
  params: Record<string, string> = {},
  body: any = null,
): BitgetSignatureResult {
  const timestamp = Date.now().toString();

  // Handle Query String for GET
  let queryString = "";
  let fullPath = path;

  if (method.toUpperCase() === "GET" && Object.keys(params).length > 0) {
    queryString = new URLSearchParams(params).toString();
    fullPath = `${path}?${queryString}`;
  }

  // Handle Body for POST
  let bodyStr = "";
  if (method.toUpperCase() === "POST" && body !== null) {
    if (typeof body === "string") {
      bodyStr = body;
    } else {
      bodyStr = JSON.stringify(body);
    }
  }

  // Prehash string
  const preHash = timestamp + method.toUpperCase() + fullPath + bodyStr;

  // Signature
  const signature = createHmac("sha256", apiSecret)
    .update(preHash)
    .digest("base64");

  return {
    timestamp,
    signature,
    queryString,
    bodyStr,
  };
}
