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
import { checkAppAuth } from "../../../lib/server/auth";
import { TpSlRequestSchema } from "../../../types/tpslSchemas";
import { safeJsonParse } from "../../../utils/safeJson";

const BASE_URL = "https://fapi.bitunix.com";

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    const text = await request.text();
    body = safeJsonParse(text);
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 1. Zod Validation
  const validation = TpSlRequestSchema.safeParse(body);

  if (!validation.success) {
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return json({ error: "Validation Error", details: errors }, { status: 400 });
  }

  const payload = validation.data;
  const { exchange, apiKey, apiSecret, action, params } = payload;

  if (exchange !== "bitunix") {
    return json(
      { error: "Only Bitunix is supported for TP/SL currently" },
      { status: 400 },
    );
  }

  // Security: Validate API Key length
  const validationError = validateBitunixKeys(apiKey, apiSecret);
  if (validationError) {
    return json({ error: validationError }, { status: 400 });
  }

  try {
    let result = null;
    switch (action) {
      case "pending":
        result = await fetchBitunixTpSl(
          apiKey,
          apiSecret,
          "/api/v1/futures/tp_sl/get_pending_tp_sl_order",
          params,
        );
        break;
      case "history":
        result = await fetchBitunixTpSl(
          apiKey,
          apiSecret,
          "/api/v1/futures/tp_sl/get_history_tp_sl_order",
          params,
        );
        break;
      case "cancel":
        result = await executeBitunixAction(
          apiKey,
          apiSecret,
          "/api/v1/futures/tp_sl/cancel_tp_sl_order",
          params,
        );
        break;
      case "modify":
        result = await executeBitunixAction(
          apiKey,
          apiSecret,
          "/api/v1/futures/tp_sl/modify_tp_sl_order",
          params,
        );
        break;
    }

    return json(result);
  } catch (e: any) {
    const errorMsg = e.message || "Internal Server Error";

    // Enhanced Logging with Redaction
    try {
        let sanitizedBody: any = {};
        if (typeof body === 'object' && body !== null) {
            sanitizedBody = { ...body };
            if ('apiKey' in sanitizedBody) sanitizedBody.apiKey = "***";
            if ('apiSecret' in sanitizedBody) sanitizedBody.apiSecret = "***";
        }

        console.error(`[API] TP/SL Request failed: ${action}`, {
            error: errorMsg,
            body: sanitizedBody,
        });
    } catch (logErr) {
        console.error(`[API] TP/SL Request failed`, errorMsg);
    }

    // Determine appropriate status code
    let status = 500;
    if (errorMsg.includes("Bitunix API error")) {
      status = 502; // Bad Gateway
      if (errorMsg.includes("code:")) status = 400; // Likely business logic error
    }

    // Sanitize response message
    let sanitizedMsg = errorMsg;
    if (apiKey && apiKey.length > 3) sanitizedMsg = sanitizedMsg.replaceAll(apiKey, "***");
    if (apiSecret && apiSecret.length > 3) sanitizedMsg = sanitizedMsg.replaceAll(apiSecret, "***");

    return json(
      {
        error: sanitizedMsg,
      },
      { status },
    );
  }
};

// Helper for GET requests (like fetching lists)
async function fetchBitunixTpSl(
  apiKey: string,
  apiSecret: string,
  path: string,
  params: any = {},
) {
  // Sort params for signature
  // Remove undefined/null/empty strings
  const cleanParams: Record<string, string> = {};
  Object.keys(params).forEach((k) => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
      cleanParams[k] = String(params[k]);
    }
  });

  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    cleanParams,
    "", // Body is empty for GET
  );

  // Only append ? if there are query params
  const url = queryString
    ? `${BASE_URL}${path}?${queryString}`
    : `${BASE_URL}${path}`;

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

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}

// Helper for POST requests (actions)
async function executeBitunixAction(
  apiKey: string,
  apiSecret: string,
  path: string,
  payload: any,
) {
  // Clean payload
  const cleanPayload: any = {};
  Object.keys(payload).forEach((k) => {
    if (payload[k] !== undefined && payload[k] !== null) {
      // Ensure we don't accidentally send empty strings if they should be filtered,
      // though for POST usually specific keys matter.
      // Bitunix signature requires exact match of body content.
      cleanPayload[k] = payload[k];
    }
  });

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {}, // No query params for POST actions usually
    cleanPayload,
  );

  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const text = await response.text();
    const safeText = text.slice(0, 200);
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}
