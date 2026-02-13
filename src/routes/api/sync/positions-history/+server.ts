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

const RequestSchema = z.object({
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  limit: z.number().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
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

  const { apiKey, apiSecret, limit } = result.data;

  try {
    const positions = await fetchBitunixHistoryPositions(
      apiKey,
      apiSecret,
      limit,
    );
    return json({ data: positions });
  } catch (e: any) {
    // SECURITY FIX: Sanitize logs and error response
    const rawMsg = e instanceof Error ? e.message : String(e);
    // Mask sensitive data
    const safeMsg = rawMsg.replaceAll(apiKey, "***").replaceAll(apiSecret, "***");

    console.error(`Error fetching history positions from Bitunix:`, safeMsg);

    // Return sanitized message
    return json(
      { error: safeMsg || "Failed to fetch history positions" },
      { status: 500 },
    );
  }
};

async function fetchBitunixHistoryPositions(
  apiKey: string,
  apiSecret: string,
  limit: number = 50,
): Promise<any[]> {
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
    // Truncate text to avoid massive logs or leaking too much info
    const safeText = text.length > 200 ? text.substring(0, 200) + "..." : text;
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  return data.data?.positionList || [];
}
