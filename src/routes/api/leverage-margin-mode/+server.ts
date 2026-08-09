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

import type { RequestHandler } from "./$types";
import { z } from "zod";
import { generateBitunixSignature, validateBitunixKeys } from "../../../utils/server/bitunix";
import { extractApiCredentials } from "../../../utils/server/requestUtils";
import { checkClientToken } from "../../../lib/server/clientToken";
import { safeJsonParse } from "../../../utils/safeJson";
import { BaseRequestSchema } from "../../../types/orderSchemas";
import { jsonSuccess, jsonError, handleApiError } from "../../../utils/apiResponse";

// Read-only: GET /api/v1/futures/account/get_leverage_margin_mode. There is
// no write counterpart here — change_leverage/change_margin_mode are a
// separate, later execution feature (FEAT-0068).
const LeverageMarginModeRequestSchema = BaseRequestSchema.extend({
  symbol: z.string().min(1),
  marginCoin: z.string().min(1).optional().default("USDT"),
});

interface LeverageMarginModeData {
  symbol: string;
  marginCoin: string;
  leverage: number;
  marginMode: string;
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    body = safeJsonParse(await request.text());
  } catch {
    return jsonError("Invalid JSON body", "INVALID_JSON", 400);
  }

  const validation = LeverageMarginModeRequestSchema.safeParse(body);
  if (!validation.success) {
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return jsonError("Validation Error", "VALIDATION_ERROR", 400, errors);
  }

  const { exchange, symbol, marginCoin } = validation.data;
  if (exchange !== "bitunix") {
    return jsonError("Unsupported exchange", "UNSUPPORTED_EXCHANGE", 400);
  }

  const creds = extractApiCredentials(request, validation.data);
  const apiKey = creds.apiKey;
  const apiSecret = creds.apiSecret;
  if (!apiKey || !apiSecret) {
    return jsonError("Missing API Credentials", "MISSING_CREDENTIALS", 401);
  }

  const validationError = validateBitunixKeys(apiKey, apiSecret);
  if (validationError) return jsonError(validationError, "INVALID_KEYS", 400);

  try {
    const data = await fetchLeverageMarginMode(apiKey, apiSecret, symbol, marginCoin);
    return jsonSuccess(data);
  } catch (e) {
    return handleApiError(e);
  }
};

async function fetchLeverageMarginMode(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  marginCoin: string,
): Promise<LeverageMarginModeData> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account/get_leverage_margin_mode";

  const params: Record<string, string> = { symbol, marginCoin };
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    null,
  );

  const response = await fetch(`${baseUrl}${path}?${queryString}`, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp,
      nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const text = await response.text();
  const res = safeJsonParse(text);

  if (res.code !== 0 && res.code !== "0") {
    throw new Error(`Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`);
  }

  const data = Array.isArray(res.data) ? res.data[0] : res.data;
  if (!data) throw new Error("No leverage/margin-mode data found");

  return {
    symbol: data.symbol,
    marginCoin: data.marginCoin,
    leverage: Number(data.leverage),
    marginMode: data.marginMode,
  };
}
