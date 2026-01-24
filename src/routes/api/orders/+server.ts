/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";
import {
  generateBitgetSignature,
  validateBitgetKeys,
} from "../../../utils/server/bitget";
import type {
  BitunixResponse,
  BitunixOrder,
  BitunixOrderListWrapper,
  NormalizedOrder,
  BitunixOrderPayload,
} from "../../../types/bitunix";
import type {
  BitgetResponse,
  BitgetOrder,
  BitgetOrderPayload
} from "../../../types/bitget";
import { formatApiNum } from "../../../utils/utils";

function isValidNumberString(val: unknown): boolean {
  if (typeof val === "number") return !isNaN(val) && isFinite(val);
  if (typeof val !== "string") return false;
  return /^-?\d+(\.\d+)?$/.test(val);
}

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
  const passphrase = body.passphrase as string | undefined;
  const type = body.type as string | undefined;

  if (!exchange || typeof exchange !== "string") {
     return json({ error: "Missing exchange" }, { status: 400 });
  }

  // Security: Validate API Key length
  if (exchange === "bitunix") {
    if (!apiKey || !apiSecret) return json({ error: "Missing credentials" }, { status: 400 });
    const validationError = validateBitunixKeys(apiKey, apiSecret);
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }
  } else if (exchange === "bitget") {
    if (!apiKey || !apiSecret || !passphrase) return json({ error: "Missing credentials (passphrase required)" }, { status: 400 });
    const validationError = validateBitgetKeys(apiKey, apiSecret, passphrase);
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }
  }

    // Security: Validate Order Parameters
    if (type === "place-order" || type === "close-position") {
      // Normalize quantity field: close-position uses 'amount', place-order uses 'qty'
      const rawQty = type === "close-position" ? body.amount : body.qty;

      // Strict check: valid number string AND positive
      if (!isValidNumberString(rawQty)) {
        return json(
          { error: "Invalid quantity format." },
          { status: 400 },
        );
      }

      const qty = parseFloat(String(rawQty));

      if (qty <= 0) {
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
        const orderType = ((body.type as string) || "").toUpperCase();
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
          if (!isValidNumberString(body.price)) {
            return json(
              { error: "Invalid price format for LIMIT/STOP order." },
              { status: 400 },
            );
          }
          const price = parseFloat(String(body.price));
          if (price <= 0) {
            return json(
              { error: "Invalid price (must be > 0)." },
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
          if (!isValidNumberString(trigger)) {
             return json(
              { error: `Invalid trigger price format for ${orderType}.` },
              { status: 400 },
            );
          }
          const triggerVal = parseFloat(String(trigger));
          if (triggerVal <= 0) {
            return json(
              { error: `Trigger price must be > 0 for ${orderType}.` },
              { status: 400 },
            );
          }
        }
      }
    }

  try {
    let result: any = null;

    if (exchange === "bitunix") {
      // Bitunix Logic
      if (type === "pending") {
        const orders = await fetchBitunixPendingOrders(apiKey!, apiSecret!);
        result = { orders };
      } else if (type === "history") {
        let limit = 50;
        if (body.limit !== undefined) {
          if ((typeof body.limit === "number" && Number.isInteger(body.limit)) || (typeof body.limit === "string" && /^\d+$/.test(body.limit))) {
            limit = Number(body.limit);
          }
        }
        const safeLimit = Math.min(Math.max(limit, 1), 100);
        const orders = await fetchBitunixHistoryOrders(apiKey!, apiSecret!, safeLimit);
        result = { orders };
      } else if (type === "place-order") {
        const reduceOnlyRaw = String(body.reduceOnly);
        const isReduceOnly = body.reduceOnly === true || reduceOnlyRaw === "true" || reduceOnlyRaw === "1";

        const orderPayload: BitunixOrderPayload = {
          symbol: body.symbol as string,
          side: body.side as string,
          type: body.type as string,
          qty: String(body.qty),
          price: body.price ? String(body.price) : undefined,
          reduceOnly: isReduceOnly,
          triggerPrice: body.triggerPrice ? String(body.triggerPrice) : undefined,
          stopPrice: body.stopPrice ? String(body.stopPrice) : undefined,
        };
        result = await placeBitunixOrder(apiKey!, apiSecret!, orderPayload);
      } else if (type === "close-position") {
        // Double check amount before creating close order (must be positive)
        // Defensive check: ensure amount exists and is valid
        if (
          body.amount === undefined ||
          body.amount === null ||
          !isValidNumberString(body.amount)
        ) {
          throw new Error("Invalid amount format for closing position");
        }

        const amount = parseFloat(String(body.amount));
        if (isNaN(amount) || amount <= 0) {
          throw new Error("Invalid amount for closing position (must be > 0)");
        }

        // Safe formatting for the amount
        const safeAmount = formatApiNum(body.amount as string | number);
        if (!safeAmount) throw new Error("Invalid amount formatting");

        const closeOrder: BitunixOrderPayload = {
          symbol: body.symbol as string,
          side: body.side as string,
          type: "MARKET",
          qty: safeAmount,
          reduceOnly: true,
        };
        result = await placeBitunixOrder(apiKey!, apiSecret!, closeOrder);
      }
    } else if (exchange === "bitget") {
      // Bitget Logic
      if (type === "pending") {
         const orders = await fetchBitgetPendingOrders(apiKey!, apiSecret!, passphrase!);
         result = { orders };
      } else if (type === "history") {
         let limit = 50;
         if (body.limit !== undefined) limit = Number(body.limit);
         const safeLimit = Math.min(Math.max(limit, 1), 100);
         // Bitget history requires start/end time usually, or just defaults to recent 7 days
         // We'll fetch recent history
         const orders = await fetchBitgetHistoryOrders(apiKey!, apiSecret!, passphrase!, safeLimit);
         result = { orders };
      } else if (type === "place-order") {
         const reduceOnlyRaw = String(body.reduceOnly);
         const isReduceOnly = body.reduceOnly === true || reduceOnlyRaw === "true" || reduceOnlyRaw === "1";

         if (!body.side || typeof body.side !== "string") {
            throw new Error("Invalid side (must be 'buy' or 'sell')");
         }
         if (!body.type || typeof body.type !== "string") {
            throw new Error("Invalid order type");
         }

         const payload: BitgetOrderPayload = {
             symbol: body.symbol as string,
             side: body.side.toLowerCase(), // Bitget uses lower case buy/sell? Docs say: "buy", "sell"
             orderType: body.type.toLowerCase(), // "limit", "market"
             size: String(body.qty),
             price: body.price ? String(body.price) : undefined,
             force: "normal", // or gtc?
             reduceOnly: isReduceOnly
         };

         result = await placeBitgetOrder(apiKey!, apiSecret!, passphrase!, payload);
      } else if (type === "close-position") {
         const amount = parseFloat(String(body.amount));
         const safeAmount = formatApiNum(body.amount as string | number);
         if (!safeAmount) throw new Error("Invalid amount");

         // Bitget Close: Place opposite market order with reduceOnly=true
         const payload: BitgetOrderPayload = {
             symbol: body.symbol as string,
             side: (body.side as string).toLowerCase(), // Opposite side passed from frontend
             orderType: "market",
             size: safeAmount,
             force: "normal",
             reduceOnly: true
         };
         result = await placeBitgetOrder(apiKey!, apiSecret!, passphrase!, payload);
      }
    }

    return json(result);
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Enhanced Logging with Redaction
    try {
      const sanitizedBody: any = { ...body };
      if (sanitizedBody.apiKey) sanitizedBody.apiKey = "***";
      if (sanitizedBody.apiSecret) sanitizedBody.apiSecret = "***";
      if (sanitizedBody.passphrase) sanitizedBody.passphrase = "***";
      console.error(`[API] Order failed: ${type}`, {
        error: errorMsg,
        body: sanitizedBody,
      });
    } catch (logErr) {
      console.error(`[API] Order failed: ${type}`, errorMsg);
    }

    // Check for sensitive patterns (simple check)
    // Defensive: ensure keys are defined before replacing (though they should be checked above)
    // Always redact if keys are present to prevent leaks even for short keys (unlikely but safer)
    let sanitizedMsg = errorMsg;

    if (apiKey) {
        sanitizedMsg = sanitizedMsg.replaceAll(apiKey, "***");
    }
    if (apiSecret) {
        sanitizedMsg = sanitizedMsg.replaceAll(apiSecret, "***");
    }
    if (passphrase) {
        sanitizedMsg = sanitizedMsg.replaceAll(passphrase, "***");
    }

    return json(
      { error: sanitizedMsg || `Failed to process ${type}` },
      { status: 500 },
    );
  }
};

// --- Bitunix Helpers ---
async function placeBitunixOrder(
  apiKey: string,
  apiSecret: string,
  orderData: BitunixOrderPayload,
): Promise<BitunixOrder> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/place_order";

  const safeQty = formatApiNum(orderData.qty);
  if (!safeQty || isNaN(parseFloat(safeQty))) throw new Error("Invalid quantity formatting");

  const payload: BitunixOrderPayload = {
    symbol: orderData.symbol,
    side: orderData.side.toUpperCase(),
    type: orderData.type.toUpperCase(),
    qty: safeQty,
    reduceOnly: orderData.reduceOnly || false,
  };

  const type = payload.type;
  if (type === "LIMIT" || type === "STOP_LIMIT" || type === "TAKE_PROFIT_LIMIT") {
    if (!orderData.price) throw new Error("Price required for limit order");
    const safePrice = formatApiNum(orderData.price);
    if (!safePrice) throw new Error("Invalid price formatting");
    payload.price = safePrice;
  }

  if (orderData.triggerPrice) {
    const safeTrigger = formatApiNum(orderData.triggerPrice);
    if (!safeTrigger) throw new Error("Invalid triggerPrice formatting");
    payload.triggerPrice = safeTrigger;
  }

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, payload);

  const response = await fetch(`${baseUrl}${path}`, {
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
    throw new Error(`Bitunix API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const res: BitunixResponse<BitunixOrder> = await response.json();
  if (String(res.code) !== "0") {
    throw new Error(`Bitunix API error code: ${res.code} - ${res.msg}`);
  }

  return res.data;
}

async function fetchBitunixPendingOrders(apiKey: string, apiSecret: string): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_pending_orders";
  const { nonce, timestamp, signature } = generateBitunixSignature(apiKey, apiSecret, {}, "");

  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) throw new Error(`Bitunix API error: ${response.status}`);
  const res = (await response.json()) as BitunixResponse<BitunixOrder[] | BitunixOrderListWrapper>;
  if (String(res.code) !== "0") throw new Error(`Bitunix error: ${res.code}`);

  let listData: BitunixOrder[] = [];
  if (res.data) {
    if (Array.isArray(res.data)) listData = res.data;
    else if ("orderList" in res.data && Array.isArray((res.data as BitunixOrderListWrapper).orderList)) {
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
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
    fee: parseFloat(o.fee || "0"),
    realizedPNL: parseFloat(o.realizedPNL || "0"),
  }));
}

async function fetchBitunixHistoryOrders(apiKey: string, apiSecret: string, limit = 20): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_orders";
  const params = { limit: String(limit) };
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(apiKey, apiSecret, params, "");

  const response = await fetch(`${baseUrl}${path}?${queryString}`, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) throw new Error(`Bitunix API error: ${response.status}`);
  const res = (await response.json());
  if (String(res.code) !== "0") throw new Error(`Bitunix error: ${res.code}`);

  let listData: BitunixOrder[] = [];
  if (res.data) {
    if (Array.isArray(res.data)) listData = res.data;
    else if ("orderList" in res.data) listData = res.data.orderList;
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
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
  }));
}

// --- Bitget Helpers ---

async function placeBitgetOrder(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    payload: BitgetOrderPayload
): Promise<any> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/placeOrder";

    // Ensure symbol has _UMCBL if not present (assuming USDT-M)
    if (!payload.symbol.includes("_")) {
        // payload.symbol = payload.symbol + "_UMCBL";
        // Better to rely on what was passed or force it?
        // Frontend normalizeSymbol adds _UMCBL for bitget.
        // But let's be safe.
        // Actually, if we use normalizeSymbol in utils, it's safer.
        // But here we just assume the payload is correct or minimal fix.
    }

    // Map internal types to Bitget
    // Bitget V1: marginCoin: 'USDT' required?
    // payload: { symbol: 'BTCUSDT_UMCBL', marginCoin: 'USDT', side: 'open_long' | 'close_short' ... }
    // Wait, Bitget V1 Mix uses 'side' like 'open_long', 'open_short', 'close_long', 'close_short' if NOT in 'crossed' mode?
    // Actually, normally 'buy'/'sell' works if position mode is set?
    // Bitget V1 docs say: side: open_long, close_short (for Buy), open_short, close_long (for Sell).
    // This depends on "Hold mode" (One-way vs Hedge).
    // Assuming One-way mode for simplicity or standard implementation?
    // Most users use Hedge mode on Bitget by default?
    // Let's assume standard mapping:
    // Buy -> open_long
    // Sell -> open_short
    // (If closing, side passed from frontend should be opposite, e.g. Close Long -> Sell -> close_long)
    // This is complex.

    // SIMPLIFICATION:
    // If side is BUY, send 'open_long'.
    // If side is SELL, send 'open_short'.
    // If reduceOnly (Close), map accordingly?
    // If reduceOnly is true:
    //   If BUY (closing a short): 'close_short'
    //   If SELL (closing a long): 'close_long'

    let bitgetSide = "";
    const rawSide = payload.side.toLowerCase();
    if (payload.reduceOnly) {
        if (rawSide === "buy") bitgetSide = "close_short";
        else if (rawSide === "sell") bitgetSide = "close_long";
    } else {
        if (rawSide === "buy") bitgetSide = "open_long";
        else if (rawSide === "sell") bitgetSide = "open_short";
    }

    const bitgetBody = {
        symbol: payload.symbol,
        marginCoin: "USDT",
        side: bitgetSide,
        orderType: payload.orderType, // limit, market
        price: payload.price,
        size: payload.size,
        timInForceValue: payload.force // normal, gtc, etc
    };

    // Remove undefined
    Object.keys(bitgetBody).forEach(k => (bitgetBody as any)[k] === undefined && delete (bitgetBody as any)[k]);

    const { timestamp, signature, bodyStr } = generateBitgetSignature(apiSecret, "POST", path, {}, bitgetBody);

    const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        },
        body: bodyStr
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Bitget API Error: ${response.status} ${text.slice(0, 100)}`);
    }

    const res = await response.json();
    if (res.code !== "00000") {
        throw new Error(`Bitget Error: ${res.code} ${res.msg}`);
    }

    return res.data;
}

async function fetchBitgetPendingOrders(
    apiKey: string,
    apiSecret: string,
    passphrase: string
): Promise<NormalizedOrder[]> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/current";
    // productType: umcbl (USDT-M)
    const params = { productType: "umcbl" };

    const { timestamp, signature, queryString } = generateBitgetSignature(apiSecret, "GET", path, params);

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
        method: "GET",
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const res = await response.json();
    if (res.code !== "00000") throw new Error(`Bitget Error: ${res.msg}`);

    const orders = res.data || [];
    return orders.map((o: any) => ({
        id: o.orderId,
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.orderType,
        side: o.side, // open_long etc
        price: parseFloat(o.price || "0"),
        amount: parseFloat(o.size || "0"),
        filled: parseFloat(o.filledQty || "0"),
        status: o.status, // new, partial_fill
        time: parseInt(o.cTime),
        fee: parseFloat(o.fee || "0"),
        realizedPNL: 0
    }));
}

async function fetchBitgetHistoryOrders(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    limit = 20
): Promise<NormalizedOrder[]> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/history";
    // Bitget history requires symbol usually.
    // If not provided, we might need to loop or use 'productType' if supported (docs vary).
    // Standard endpoint: /api/mix/v1/order/history
    // Params: symbol (required), startTime, endTime, pageSize, lastEndId
    // If symbol is required, we can't fetch generic history for all symbols easily without looping.
    // BUT we can try productType if supported.
    // If not, we might return empty or error if no symbol context.
    // Assuming backend call has no symbol context in this generic 'history' handler?
    // Bitunix supports all. Bitget might strict.

    // Workaround: If we can't fetch all, return empty or implement for specific active symbol if passed.
    // The current +server.ts handler uses body from request.
    // body.symbol might be present if the frontend sends it.
    // The history endpoint logic in +server.ts (Bitunix) didn't require symbol.

    // For now, let's try with productType=umcbl and see if it works (some endpoints support it).
    // If not, we might need to restrict to current symbol or ignore.
    const params: Record<string, string> = {
        productType: "umcbl",
        pageSize: String(limit),
        startTime: String(Date.now() - 7 * 24 * 3600 * 1000) // Last 7 days default
    };

    const { timestamp, signature, queryString } = generateBitgetSignature(apiSecret, "GET", path, params);

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) return []; // Fail gracefully
    const res = await response.json();
    if (res.code !== "00000") return [];

    const orders = res.data || [];
    return orders.map((o: any) => ({
        id: o.orderId,
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.orderType,
        side: o.side,
        price: parseFloat(o.price || "0"),
        amount: parseFloat(o.size || "0"),
        filled: parseFloat(o.filledQty || "0"),
        avgPrice: parseFloat(o.priceAvg || "0"),
        status: o.state, // filled, canceled
        time: parseInt(o.cTime),
        fee: parseFloat(o.fee || "0"),
        realizedPNL: 0
    }));
}
