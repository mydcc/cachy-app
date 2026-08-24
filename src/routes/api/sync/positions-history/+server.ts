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
import { generateBitunixSignature } from "../../../../utils/server/bitunix";
import { z } from "zod";
import { checkClientToken } from "../../../../lib/server/clientToken";
import { sanitizeErrorMessage } from "../../../../types/apiSchemas";
import { readExchangeJson } from "../../../../utils/server/exchangeResponse";
import { extractApiCredentials } from "../../../../utils/server/requestUtils";
import { safeJsonParse } from "../../../../utils/safeJson";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../../utils/redact";
import { fetchWithTimeout, upstreamErrorStatus } from "../../../../utils/server/fetchWithTimeout";

const RequestSchema = z.object({
  apiKey: z.string().min(1).optional(),
  apiSecret: z.string().min(1).optional(),
  limit: z.number().optional(),
});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    if (typeof request.text === "function") {
      body = safeJsonParse(await request.text());
    } else if (typeof request.json === "function") {
      body = await request.json();
    }
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = RequestSchema.safeParse(body);
  if (!result.success) {
    return json(
      { error: "Invalid request data", details: result.error.format() },
      { status: 400 },
    );
  }

  const creds = extractApiCredentials(request, result.data);
  const apiKey = creds.apiKey;
  const apiSecret = creds.apiSecret;
  const { limit } = result.data;

  if (!apiKey || !apiSecret) {
    return json({ error: "Invalid request data", details: "Missing API credentials" }, { status: 400 });
  }

  try {
    const positions = await fetchBitunixHistoryPositions(
      apiKey,
      apiSecret,
      limit,
    );
    return json({ data: positions });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    let safeMsg = redactString(rawMsg);
    if (apiKey && apiKey.length > 4) safeMsg = safeMsg.replaceAll(apiKey, "***");
    if (apiSecret && apiSecret.length > 4) safeMsg = safeMsg.replaceAll(apiSecret, "***");
    safeMsg = sanitizeErrorMessage(safeMsg, 1000);

    logger.error(`[Sync] Error fetching history positions from Bitunix: ${safeMsg}`);

    // Return sanitized message
    return json(
      { error: safeMsg || "Failed to fetch history positions" },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};

async function fetchBitunixHistoryPositions(
  apiKey: string,
  apiSecret: string,
  limit: number = 50,
): Promise<unknown[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_history_positions";

  // Params for the request
  const params: Record<string, string> = {
    limit: limit.toString(),
  };

  // Use shared utility for signature generation (secure & consistent)
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    null // GET request has no body
  );

  const url = `${baseUrl}${path}?${queryString}`;

  const response = await fetchWithTimeout(url, {
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
    // Truncate text to avoid massive logs or leaking too much info
    const safeText = text.length > 200 ? text.substring(0, 200) + "..." : text;
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const data = await readExchangeJson(response);

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  return data.data?.positionList || [];
}
