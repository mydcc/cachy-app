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
  body: unknown = null,
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

  // CodeQL `js/insufficient-password-hash` fires here on `apiKey`. It is a
  // false positive, and the suggested fix would break the integration:
  //
  //   - Nothing is stored. This is a per-request signature, not a password
  //     at rest, so the threat the query models — an attacker who has stolen
  //     a hash database and brute-forces it offline — has no target. The
  //     digest lives for the length of one HTTP request.
  //   - The algorithm is Bitunix's, not ours. `docs/bitunix-api/01_sign.md`
  //     specifies `digest = SHA256(nonce + timestamp + api-key + queryParams
  //     + body)` then `sign = SHA256(digest + secretKey)`, and the exchange
  //     recomputes exactly that to verify. bcrypt, scrypt, PBKDF2 or Argon2
  //     here would make every signed request fail authentication.
  //
  // The construction is worth naming honestly: `H(digest || secret)` is a
  // secret-suffix MAC rather than HMAC, which is weaker in principle because
  // a collision in the underlying hash is a MAC forgery. Against SHA-256 that
  // is not a practical attack today, and it is not Cachy's to change — see
  // Bitget's `generateBitgetSignature`, which does use HMAC, for the contrast.
  //
  // No suppression comment here on purpose: GitHub code scanning does not
  // honour source-level `// codeql[...]` markers (that was an LGTM feature and
  // did not carry over), so one would only look handled while the alert stayed
  // open. The dismissal lives in the repository's Security tab.
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
