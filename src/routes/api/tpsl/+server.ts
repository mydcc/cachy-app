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
  validateBitunixKeys,
  executeBitunixApiCall,
} from "../../../utils/server/bitunix";
import { checkAppAuth } from "../../../lib/server/auth";
import { TpSlRequestSchema, sanitizeErrorMessage } from "../../../types/apiSchemas";

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;
  // Wrap the entire parsing logic in try-catch to handle malformed JSON
  try {
    const body = await request.json();

    // Zod Validation (Strict)
    const validation = TpSlRequestSchema.safeParse(body);
    if (!validation.success) {
      return json(
        { error: "Validation Error", details: validation.error.issues },
        { status: 400 }
      );
    }

    const { exchange, apiKey, apiSecret, action, params = {} } = validation.data;

    // Redundant check covered by Zod, but safe to keep for explicit error logic if needed
    if (exchange !== "bitunix") {
      return json(
        { error: "Only Bitunix is supported for TP/SL currently" },
        { status: 400 },
      );
    }

    // Security: Validate API Key length (Helper also checks hex/base64 patterns)
    const validationError = validateBitunixKeys(apiKey, apiSecret);
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }

    let result = null;
    switch (action) {
      case "pending":
        result = await executeBitunixApiCall(
          apiKey,
          apiSecret,
          "GET",
          "/api/v1/futures/tp_sl/get_pending_tp_sl_order",
          params,
        );
        break;
      case "history":
        result = await executeBitunixApiCall(
          apiKey,
          apiSecret,
          "GET",
          "/api/v1/futures/tp_sl/get_history_tp_sl_order",
          params,
        );
        break;
      case "cancel":
        result = await executeBitunixApiCall(
          apiKey,
          apiSecret,
          "POST",
          "/api/v1/futures/tp_sl/cancel_tp_sl_order",
          params,
        );
        break;
      case "modify":
        result = await executeBitunixApiCall(
          apiKey,
          apiSecret,
          "POST",
          "/api/v1/futures/tp_sl/modify_tp_sl_order",
          params,
        );
        break;
      default:
        return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return json(result);
  } catch (e: any) {
        let rawMsg = e instanceof Error ? e.message : String(e);
    if (typeof e === "object" && e !== null && !e.message) {
      try { rawMsg = JSON.stringify(e); } catch {}
    }
    console.error(`Error processing TP/SL request:`, sanitizeErrorMessage(rawMsg, 1000));

    // Determine appropriate status code
    let status = 500;
    let message = e.message || "Internal Server Error";

    if (message.includes("Bitunix API error")) {
      status = 502; // Bad Gateway (upstream error)
      // Or 400 if it's a client error from Bitunix that we want to pass through
      if (message.includes("code:")) {
        // If it has a specific code, it might be a logic error (e.g. invalid price)
        status = 400;
      }
    } else if (message.includes("JSON")) {
      status = 400; // Malformed JSON in request
    }

    return json(
      {
        error: message,
        stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
      },
      { status },
    );
  }
};

