import { extractApiCredentials } from "../../../utils/server/requestUtils";
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
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";
import {
  generateBitgetSignature,
  validateBitgetKeys,
} from "../../../utils/server/bitget";
import { Decimal } from "decimal.js";
import { formatApiNum } from "../../../utils/utils";
import { checkAppAuth } from "../../../lib/server/auth";
import { safeJsonParse } from "../../../utils/safeJson";
import { AccountRequestSchema } from "../../../types/accountSchemas";
import { logger } from "$lib/server/logger";
import { jsonSuccess, jsonError, handleApiError } from "../../../utils/apiResponse";

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    const text = await request.text();
    body = safeJsonParse(text);
  } catch (e) {
    return jsonError("Invalid JSON body", "INVALID_JSON", 400);
  }

  const validation = AccountRequestSchema.safeParse(body);
  if (!validation.success) {
      const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      logger.warn(`[Account] Validation failed: ${errors}`);
      return jsonError("Validation Error", "VALIDATION_ERROR", 400, errors);
  }

  const { exchange } = validation.data;
    const creds = extractApiCredentials(request, body);
    const apiKey = creds.apiKey || validation.data.apiKey;
    const apiSecret = creds.apiSecret || validation.data.apiSecret;
    const passphrase = creds.passphrase || validation.data.passphrase;

    if (!apiKey || !apiSecret) {
        return jsonError("Missing API Credentials", "MISSING_CREDENTIALS", 401);
    }

  try {
    let account = null;
    if (exchange === "bitunix") {
      const validationError = validateBitunixKeys(apiKey, apiSecret);
      if (validationError) return jsonError(validationError, "INVALID_KEYS", 400);
      account = await fetchBitunixAccount(apiKey, apiSecret);
    } else if (exchange === "bitget") {
      if (!passphrase) return jsonError("Missing passphrase", "MISSING_PASSPHRASE", 400);
      const validationError = validateBitgetKeys(apiKey, apiSecret, passphrase);
      if (validationError) return jsonError(validationError, "INVALID_KEYS", 400);
      account = await fetchBitgetAccount(apiKey, apiSecret, passphrase);
    } else {
        return jsonError("Unsupported exchange", "UNSUPPORTED_EXCHANGE", 400);
    }

    return jsonSuccess(account);
  } catch (e: unknown) {
    // Security: Redact sensitive info before logging is handled by handleApiError logic if we customized it,
    // but here we manually log safely first.
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Redact
    let safeLog = errorMsg;
    if (apiKey.length > 4) safeLog = safeLog.replaceAll(apiKey, "***");
    if (apiSecret.length > 4) safeLog = safeLog.replaceAll(apiSecret, "***");

    logger.error(`[Account] Fetch failed for ${exchange}: ${safeLog}`);

    return handleApiError(e);
  }
};

async function fetchBitunixAccount(
  apiKey: string,
  apiSecret: string,
): Promise<any> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";

  const params: Record<string, string> = {
    marginCoin: "USDT",
  };

  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    null,
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
    const safeText = text.slice(0, 200);
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const text = await response.text();
  const res = safeJsonParse(text);

  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  const data = Array.isArray(res.data) ? res.data[0] : res.data;

  if (!data) throw new Error("No account data found");

  const available = new Decimal(data.available || "0");
  const margin = new Decimal(data.margin || "0");
  const crossPnL = new Decimal(data.crossUnrealizedPNL || "0");
  const isoPnL = new Decimal(data.isolationUnrealizedPNL || "0");
  const totalPnL = crossPnL.plus(isoPnL);

  return {
    available: formatApiNum(available),
    margin: formatApiNum(margin),
    totalUnrealizedPnL: formatApiNum(totalPnL),
    marginCoin: data.marginCoin,
    frozen: formatApiNum(data.frozen),
    transfer: formatApiNum(data.transfer),
    bonus: formatApiNum(data.bonus),
    positionMode: data.positionMode,
    crossUnrealizedPNL: formatApiNum(crossPnL),
    isolationUnrealizedPNL: formatApiNum(isoPnL),
  };
}

async function fetchBitgetAccount(
    apiKey: string,
    apiSecret: string,
    passphrase: string
): Promise<any> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/account/account";
    const params = { productType: "umcbl", marginCoin: "USDT" };

    const { timestamp, signature, queryString } = generateBitgetSignature(apiSecret, "GET", path, params);

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const text = await response.text();
    const res = safeJsonParse(text);

    if (res.code !== "00000") throw new Error(res.msg);

    const data = res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
    if (!data) throw new Error("No account data found");

    return {
        available: formatApiNum(data.available),
        margin: formatApiNum(data.locked),
        totalUnrealizedPnL: formatApiNum(data.unrealizedPL),
        marginCoin: data.marginCoin,
        frozen: formatApiNum(data.locked),
        equity: formatApiNum(data.equity)
    };
}
