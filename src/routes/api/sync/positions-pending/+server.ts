import { extractApiCredentials } from "../../../../utils/server/requestUtils";
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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHash, randomBytes } from "crypto";
import { checkAppAuth } from "../../../../lib/server/auth";
import { z } from "zod";

// SECURITY NOTE: This endpoint acts as a Backend-For-Frontend (BFF) proxy.
// It receives API keys from the client to perform a signed request to Bitunix.
// Ensure strictly HTTPS is used. Request bodies are NOT logged on error.

const RequestSchema = z.object({
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = RequestSchema.safeParse(body);
  if (!result.success) {
    return json(
      { error: "Invalid request data", details: result.error.format() },
      { status: 400 },
    );
  }

  const { apiKey: bodyKey, apiSecret: bodySecret } = result.data;
  const creds = extractApiCredentials(request, body);
  const apiKey = creds.apiKey || bodyKey;
  const apiSecret = creds.apiSecret || bodySecret;

  if (!apiKey || !apiSecret) {
      return json({ error: "Missing API Credentials" }, { status: 401 });
  }

  try {
    const positions = await fetchBitunixPendingPositions(apiKey, apiSecret);
    return json({ data: positions });
  } catch (e: any) {
    // SECURITY: Do not log the full error object if it might contain the request context or keys.
    // Logging only the message is safer.
    console.error(`Error fetching pending positions from Bitunix:`, e.message);
    return json(
      { error: e.message || "Failed to fetch pending positions" },
      { status: 500 },
    );
  }
};

async function fetchBitunixPendingPositions(
  apiKey: string,
  apiSecret: string,
): Promise<any[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_pending_positions";

  // Params for the request (empty for all pending positions)
  const params: Record<string, string> = {};

  // 1. Generate Nonce and Timestamp
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // 2. Sort and Concatenate Query Params
  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  // 3. Construct Digest Input
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

  // 4. Calculate Digest (SHA256)
  const digest = createHash("sha256").update(digestInput).digest("hex");

  // 5. Calculate Signature (SHA256 of digest + secret)
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  // 6. Build Query String for URL (might be empty)
  const queryString = new URLSearchParams(params).toString();
  const url = queryString
    ? `${baseUrl}${path}?${queryString}`
    : `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  // Usually data.data is an array for this endpoint, or wrapped in an object
  // Bitunix docs say: data: [...] (Array of positions)
  if (Array.isArray(data.data)) {
    return data.data;
  }

  // Fallback checks
  if (data.data && Array.isArray(data.data.positionList)) {
    return data.data.positionList;
  }

  return [];
}
