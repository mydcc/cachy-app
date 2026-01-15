import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../../utils/server/bitunix";

export const POST: RequestHandler = async ({ request }) => {
  const { apiKey, apiSecret, limit } = await request.json();

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing credentials" }, { status: 400 });
  }

  // Security: Validate API Key length
  const validationError = validateBitunixKeys(apiKey, apiSecret);
  if (validationError) {
    return json({ error: validationError }, { status: 400 });
  }

  try {
    let allOrders: any[] = [];
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
        checkTimeout
      ),
      fetchAllPages(
        apiKey,
        apiSecret,
        "/api/v1/futures/tpsl/get_history_orders",
        checkTimeout
      ),
      fetchAllPages(
        apiKey,
        apiSecret,
        "/api/v1/futures/plan/get_history_plan_orders",
        checkTimeout
      ),
    ]);

    // Process results
    if (regularResult.status === "fulfilled") {
      allOrders = allOrders.concat(regularResult.value);
    } else {
      console.error(
        "Error fetching regular orders:",
        (regularResult.reason as Error).message || "Unknown error"
      );
    }

    if (tpslResult.status === "fulfilled") {
      allOrders = allOrders.concat(tpslResult.value);
    } else {
      console.warn(
        "Error fetching TP/SL orders:",
        (tpslResult.reason as Error).message
      );
    }

    if (planResult.status === "fulfilled") {
      allOrders = allOrders.concat(planResult.value);
    } else {
      console.warn(
        "Error fetching plan orders:",
        (planResult.reason as Error).message
      );
    }

    return json({ data: allOrders, isPartial });
  } catch (e: any) {
    // Log only the message to prevent leaking sensitive data (e.g. headers/keys in error objects)
    console.error(
      `Error fetching orders from Bitunix:`,
      e.message || "Unknown error"
    );
    return json(
      { error: e.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
};

async function fetchAllPages(
  apiKey: string,
  apiSecret: string,
  path: string,
  checkTimeout: () => boolean
): Promise<any[]> {
  const maxPages = 50; // Reduced from 100 to prevent long waits
  let accumulated: any[] = [];
  let currentEndTime: number | undefined = undefined;

  for (let i = 0; i < maxPages; i++) {
    if (checkTimeout()) break;

    // Fetch batch
    const batch = await fetchBitunixData(
      apiKey,
      apiSecret,
      path,
      100,
      currentEndTime
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
  endTime?: number
): Promise<any[]> {
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
    null
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
      `Bitunix API error [${path}]: ${response.status} ${safeText}`
    );
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      data.msg || `Bitunix API error code [${path}]: ${data.code}`
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
