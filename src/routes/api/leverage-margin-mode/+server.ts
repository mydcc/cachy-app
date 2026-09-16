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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import type { RequestHandler } from "./$types";
import { z } from "zod";
import { checkClientToken } from "../../../lib/server/clientToken";
import { safeJsonParse } from "../../../utils/safeJson";
import { BaseRequestSchema } from "../../../types/orderSchemas";
import { jsonSuccess, jsonError, handleApiError } from "../../../utils/apiResponse";
import { fetchWithTimeout } from "../../../utils/server/fetchWithTimeout";
import {
  bitunixCallHeaders,
  checkPresignedRequest,
  type PresignedEnvelope,
} from "../../../utils/server/presignedEnvelope";
import { canonicalQueryString } from "../../../utils/exchange/restSigningPlan";

const CACHY_PATH = "/api/leverage-margin-mode";
const BITUNIX_BASE_URL = "https://fapi.bitunix.com";
const BITUNIX_PATH = "/api/v1/futures/account/get_leverage_margin_mode";

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
  // BUG-0433: read-back leverage stays a native integer here, mirroring
  // BitunixLeverageMarginModeSchema (BUG-0409) — the venue answers with an
  // int and the UI only displays/compares it, so no string boundary is needed.
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

  // The signature covers the venue query, so the rebuild is the canonical
  // serialisation of exactly those parameters — the same function the client's
  // signer orders them with.
  const venueParams: Record<string, string> = { symbol, marginCoin };
  const check = checkPresignedRequest(request, {
    cachyPath: CACHY_PATH,
    rebuilt: canonicalQueryString(venueParams),
  });
  if (!check.ok) {
    return jsonError(`Signature envelope rejected: ${check.code}`, check.code, 400);
  }

  try {
    const data = await fetchLeverageMarginMode(check.envelope);
    return jsonSuccess(data);
  } catch (e) {
    return handleApiError(e);
  }
};

async function fetchLeverageMarginMode(
  envelope: PresignedEnvelope,
): Promise<LeverageMarginModeData> {
  const queryString = envelope.query ?? "";
  const url = queryString
    ? `${BITUNIX_BASE_URL}${BITUNIX_PATH}?${queryString}`
    : `${BITUNIX_BASE_URL}${BITUNIX_PATH}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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
