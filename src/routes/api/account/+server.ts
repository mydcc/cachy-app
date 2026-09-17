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

import type { RequestHandler } from "./$types";
import { checkClientToken } from "../../../lib/server/clientToken";
import { safeJsonParse } from "../../../utils/safeJson";
import { AccountRequestSchema } from "../../../types/accountSchemas";
import { logger } from "$lib/server/logger";
import { jsonSuccess, jsonError, handleApiError } from "../../../utils/apiResponse";
import { resolveVenue } from "../../../utils/server/venues";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    const text = await request.text();
    body = safeJsonParse(text);
  } catch {
    return jsonError("Invalid JSON body", "INVALID_JSON", 400);
  }

  const validation = AccountRequestSchema.safeParse(body);
  if (!validation.success) {
      const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
      logger.warn(`[Account] Validation failed: ${errors}`);
      return jsonError("Validation Error", "VALIDATION_ERROR", 400, errors);
  }

  const { exchange } = validation.data;
    const creds = extractApiCredentials(request, validation.data);
    const apiKey = creds.apiKey;
    const apiSecret = creds.apiSecret;
    const passphrase = creds.passphrase;

    if (!apiKey || !apiSecret) {
        return jsonError("Missing API Credentials", "MISSING_CREDENTIALS", 401);
    }

  try {
    const venue = resolveVenue(exchange);
    if (!venue) {
        return jsonError("Unsupported exchange", "UNSUPPORTED_EXCHANGE", 400);
    }
    if (venue.requiresPassphrase && !passphrase) {
      return jsonError("Missing passphrase", "MISSING_PASSPHRASE", 400);
    }

    const venueCreds = { apiKey, apiSecret, passphrase };
    const validationError = venue.validateKeys(venueCreds);
    if (validationError) return jsonError(validationError, "INVALID_KEYS", 400);

    const account = await venue.fetchAccount(venueCreds);

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
