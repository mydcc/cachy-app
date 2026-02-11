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
import { z } from "zod";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";

// Define Validation Schema
const SyncRequestSchema = z.object({
  apiKey: z.string().min(5),
  apiSecret: z.string().min(5),
  startTime: z.number().int().optional(),
  endTime: z.number().int().optional(),
  limit: z.union([z.number(), z.string()])
    .transform((val) => {
      const num = Number(val);
      return isNaN(num) ? 50 : Math.min(Math.max(num, 1), 100);
    })
    .optional()
    .default(50),
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    // 1. Zod Validation
    const validation = SyncRequestSchema.safeParse(body);
    if (!validation.success) {
      return json(
        { error: "Validation Error", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { apiKey, apiSecret, startTime, endTime, limit } = validation.data;

    // 2. Additional Security Check (Redundant but explicit)
    const keyError = validateBitunixKeys(apiKey, apiSecret);
    if (keyError) {
      return json({ error: keyError }, { status: 400 });
    }

    const history = await fetchBitunixHistory(
      apiKey,
      apiSecret,
      startTime,
      endTime,
      limit,
    );
    return json({ data: history });
  } catch (e: any) {
    console.error(`Error fetching history from Bitunix:`, e.message || e);
    return json(
      { error: e.message || "Failed to fetch history" },
      { status: 500 },
    );
  }
};

async function fetchBitunixHistory(
  apiKey: string,
  apiSecret: string,
  startTime?: number,
  endTime?: number,
  limit: number = 50,
): Promise<Record<string, any>[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_trades";

  // Params for the request
  const params: Record<string, string> = {
    limit: limit.toString(),
  };
  if (startTime) params.startTime = startTime.toString();
  if (endTime) params.endTime = endTime.toString();

  // Use centralized signature generation
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    "" // Empty body for GET
  );

  const response = await fetch(`${baseUrl}${path}?${queryString}`, {
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

  return data.data?.tradeList || [];
}
