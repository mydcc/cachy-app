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
import type { BitunixOrder } from "../../../../types/bitunix";
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
import { buildSyncOrdersQueryParams } from "../../../../utils/exchange/venueQueries";

const CACHY_PATH = "/api/sync/orders";
const BASE_URL = "https://fapi.bitunix.com";

/**
 * The three order families Bitunix keeps apart and a journal wants together.
 *
 * One signed query covers all three: Bitunix's prehash is
 * `nonce + timestamp + apiKey + queryParams + body` and does not include the
 * path, so the same envelope authorises the same parameters against each of
 * these endpoints. That is the exchange's construction, not a shortcut taken
 * here — the alternative is three envelopes per page for identical bytes.
 */
const SOURCES = [
  "/api/v1/futures/trade/get_history_orders",
  "/api/v1/futures/tpsl/get_history_orders",
  "/api/v1/futures/plan/get_history_plan_orders",
] as const;

/**
 * FEAT-0405 A3 — one page per call.
 *
 * This route used to walk the whole history inside the request, which needs a
 * fresh signature per page: each page's `endTime` is derived from the previous
 * response, and only this side ever sees it. A pre-signed envelope cannot cover
 * a walk whose parameters it does not know yet, so the walk moved to the client
 * and this route became stateless — one page in, one page plus the cursor for
 * the next one out.
 */
const RequestSchema = z.object({
  limit: z.number().optional(),
  endTime: z.number().int().optional(),
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

  const venueParams = buildSyncOrdersQueryParams(result.data);

  const check = checkPresignedRequest(request, {
    cachyPath: CACHY_PATH,
    rebuilt: canonicalQueryString(venueParams),
  });
  if (!check.ok) {
    return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
  }

  try {
    const settled = await Promise.allSettled(
      SOURCES.map((path) => fetchBitunixPage(check.envelope, path)),
    );

    // A source that fails degrades to nothing rather than failing the page:
    // the journal can still import the orders the other two returned, and the
    // cursor below keeps the walk finite either way.
    const orders: BitunixOrder[] = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        orders.push(...outcome.value);
        return;
      }
      const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      logger.warn(
        `Error fetching orders from ${SOURCES[index]}: ${redactString(message)}`,
      );
    });

    return json({ data: orders, nextEndTime: nextEndTime(orders) });
  } catch (e: unknown) {
    // Log only the message to prevent leaking sensitive data (e.g. headers/keys in error objects)
    const safeMsg = redactString(e instanceof Error ? e.message : String(e));
    logger.error(`Error fetching orders from Bitunix: ${safeMsg}`);
    return json({ error: safeMsg || "Failed to fetch orders" }, { status: upstreamErrorStatus(e) ?? 500 });
  }
};

/**
 * The cursor for the next page, or `null` when this was the last one.
 *
 * The oldest creation time on the page, minus one. The venue reads `endTime` as
 * an inclusive bound, so subtracting one excludes the order the page ended on
 * and makes the next request strictly smaller — the walk cannot stall on a page
 * that repeats itself.
 *
 * `null` on an empty page, which is the venue saying there is nothing older, and
 * on a page whose orders carry no usable time at all — continuing from an
 * unknown cursor would be a guess, and the loop would have no way to end.
 */
function nextEndTime(orders: BitunixOrder[]): number | null {
  if (orders.length === 0) return null;

  let oldest: number | undefined;
  for (const order of orders) {
    const raw = order.ctime ?? order.createTime ?? order.updateTime;
    const time = Number(raw);
    if (!Number.isFinite(time) || time <= 0) continue;
    if (oldest === undefined || time < oldest) oldest = time;
  }

  return oldest === undefined ? null : oldest - 1;
}

async function fetchBitunixPage(
  envelope: PresignedEnvelope,
  path: string,
): Promise<BitunixOrder[]> {
  const { query } = envelope;
  const url = query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      ...bitunixCallHeaders(envelope),
      "User-Agent": "CachyApp/1.0",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    // Try to parse JSON error from text
    let jsonError: { msg?: string } | undefined;
    try {
      jsonError = JSON.parse(text) as { msg?: string };
    } catch {
      // not JSON, ignore
    }

    if (jsonError?.msg) {
      throw new Error(jsonError.msg); // Pass upstream message
    }

    const safeText = text.slice(0, 200);
    throw new Error(
      `Bitunix API error [${path}]: ${response.status} ${safeText}`,
    );
  }

  const data = await readExchangeJson(response);

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      data.msg || `Bitunix API error code [${path}]: ${data.code}`,
    );
  }

  // Robustly find the list in the response
  const resultData = data.data;
  if (Array.isArray(resultData)) return resultData as BitunixOrder[];
  if (resultData && typeof resultData === "object") {
    if (Array.isArray(resultData.orderList)) return resultData.orderList as BitunixOrder[];
    if (Array.isArray(resultData.planOrderList))
      return resultData.planOrderList as BitunixOrder[];
    if (Array.isArray(resultData.rows)) return resultData.rows as BitunixOrder[];
    if (Array.isArray(resultData.list)) return resultData.list as BitunixOrder[];
  }

  return [];
}
