/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { z } from "zod";
import { checkClientToken } from "../../../../lib/server/clientToken";
import { readExchangeJson } from "../../../../utils/server/exchangeResponse";
import { safeJsonParse } from "../../../../utils/safeJson";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../../utils/redact";
import { fetchWithTimeout, upstreamErrorStatus } from "../../../../utils/server/fetchWithTimeout";
import {
  bitunixCallHeaders,
  checkPresignedRequest,
  type PresignedEnvelope,
} from "../../../../utils/server/presignedEnvelope";

// SECURITY NOTE: This endpoint acts as a Backend-For-Frontend (BFF) proxy.
// The signature is built in the browser (FEAT-0405); this route carries the
// envelope and the request body, never the API secret.

const CACHY_PATH = "/api/sync/positions-pending";
const BITUNIX_BASE_URL = "https://fapi.bitunix.com";
const BITUNIX_PATH = "/api/v1/futures/position/get_pending_positions";

// No fields: the venue reads every pending position and the signature covers an
// empty query. Anything the body carries is ignored, and unknown keys are the
// client's business, not this route's.
const RequestSchema = z.object({});

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    body = safeJsonParse(await request.text());
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

  // This endpoint takes no parameters, so the query string it signs is empty.
  // The client sends `x-api-query` as an explicitly empty header for that; the
  // reader keeps "empty" apart from "absent" so this route stays representable.
  const check = checkPresignedRequest(request, {
    cachyPath: CACHY_PATH,
    rebuilt: "",
  });
  if (!check.ok) {
    return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
  }

  try {
    const positions = await fetchBitunixPendingPositions(check.envelope);
    return json({ data: positions });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    const safeMsg = redactString(rawMsg);
    logger.error(`[Sync] Error fetching pending positions from Bitunix: ${safeMsg}`);
    return json(
      { error: safeMsg || "Failed to fetch pending positions" },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};

async function fetchBitunixPendingPositions(
  envelope: PresignedEnvelope,
): Promise<unknown[]> {
  const { query } = envelope;
  const url = query
    ? `${BITUNIX_BASE_URL}${BITUNIX_PATH}?${query}`
    : `${BITUNIX_BASE_URL}${BITUNIX_PATH}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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

  // Usually data.data is an array for this endpoint, or wrapped in an object
  // Bitunix docs say: data: [...] (Array of positions)
  if (Array.isArray(data.data)) {
    return data.data;
  }

  // Fallback checks
  if (data.data && Array.isArray(data.data.positionList)) {
    return data.data.positionList;
  }

  return [];
}
