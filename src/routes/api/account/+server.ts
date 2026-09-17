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
import { checkPresignedRequest } from "../../../utils/server/presignedEnvelope";
import { buildAccountQueryParams } from "../../../utils/exchange/venueQueries";
import { queryStringForVenue } from "../../../utils/exchange/restSigningPlan";
import { redactString } from "../../../utils/redact";

const CACHY_PATH = "/api/account";

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

  try {
    const venue = resolveVenue(exchange);
    if (!venue) {
        return jsonError("Unsupported exchange", "UNSUPPORTED_EXCHANGE", 400);
    }

    const rebuilt = queryStringForVenue(exchange, buildAccountQueryParams(exchange));
    const check = checkPresignedRequest(request, {
      cachyPath: CACHY_PATH,
      rebuilt,
    });
    if (!check.ok) {
      return jsonError(`Signature envelope rejected: ${check.code}`, "PRESIGNED_REJECTED", 400);
    }
    if (venue.requiresPassphrase && check.envelope.passphrase === undefined) {
      return jsonError("Missing passphrase", "MISSING_PASSPHRASE", 400);
    }

    // `validateKeys` used to run here. It needs the secret, which no longer
    // reaches this process, so the same shape check now runs client-side in
    // `signCachyRequest` — the only layer that still holds the key material.
    const account = await venue.fetchAccount(check.envelope);

    return jsonSuccess(account);
  } catch (e: unknown) {
    // The manual apiKey/apiSecret redaction this block used to do is gone with
    // the credentials: no secret reaches this process, and `redactString`
    // covers the key material that does.
    const errorMsg = e instanceof Error ? e.message : String(e);

    logger.error(`[Account] Fetch failed for ${exchange}: ${redactString(errorMsg)}`);

    return handleApiError(e);
  }
};
