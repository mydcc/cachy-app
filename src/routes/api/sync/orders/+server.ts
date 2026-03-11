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
import { generateBitunixSignature } from "../../../../utils/server/bitunix";
import { checkAppAuth } from "../../../../lib/server/auth";
import type { BitunixOrder } from "../../../../types/bitunix";
import { z } from "zod";

const RequestSchema = z.object({
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  limit: z.number().optional(),
});

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = RequestSchema.safeParse(body);
  if (!result.success) {
    return json(
      { error: "Invalid request data", details: result.error.format() },
      { status: 400 },
    );
  }

  const { apiKey, apiSecret, limit } = result.data;

  try {
    let allOrders: BitunixOrder[] = [];
    const startTime = Date.now();
    const TIMEOUT_MS = 50000; // 50s timeout safety for serverless functions

    let isPartial = false;

    // Helper to check timeout
    const checkTimeout = () => {
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.warn("Sync orders timeout reached. Returning partial data.");
        isPartial = true;
        return true;
      }
      return false;
    };

    // Execute all fetches in parallel
    const [regularResult, tpslResult, planResult] = await Promise.allSettled([
      fetchAllPages(
        apiKey,
        apiSecret,
        "/api/v1/futures/trade/get_history_orders",
        checkTimeout,
      ),
      fetchAllPages(
        apiKey,
        apiSecret,
        "/api/v1/futures/tpsl/get_history_orders",
        checkTimeout,
      ),
      fetchAllPages(
        apiKey,
        apiSecret,
        "/api/v1/futures/plan/get_history_plan_orders",
        checkTimeout,
      ),
    ]);

    // Process results
    if (regularResult.status === "fulfilled") {
      allOrders = allOrders.concat(regularResult.value);
    } else {
      const msg = (regularResult.reason as Error).message || "Unknown error";
      // Sanitize
      console.error(
        "Error fetching regular orders:",
        msg.replaceAll(apiKey, "***"),
      );
    }

    if (tpslResult.status === "fulfilled") {
      allOrders = allOrders.concat(tpslResult.value);
    } else {
      const msg = (tpslResult.reason as Error).message || "Unknown error";
      console.warn(
        "Error fetching TP/SL orders:",
        msg.replaceAll(apiKey, "***"),
      );
    }

    if (planResult.status === "fulfilled") {
      allOrders = allOrders.concat(planResult.value);
    } else {
      const msg = (planResult.reason as Error).message || "Unknown error";
      console.warn(
        "Error fetching plan orders:",
        msg.replaceAll(apiKey, "***"),
      );
    }

    return json({ data: allOrders, isPartial });
  } catch (e: unknown) {
    // Log only the message to prevent leaking sensitive data (e.g. headers/keys in error objects)
    const rawMsg = e instanceof Error ? e.message : String(e);
    console.error(
      `Error fetching orders from Bitunix:`,
      rawMsg.replaceAll(apiKey, "***").replaceAll(apiSecret, "***"),
    );
    return json({ error: rawMsg || "Failed to fetch orders" }, { status: 500 });
  }
};

async function fetchAllPages(
  apiKey: string,
  apiSecret: string,
  path: string,
  checkTimeout: () => boolean,
): Promise<BitunixOrder[]> {
  const maxPages = 50; // Reduced from 100 to prevent long waits
  let accumulated: BitunixOrder[] = [];
  let currentEndTime: number | undefined = undefined;

  for (let i = 0; i < maxPages; i++) {
    if (checkTimeout()) break;

    // Fetch batch
    const batch = await fetchBitunixData(
      apiKey,
      apiSecret,
      path,
      100,
      currentEndTime,
    );

    if (!batch || batch.length === 0) {
      break;
    }

    accumulated = accumulated.concat(batch);

    // Pagination logic: use the creation time of the last item
    const lastItem = batch[batch.length - 1];

    if (!lastItem) break;

    const timeField =
      lastItem.ctime || lastItem.createTime || lastItem.updateTime;

    if (timeField !== undefined && timeField !== null) {
      const parsedTime = Number(timeField);

      if (!isNaN(parsedTime) && parsedTime > 0) {
        currentEndTime = parsedTime - 1;
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return accumulated;
}

async function fetchBitunixData(
  apiKey: string,
  apiSecret: string,
  path: string,
  limit: number = 100,
  endTime?: number,
): Promise<BitunixOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";

  // Params for the request
  const params: Record<string, string> = {
    limit: limit.toString(),
  };
  if (endTime) {
    params.endTime = endTime.toString();
  }

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
      "User-Agent": "CachyApp/1.0",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    // Try to parse JSON error from text
    try {
      const jsonError = JSON.parse(text);
      if (jsonError.msg) {
        throw new Error(jsonError.msg); // Pass upstream message
      }
    } catch (e) {
      // ignore
    }
    // Truncate text to avoid massive logs or leaking too much info
    const safeText = text.length > 200 ? text.substring(0, 200) + "..." : text;
    throw new Error(
      `Bitunix API error [${path}]: ${response.status} ${safeText}`,
    );
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      data.msg || `Bitunix API error code [${path}]: ${data.code}`,
    );
  }

  // Robustly find the list in the response
  const resultData = data.data;
  if (Array.isArray(resultData)) return resultData;
  if (resultData && typeof resultData === "object") {
    if (Array.isArray(resultData.orderList)) return resultData.orderList;
    if (Array.isArray(resultData.planOrderList))
      return resultData.planOrderList;
    if (Array.isArray(resultData.rows)) return resultData.rows;
    if (Array.isArray(resultData.list)) return resultData.list;
  }

  return [];
}
