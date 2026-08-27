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
import { readExchangeJson } from "../../../../utils/server/exchangeResponse";
import { extractApiCredentials } from "../../../../utils/server/requestUtils";
import { safeJsonParse } from "../../../../utils/safeJson";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../../utils/redact";
import { fetchWithTimeout, upstreamErrorStatus } from "../../../../utils/server/fetchWithTimeout";

const RequestSchema = z.object({
  apiKey: z.string().min(1).optional(),
  apiSecret: z.string().min(1).optional(),
  orderId: z.string().min(1),
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
  const { orderId } = result.data;

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing API credentials" }, { status: 400 });
  }

  try {
    const order = await fetchBitunixOrderDetail(apiKey, apiSecret, orderId);
    return json({ data: order });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    logger.error(
      `[Sync] Error fetching order detail from Bitunix for ${orderId}: ${redactString(rawMsg)}`,
    );
    return json(
      { error: (e instanceof Error ? e.message : null) || "Failed to fetch order detail" },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};

async function fetchBitunixOrderDetail(
  apiKey: string,
  apiSecret: string,
  orderId: string,
): Promise<unknown> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_order_detail";

  // Params for the request
  const params: Record<string, string> = {
    orderId: orderId,
  };

  // FEAT-0321: this route used to hand-roll the signing algorithm inline. It
  // signed byte-for-byte identically to `generateBitunixSignature`, which
  // `src/utils/server/bitunix.test.ts` records and now guards.
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    "",
  );

  const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
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

  const data = await readExchangeJson(response);

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  return data.data;
}
