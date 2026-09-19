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
import { BaseRequestSchema } from "../../../types/orderSchemas";
import { safeJsonParse } from "../../../utils/safeJson";
import { jsonSuccess, jsonError, handleApiError } from "../../../utils/apiResponse";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../utils/redact";
import { resolveVenue } from "../../../utils/server/venues";
import { checkPresignedRequest } from "../../../utils/server/presignedEnvelope";
import { buildPositionsQueryParams } from "../../../utils/exchange/venueQueries";
import { queryStringForVenue } from "../../../utils/exchange/restSigningPlan";

const CACHY_PATH = "/api/positions";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    body = safeJsonParse(await request.text());
  } catch {
    return jsonError("Invalid JSON body", "INVALID_JSON", 400);
  }

  // Zod Validation
  const validation = BaseRequestSchema.safeParse(body);

  if (!validation.success) {
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return jsonError("Validation Error", "VALIDATION_ERROR", 400, errors);
  }

  const { exchange } = validation.data;

  try {
    const venue = resolveVenue(exchange);
    if (!venue) {
      return jsonError("Unsupported exchange", "UNSUPPORTED_EXCHANGE", 400);
    }

    const rebuilt = queryStringForVenue(exchange, buildPositionsQueryParams(exchange));
    const check = checkPresignedRequest(request, {
      cachyPath: CACHY_PATH,
      rebuilt,
      // Venue-aware nonce requirement: Bitget sends no nonce (its prehash has
      // no such field), so the guard must not ask its half for one.
      venue: exchange,
    });
    if (!check.ok) {
      return jsonError(`Signature envelope rejected: ${check.code}`, "PRESIGNED_REJECTED", 400);
    }
    if (venue.requiresPassphrase && check.envelope.passphrase === undefined) {
      // Bitget is named in the message because it is the message this route
      // has always returned; only Bitget requires a passphrase today.
      return jsonError("Missing passphrase for Bitget", "MISSING_PASSPHRASE", 400);
    }

    const positions = await venue.fetchPositions(check.envelope);

    return jsonSuccess({ positions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[Positions] Error fetching positions from ${exchange}: ${redactString(msg)}`);
    return handleApiError(e);
  }
};
