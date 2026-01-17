import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";
import type {
  BitunixResponse,
  BitunixOrder,
  BitunixOrderListWrapper,
  NormalizedOrder,
  BitunixOrderPayload,
} from "../../../types/bitunix";
import { Decimal } from "decimal.js";

// Helper to safely format numbers for API without scientific notation
// and without unnecessary rounding errors
function formatApiNumber(val: number | string | undefined): string {
  if (val === undefined || val === null || val === "") return "";
  const d = new Decimal(val);
  // toFixed(20) avoids scientific notation for small numbers.
  // We then trim trailing zeros to keep it clean, but keep at least one decimal if it was a float?
  // Actually Bitunix probably handles "10.0000" fine, but "10" is safer.
  // Standard approach: Use Decimal.js toString() which avoids "e" usually,
  // but for very small numbers it might still use it.
  // improved: toFixed with trim.
  let s = d.toFixed(20);
  if (s.includes(".")) {
    s = s.replace(/\.?0+$/, "");
  }
  return s;
}

export const POST: RequestHandler = async ({ request }) => {
  let body: any; // We still parse generic JSON first
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Type guard validation
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid request body" }, { status: 400 });
  }

  const { exchange, apiKey, apiSecret, type } = body;

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  // Security: Validate API Key length
  if (exchange === "bitunix") {
    const validationError = validateBitunixKeys(apiKey, apiSecret);
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }

    // Security: Validate Order Parameters
    if (type === "place-order" || type === "close-position") {
      // Normalize quantity field: close-position uses 'amount', place-order uses 'qty'
      const rawQty = type === "close-position" ? body.amount : body.qty;
      const qty = parseFloat(rawQty);

      if (isNaN(qty) || qty <= 0) {
        return json(
          { error: "Invalid quantity. Must be a positive number." },
          { status: 400 },
        );
      }

      const side = body.side?.toUpperCase();
      if (side !== "BUY" && side !== "SELL") {
        return json(
          { error: "Invalid side. Must be BUY or SELL." },
          { status: 400 },
        );
      }

      if (!body.symbol || typeof body.symbol !== "string") {
        return json({ error: "Symbol is required and must be a string." }, { status: 400 });
      }

      // Check price for Limit orders (place-order only usually)
      if (type === "place-order") {
        const orderType = (body.type || "").toUpperCase();
        const allowedTypes = [
          "LIMIT",
          "MARKET",
          "STOP_LIMIT",
          "STOP_MARKET",
          "TAKE_PROFIT_LIMIT",
          "TAKE_PROFIT_MARKET",
        ];

        if (!allowedTypes.includes(orderType)) {
          return json(
            { error: `Invalid order type: ${orderType}` },
            { status: 400 },
          );
        }

        if (
            (orderType === "LIMIT" || orderType === "STOP_LIMIT" || orderType === "TAKE_PROFIT_LIMIT") &&
            (!body.price || isNaN(parseFloat(body.price)) || parseFloat(body.price) <= 0)
        ) {
              return json(
                { error: "Invalid price for LIMIT/STOP order." },
                { status: 400 },
              );
        }
      }
    }
  }

  try {
    let result: NormalizedOrder[] | any = null;
    if (exchange === "bitunix") {
      if (type === "pending") {
        const orders = await fetchBitunixPendingOrders(apiKey, apiSecret);
        result = { orders };
      } else if (type === "history") {
        const orders = await fetchBitunixHistoryOrders(apiKey, apiSecret);
        result = { orders };
      } else if (type === "place-order") {
        result = await placeBitunixOrder(apiKey, apiSecret, body);
      } else if (type === "close-position") {
        // Double check amount before creating close order
        const amount = parseFloat(body.amount);
        if (isNaN(amount) || amount <= 0) {
           throw new Error("Invalid amount for closing position");
        }

        // To close a position, we place a MARKET order in the opposite direction
        const closeOrder: BitunixOrderPayload = {
          symbol: body.symbol,
          side: body.side, // Must be opposite of position
          type: "MARKET",
          qty: body.amount,
          reduceOnly: true,
        };
        result = await placeBitunixOrder(apiKey, apiSecret, closeOrder);
      }
    } else if (exchange === "binance") {
      result = { orders: [] }; // Placeholder
    }

    return json(result);
  } catch (e: unknown) {
    // Sanitize error log to prevent leaking API keys/headers
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Check for sensitive patterns
    const sanitizedMsg = errorMsg.replaceAll(apiKey, "***").replaceAll(apiSecret, "***");

    console.error(`Error processing ${type} on ${exchange}:`, sanitizedMsg);

    return json(
      { error: errorMsg || `Failed to process ${type}` },
      { status: 500 },
    );
  }
};

async function placeBitunixOrder(
  apiKey: string,
  apiSecret: string,
  orderData: BitunixOrderPayload,
): Promise<any> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/place_order";

  // Construct Payload
  // Use formatApiNumber to safely convert numbers to strings
  const payload: BitunixOrderPayload = {
    symbol: orderData.symbol,
    side: orderData.side.toUpperCase(),
    type: orderData.type.toUpperCase(),
    qty: formatApiNumber(orderData.qty),
    reduceOnly: orderData.reduceOnly || false,
  };

  const type = payload.type;
  if (
    type === "LIMIT" ||
    type === "STOP_LIMIT" ||
    type === "TAKE_PROFIT_LIMIT"
  ) {
    if (!orderData.price) throw new Error("Price required for limit order");
    payload.price = formatApiNumber(orderData.price);
  }

  // Pass through triggerPrice for stop orders if present
  if (orderData.triggerPrice) {
    payload.triggerPrice = formatApiNumber(orderData.triggerPrice);
  }
  // Some APIs use stopPrice as alias
  if (orderData.stopPrice && !payload.triggerPrice) {
    payload.triggerPrice = formatApiNumber(orderData.stopPrice);
  }

  // Clean null/undefined
  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key],
  );

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {},
    payload,
  );

  const url = `${baseUrl}${path}`;

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

  const res: BitunixResponse<any> = await response.json();
  if (String(res.code) !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}

async function fetchBitunixPendingOrders(
  apiKey: string,
  apiSecret: string,
): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_pending_orders";

  const { nonce, timestamp, signature } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {},
    "",
  );

  const url = `${baseUrl}${path}`;

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

  const res = (await response.json()) as BitunixResponse<
    BitunixOrder[] | BitunixOrderListWrapper
  >;

  if (String(res.code) !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  // Map to normalized format
  // Robustly handle data structure (could be direct array or inside orderList)
  let listData: BitunixOrder[] = [];

  if (res.data) {
    if (Array.isArray(res.data)) {
      listData = res.data;
    } else if (
      "orderList" in res.data &&
      Array.isArray((res.data as BitunixOrderListWrapper).orderList)
    ) {
      listData = (res.data as BitunixOrderListWrapper).orderList;
    }
  }

  return listData.map((o) => ({
    id: o.orderId,
    orderId: o.orderId,
    clientId: o.clientId,
    symbol: o.symbol,
    type: o.type, // LIMIT, MARKET
    side: o.side, // BUY, SELL
    price: parseFloat(o.price || "0"),
    amount: parseFloat(o.qty || "0"),
    filled: parseFloat(o.tradeQty || "0"),
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
    mtime: o.mtime,
    leverage: o.leverage,
    marginMode: o.marginMode,
    positionMode: o.positionMode,
    reduceOnly: o.reduceOnly,
    fee: parseFloat(o.fee || "0"),
    realizedPNL: parseFloat(o.realizedPNL || "0"),
    tpPrice: o.tpPrice,
    tpStopType: o.tpStopType,
    tpOrderType: o.tpOrderType,
    slPrice: o.slPrice,
    slStopType: o.slStopType,
    slOrderType: o.slOrderType,
  }));
}

async function fetchBitunixHistoryOrders(
  apiKey: string,
  apiSecret: string,
): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_orders";

  // Default limit 20
  const params: Record<string, string> = {
    limit: "20",
  };

  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    "",
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
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const safeText = text.slice(0, 200);
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const res = (await response.json()) as BitunixResponse<
    BitunixOrder[] | BitunixOrderListWrapper
  >;

  if (String(res.code) !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  let listData: BitunixOrder[] = [];

  if (res.data) {
    if (Array.isArray(res.data)) {
      listData = res.data;
    } else if (
      "orderList" in res.data &&
      Array.isArray((res.data as BitunixOrderListWrapper).orderList)
    ) {
      listData = (res.data as BitunixOrderListWrapper).orderList;
    }
  }

  return listData.map((o) => ({
    id: o.orderId,
    orderId: o.orderId,
    clientId: o.clientId,
    symbol: o.symbol,
    type: o.type,
    side: o.side,
    price: parseFloat(o.price || "0"),
    amount: parseFloat(o.qty || "0"),
    filled: parseFloat(o.tradeQty || "0"),
    avgPrice: parseFloat(o.avgPrice || o.averagePrice || "0"),
    realizedPNL: parseFloat(o.realizedPNL || "0"),
    fee: parseFloat(o.fee || "0"),
    role: o.role,
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
  }));
}
