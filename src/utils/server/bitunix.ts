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

import { createHash, randomBytes } from "crypto";

export interface BitunixSignatureResult {
  nonce: string;
  timestamp: string;
  signature: string;
  queryString: string;
  bodyStr: string;
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
 * Generates the headers and signature required for Bitunix API calls.
 * Implements the standard Bitunix signing algorithm:
 * 1. Digest = SHA256(nonce + timestamp + apiKey + queryParamsStr + bodyStr)
 * 2. Signature = SHA256(Digest + apiSecret)
 *
 * @param apiKey - The user's API Key
 * @param apiSecret - The user's API Secret
 * @param params - Query parameters (optional). Will be sorted alphabetically.
 * @param body - Request body (optional). If object, will be stringified.
 */
export function generateBitunixSignature(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string> = {},
  body: any = null,
): BitunixSignatureResult {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // Sort and stringify query params for the signature input
  // Format: key1val1key2val2... (no delimiters)
  const sortedKeys = Object.keys(params).sort();
  const queryParamsStr = sortedKeys.map((key) => key + params[key]).join("");

  // Standard query string for the URL (key1=val1&key2=val2)
  // We sort this too to match the signature input order for consistency, though not strictly required by HTTP.
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

  const digestInput = nonce + timestamp + apiKey + queryParamsStr + bodyStr;
  const digest = createHash("sha256").update(digestInput).digest("hex");
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  return {
    nonce,
    timestamp,
    signature,
    queryString,
    bodyStr,
  };
}

const BASE_URL = "https://fapi.bitunix.com";

/**
 * Executes a signed request to the Bitunix API.
 * Handles signature generation, headers, and error parsing.
 */
export async function executeBitunixApiCall(
  apiKey: string,
  apiSecret: string,
  method: "GET" | "POST",
  path: string,
  params: Record<string, any> = {}
) {
  let queryParams: Record<string, string> = {};
  let bodyPayload: any = "";

  if (method === "GET") {
      Object.keys(params).forEach((k) => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
          queryParams[k] = String(params[k]);
        }
      });
  } else {
      bodyPayload = {};
      Object.keys(params).forEach((k) => {
        if (params[k] !== undefined && params[k] !== null) {
           bodyPayload[k] = params[k];
        }
      });
  }

  const { nonce, timestamp, signature, queryString, bodyStr } = generateBitunixSignature(
    apiKey,
    apiSecret,
    queryParams,
    bodyPayload,
  );

  const url = queryString
    ? `${BASE_URL}${path}?${queryString}`
    : `${BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? bodyStr : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    const safeText = text.slice(0, 200);
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}
