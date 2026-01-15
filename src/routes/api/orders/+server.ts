import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
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
    // Sanitize error log to prevent leaking API keys/headers (which might be in the error object properties)
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`Error processing ${type} on ${exchange}:`, errorMsg);
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
  const baseUrl = "https://fapi.bitunix.com";
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
    const p = parseFloat(orderData.price);
    if (!orderData.price || isNaN(p) || p <= 0) {
      throw new Error("Valid price (>0) required for limit order");
    }
    payload.price = String(orderData.price);
  }

  // Clean null/undefined
  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key]
  );

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {},
    payload
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
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_pending_orders";

  const { nonce, timestamp, signature } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {},
    ""
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

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`
    );
  }

  // Map to normalized format
  // Robustly handle data structure (could be direct array or inside orderList)
  let listData: any[] = [];
  if (res.data) {
    if (Array.isArray(res.data)) {
      listData = res.data;
    } else if (res.data.orderList && Array.isArray(res.data.orderList)) {
      listData = res.data.orderList;
    }
  }

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
    ""
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

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`
    );
  }

  let list: any[] = [];
  if (res.data) {
    if (Array.isArray(res.data)) {
      list = res.data;
    } else if (res.data.orderList && Array.isArray(res.data.orderList)) {
      list = res.data.orderList;
    }
  }

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
