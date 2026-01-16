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
