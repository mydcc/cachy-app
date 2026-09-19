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
import { canonicalQueryString } from "../../../../utils/exchange/restSigningPlan";
import { buildOrderDetailQueryParams } from "../../../../utils/exchange/venueQueries";

const CACHY_PATH = "/api/sync/order-detail";
const BITUNIX_BASE_URL = "https://fapi.bitunix.com";
const BITUNIX_PATH = "/api/v1/futures/trade/get_order_detail";

const RequestSchema = z.object({
  orderId: z.string().min(1),
});

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

  const { orderId } = result.data;

  const check = checkPresignedRequest(request, {
    cachyPath: CACHY_PATH,
    rebuilt: canonicalQueryString(buildOrderDetailQueryParams({ orderId })),
  });
  if (!check.ok) {
    return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
  }

  try {
    const order = await fetchBitunixOrderDetail(check.envelope);
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
  envelope: PresignedEnvelope,
): Promise<unknown> {
  // The venue signature covers this query, and the guard has already compared
  // the client's copy of it against this route's rebuild, so what is forwarded
  // is verbatim what was signed.
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

  return data.data;
}
