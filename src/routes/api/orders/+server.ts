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
import { formatApiNum } from "../../../utils/utils";

export const POST: RequestHandler = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body format" }, { status: 400 });
  }

  const exchange = body.exchange as string | undefined;
  const apiKey = body.apiKey as string | undefined;
  const apiSecret = body.apiSecret as string | undefined;
  const type = body.type as string | undefined;

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
      // Strict check: must be string or number convertible to positive number
      const qty = parseFloat(String(rawQty));

      if (isNaN(qty) || qty <= 0) {
        return json(
          { error: "Invalid quantity. Must be a positive number." },
          { status: 400 },
        );
      }

      const side = (body.side as string | undefined)?.toUpperCase();
      if (side !== "BUY" && side !== "SELL") {
        return json(
          { error: "Invalid side. Must be BUY or SELL." },
          { status: 400 },
        );
      }

      if (!body.symbol || typeof body.symbol !== "string") {
        return json(
          { error: "Symbol is required and must be a string." },
          { status: 400 },
        );
      }

      // Check price for Limit orders (place-order only usually)
      if (type === "place-order") {
        const orderType = (body.type as string || "").toUpperCase();
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
          orderType === "LIMIT" ||
          orderType === "STOP_LIMIT" ||
          orderType === "TAKE_PROFIT_LIMIT"
        ) {
          // Price validation
          const price = parseFloat(String(body.price));
          if (isNaN(price) || price <= 0) {
            return json(
              { error: "Invalid price for LIMIT/STOP order." },
              { status: 400 },
            );
          }
        }

        // Trigger Price validation for ALL conditional orders (LIMIT & MARKET)
        if (
          orderType === "STOP_LIMIT" ||
          orderType === "STOP_MARKET" ||
          orderType === "TAKE_PROFIT_LIMIT" ||
          orderType === "TAKE_PROFIT_MARKET"
        ) {
          // Check triggerPrice OR stopPrice
          const trigger = body.triggerPrice || body.stopPrice;
          const triggerVal = parseFloat(String(trigger));
          if (isNaN(triggerVal) || triggerVal <= 0) {
            return json(
              { error: `Trigger price required for ${orderType}.` },
              { status: 400 },
            );
          }
        }
      }
    }
  }

  try {
    let result: BitunixOrder | { orders: NormalizedOrder[] } | null = null;
    if (exchange === "bitunix") {
      if (type === "pending") {
        const orders = await fetchBitunixPendingOrders(apiKey, apiSecret);
        result = { orders };
      } else if (type === "history") {
        const orders = await fetchBitunixHistoryOrders(apiKey, apiSecret);
        result = { orders };
      } else if (type === "place-order") {
        // Safe Construction of Payload after validation above
        const orderPayload: BitunixOrderPayload = {
          symbol: body.symbol as string,
          side: body.side as string,
          type: body.type as string,
          qty: String(body.qty), // Ensure string
          price: body.price ? String(body.price) : undefined,
          reduceOnly: !!body.reduceOnly,
          triggerPrice: body.triggerPrice
            ? String(body.triggerPrice)
            : undefined,
          stopPrice: body.stopPrice ? String(body.stopPrice) : undefined,
        };
        result = await placeBitunixOrder(apiKey, apiSecret, orderPayload);
      } else if (type === "close-position") {
        // Double check amount before creating close order
        const amount = parseFloat(String(body.amount));
        if (isNaN(amount) || amount <= 0) {
          throw new Error("Invalid amount for closing position");
        }

        // To close a position, we place a MARKET order in the opposite direction
        const closeOrder: BitunixOrderPayload = {
          symbol: body.symbol as string,
          side: body.side as string, // Must be opposite of position
          type: "MARKET",
          qty: String(body.amount),
          reduceOnly: true,
        };
        result = await placeBitunixOrder(apiKey, apiSecret, closeOrder);
      }
    } else if (exchange === "binance") {
      result = { orders: [] }; // Placeholder
    }

    return json(result);
  } catch (e: unknown) {
    // Sanitize error log to prevent leaking API keys/headers (which might be in the error object properties)
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Check for sensitive patterns (simple check)
    const sanitizedMsg = errorMsg.replaceAll(apiKey, "***").replaceAll(apiSecret, "***");

    console.error(`Error processing ${type} on ${exchange}:`, sanitizedMsg);

    // Return a generic error if it's a 500, or specific if it's safe
    // We assume e.message from our internal helpers is reasonably safe, but we wrap it just in case
    return json(
      { error: sanitizedMsg || `Failed to process ${type}` },
      { status: 500 },
    );
  }
};

async function placeBitunixOrder(
  apiKey: string,
  apiSecret: string,
  orderData: BitunixOrderPayload,
): Promise<BitunixOrder> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/place_order";

  // Construct Payload
  const payload: BitunixOrderPayload = {
    symbol: orderData.symbol,
    side: orderData.side.toUpperCase(),
    type: orderData.type.toUpperCase(),
    qty: formatApiNum(orderData.qty)!,
    reduceOnly: orderData.reduceOnly || false,
  };

  const type = payload.type;
  if (
    type === "LIMIT" ||
    type === "STOP_LIMIT" ||
    type === "TAKE_PROFIT_LIMIT"
  ) {
    if (!orderData.price) throw new Error("Price required for limit order");
    payload.price = formatApiNum(orderData.price);
  }

  // Pass through triggerPrice for stop orders if present
  if (orderData.triggerPrice) {
    payload.triggerPrice = formatApiNum(orderData.triggerPrice);
  }
  // Some APIs use stopPrice as alias
  if (orderData.stopPrice && !payload.triggerPrice) {
    payload.triggerPrice = formatApiNum(orderData.stopPrice);
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

  const res: BitunixResponse<BitunixOrder> = await response.json();
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

  // Use 'unknown' first to safely cast
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
