import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHmac, createHash, randomBytes } from "crypto";
import { CONSTANTS } from "../../../lib/constants";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { exchange, apiKey, apiSecret, type } = body;

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  try {
    let result = null;
    if (exchange === "bitunix") {
      if (type === "pending") {
        result = { orders: await fetchBitunixPendingOrders(apiKey, apiSecret) };
      } else if (type === "history") {
        result = { orders: await fetchBitunixHistoryOrders(apiKey, apiSecret) };
      } else if (type === "place-order") {
        result = await placeBitunixOrder(apiKey, apiSecret, body);
      } else if (type === "close-position") {
        // To close a position, we place a MARKET order in the opposite direction
        // body should contain: symbol, side (buy/sell), amount (qty)
        const closeOrder = {
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
  } catch (e: any) {
    console.error(`Error processing ${type} on ${exchange}:`, e);
    return json(
      { error: e.message || `Failed to process ${type}` },
      { status: 500 }
    );
  }
};

async function placeBitunixOrder(
  apiKey: string,
  apiSecret: string,
  orderData: any
): Promise<any> {
  // Input Validation
  if (!orderData.symbol || !orderData.side || !orderData.type) {
    throw new Error("Missing required order fields: symbol, side, type.");
  }

  const qty = parseFloat(orderData.qty);
  if (isNaN(qty) || qty <= 0) {
    throw new Error("Invalid order quantity. Must be a positive number.");
  }

  if (orderData.type.toUpperCase() === "LIMIT") {
    const price = parseFloat(orderData.price);
    if (isNaN(price) || price <= 0) {
      throw new Error("Invalid order price. Must be a positive number.");
    }
  }

  const baseUrl = CONSTANTS.BITUNIX_API_URL;
  const path = "/api/v1/futures/trade/place_order";

  // Construct Payload
  // Required: symbol, side, type, qty
  // Optional: price, reduceOnly, leverage, marginMode...
  const payload: any = {
    symbol: orderData.symbol,
    side: orderData.side.toUpperCase(),
    type: orderData.type.toUpperCase(),
    qty: String(orderData.qty),
    reduceOnly: orderData.reduceOnly || false,
  };

  if (payload.type === "LIMIT") {
    if (!orderData.price) throw new Error("Price required for limit order");
    payload.price = String(orderData.price);
  }

  // Clean null/undefined
  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key]
  );

  // Signing
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // Sort keys for signature (body is usually empty for GET, but this is POST)
  // Bitunix POST signature: digestInput = nonce + timestamp + apiKey + queryParams + bodyStr
  // For POST, queryParams is empty usually.
  // bodyStr is JSON string of payload
  const bodyStr = JSON.stringify(payload);
  const digestInput = nonce + timestamp + apiKey + bodyStr;
  const digest = createHash("sha256").update(digestInput).digest("hex");
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

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
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`
    );
  }

  return res.data;
}

async function fetchBitunixPendingOrders(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  const baseUrl = CONSTANTS.BITUNIX_API_URL;
  const path = "/api/v1/futures/trade/get_pending_orders";

  const params: Record<string, string> = {};
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
  const digest = createHash("sha256").update(digestInput).digest("hex");
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

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
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`
    );
  }

  // Map to normalized format
  const list = res.data || []; // Note: doc says res.data is list, not res.data.orderList for pending? Need check. Code had orderList.
  // If previous code had orderList, stick with it, but verify if `data` IS the list.
  // Usually Bitunix returns { data: [...] } or { data: { rows: [...] } }
  // Let's assume the previous implementation was correct about structure or check response.
  // Wait, the previous code had `res.data?.orderList`. I will preserve that safe access.
  const listData = Array.isArray(res.data)
    ? res.data
    : res.data?.orderList || [];

  return listData.map((o: any) => ({
    id: o.orderId,
    orderId: o.orderId,
    clientId: o.clientId,
    symbol: o.symbol,
    type: o.type, // LIMIT, MARKET
    side: o.side, // BUY, SELL
    price: parseFloat(o.price || "0"),
    amount: parseFloat(o.qty || "0"),
    filled: parseFloat(o.tradeQty || "0"),
    status: o.status,
    time: o.ctime,
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
  apiSecret: string
): Promise<any[]> {
  const baseUrl = CONSTANTS.BITUNIX_API_URL;
  const path = "/api/v1/futures/trade/get_history_orders";

  // Default limit 20
  const params: Record<string, string> = {
    limit: "20",
  };

  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
  const digest = createHash("sha256").update(digestInput).digest("hex");
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  const queryString = new URLSearchParams(params).toString();
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
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`
    );
  }

  const list = Array.isArray(res.data) ? res.data : res.data?.orderList || [];
  return list.map((o: any) => ({
    ...o,
    id: o.orderId,
    symbol: o.symbol,
    type: o.type,
    side: o.side,
    price: parseFloat(o.price || "0"),
    amount: parseFloat(o.qty || "0"),
    filled: parseFloat(o.tradeQty || "0"),
    avgPrice: parseFloat(o.avgPrice || o.averagePrice || "0"),
    realizedPnL: parseFloat(o.realizedPNL || "0"),
    fee: parseFloat(o.fee || "0"),
    role: o.role, // Assuming 'MAKER' or 'TAKER' or similar string
    status: o.status,
    time: o.ctime,
  }));
}
