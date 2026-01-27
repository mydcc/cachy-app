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
  BitgetOrderPayload
} from "../../../types/bitget";
import { formatApiNum } from "../../../utils/utils";
import { OrderRequestSchema, type OrderRequestPayload } from "../../../types/orderSchemas";
import { Decimal } from "decimal.js";

// Centralized Error Messages for i18n/consistency
const ORDER_ERRORS = {
  INVALID_JSON: "bitunixErrors.INVALID_JSON",
  VALIDATION_ERROR: "bitunixErrors.VALIDATION_ERROR",
  PASSPHRASE_REQUIRED: "bitunixErrors.PASSPHRASE_REQUIRED",
  INVALID_AMOUNT: "bitunixErrors.INVALID_AMOUNT",
  INVALID_QTY: "bitunixErrors.INVALID_QTY",
  PRICE_REQUIRED: "bitunixErrors.PRICE_REQUIRED",
  INVALID_PRICE: "bitunixErrors.INVALID_PRICE",
  INVALID_TRIGGER: "bitunixErrors.INVALID_TRIGGER",
  BITUNIX_API_ERROR: "bitunixErrors.BITUNIX_API_ERROR",
  BITGET_API_ERROR: "bitunixErrors.BITGET_API_ERROR",
};

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: ORDER_ERRORS.INVALID_JSON }, { status: 400 });
  }

  // 1. Zod Validation
  const validation = OrderRequestSchema.safeParse(body);

  if (!validation.success) {
    // Format Zod errors
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return json({ error: ORDER_ERRORS.VALIDATION_ERROR, code: "VALIDATION_ERROR", details: errors }, { status: 400 });
  }

  const payload = validation.data;
  const { exchange, apiKey, apiSecret, passphrase } = payload;

  // 2. Key Validation (Additional Check)
  if (exchange === "bitunix") {
    const err = validateBitunixKeys(apiKey, apiSecret);
    if (err) return json({ error: err }, { status: 400 });
  } else if (exchange === "bitget") {
    if (!passphrase) return json({ error: ORDER_ERRORS.PASSPHRASE_REQUIRED }, { status: 400 });
    const err = validateBitgetKeys(apiKey, apiSecret, passphrase);
    if (err) return json({ error: err }, { status: 400 });
  }

  try {
    let result: unknown = null;

    // --- BITUNIX ---
    if (exchange === "bitunix") {
      if (payload.type === "pending") {
        const orders = await fetchBitunixPendingOrders(apiKey, apiSecret);
        result = { orders };
      }
      else if (payload.type === "history") {
        const orders = await fetchBitunixHistoryOrders(apiKey, apiSecret, Number(payload.limit));
        result = { orders };
      }
      else if (payload.type === "place-order") {
        const orderPayload: BitunixOrderPayload = {
          symbol: payload.symbol,
          side: payload.side,
          type: payload.orderType, // Correct field from schema
          qty: payload.qty,
          price: payload.price,
          reduceOnly: Boolean(payload.reduceOnly),
          triggerPrice: payload.triggerPrice || payload.stopPrice,
        };
        // Remove undefined safe
        const cleanedPayload = cleanPayload(orderPayload);

        result = await placeBitunixOrder(apiKey, apiSecret, cleanedPayload);
      }
      else if (payload.type === "close-position") {
        const safeAmount = formatApiNum(payload.amount);
        if (!safeAmount || new Decimal(safeAmount).lte(0)) throw new Error(ORDER_ERRORS.INVALID_AMOUNT);

        const closeOrder: BitunixOrderPayload = {
          symbol: payload.symbol,
          side: payload.side,
          type: "MARKET",
          qty: safeAmount,
          reduceOnly: true,
        };
        result = await placeBitunixOrder(apiKey, apiSecret, closeOrder);
      }
    }
    // --- BITGET ---
    else if (exchange === "bitget") {
      if (!passphrase) throw new Error(ORDER_ERRORS.PASSPHRASE_REQUIRED);

      if (payload.type === "pending") {
        const orders = await fetchBitgetPendingOrders(apiKey, apiSecret, passphrase);
        result = { orders };
      }
      else if (payload.type === "history") {
         const orders = await fetchBitgetHistoryOrders(apiKey, apiSecret, passphrase, Number(payload.limit));
         result = { orders };
      }
      else if (payload.type === "place-order") {
         const bitgetPayload: BitgetOrderPayload & { marginCoin?: string } = {
             symbol: payload.symbol,
             side: payload.side.toLowerCase(),
             orderType: payload.orderType.toLowerCase(),
             size: payload.qty,
             price: payload.price,
             force: "normal",
             reduceOnly: Boolean(payload.reduceOnly),
             marginCoin: payload.marginCoin
         };

         result = await placeBitgetOrder(apiKey, apiSecret, passphrase, bitgetPayload);
      }
      else if (payload.type === "close-position") {
         const safeAmount = formatApiNum(payload.amount);
         if (!safeAmount) throw new Error(ORDER_ERRORS.INVALID_AMOUNT);

         const bitgetPayload: BitgetOrderPayload & { marginCoin?: string } = {
             symbol: payload.symbol,
             side: payload.side.toLowerCase(), // Schema ensures it's BUY/SELL (opposite of position)
             orderType: "market",
             size: safeAmount,
             force: "normal",
             reduceOnly: true,
             marginCoin: payload.marginCoin
         };
         result = await placeBitgetOrder(apiKey, apiSecret, passphrase, bitgetPayload);
      }
    }

    return json(result);

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const errorCode = (e as any).code;
    const details = (e as any).details;

    // Enhanced Logging with Redaction
    try {
      let sanitizedBody: any = {};
      if (typeof body === 'object' && body !== null) {
          sanitizedBody = { ...body };
          if ('apiKey' in sanitizedBody) sanitizedBody.apiKey = "***";
          if ('apiSecret' in sanitizedBody) sanitizedBody.apiSecret = "***";
          if ('passphrase' in sanitizedBody) sanitizedBody.passphrase = "***";
      } else {
          sanitizedBody = { raw: String(body) };
      }

      console.error(`[API] Order failed: ${(body as any)?.type}`, {
        error: errorMsg,
        code: errorCode,
        body: sanitizedBody,
      });
    } catch (logErr) {
      console.error(`[API] Order failed`, errorMsg);
    }

    // Redact response message and details
    let sanitizedMsg = errorMsg;
    let sanitizedDetails = details ? String(details) : undefined;

    if (apiKey && apiKey.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(apiKey, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(apiKey, "***");
    }
    if (apiSecret && apiSecret.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(apiSecret, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(apiSecret, "***");
    }
    if (passphrase && passphrase.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(passphrase, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(passphrase, "***");
    }

    return json(
      { error: sanitizedMsg, code: errorCode, details: sanitizedDetails },
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
  if (!safeQty || new Decimal(safeQty).lte(0)) throw new Error(ORDER_ERRORS.INVALID_QTY);

  const payload: BitunixOrderPayload = {
    ...orderData,
    qty: safeQty,
  };

  const type = payload.type;
  if (type === "LIMIT" || type === "STOP_LIMIT" || type === "TAKE_PROFIT_LIMIT") {
    const safePrice = formatApiNum(orderData.price);
    if (!safePrice || new Decimal(safePrice).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    payload.price = safePrice;
  }

  if (orderData.triggerPrice) {
    const safeTrigger = formatApiNum(orderData.triggerPrice);
    if (!safeTrigger) throw new Error(ORDER_ERRORS.INVALID_TRIGGER);
    payload.triggerPrice = safeTrigger;
  }

  const finalPayload = cleanPayload(payload);

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, finalPayload);

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
    const err = new Error(ORDER_ERRORS.BITUNIX_API_ERROR);
    (err as any).details = `${response.status} ${text.slice(0, 200)}`;
    throw err;
  }

  const res: BitunixResponse<BitunixOrder> = await response.json();
  if (String(res.code) !== "0") {
    const err: any = new Error(res.msg); // Use msg as main error text for legacy compatibility
    err.code = String(res.code);
    throw err;
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

  if (!response.ok) throw new Error(`${ORDER_ERRORS.BITUNIX_API_ERROR}: ${response.status}`);
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
    price: formatApiNum(o.price) || "0",
    amount: formatApiNum(o.qty) || "0",
    filled: formatApiNum(o.tradeQty) || "0",
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
    fee: formatApiNum(o.fee) || "0",
    realizedPNL: formatApiNum(o.realizedPNL) || "0",
  }));
}

// --- Helpers ---

function cleanPayload<T extends object>(payload: T): T {
  const cleaned = { ...payload };
  Object.keys(cleaned).forEach((key) => {
    if ((cleaned as any)[key] === undefined) {
      delete (cleaned as any)[key];
    }
  });
  return cleaned;
}

function safeDecimal(value: any): Decimal {
  try {
    if (value === null || value === undefined) return new Decimal(0);
    return new Decimal(value);
  } catch (e) {
    return new Decimal(0);
  }
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

  if (!response.ok) throw new Error(`${ORDER_ERRORS.BITUNIX_API_ERROR}: ${response.status}`);
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
    price: formatApiNum(o.price) || "0",
    amount: formatApiNum(o.qty) || "0",
    filled: formatApiNum(o.tradeQty) || "0",
    avgPrice: formatApiNum(o.avgPrice || o.averagePrice) || "0",
    realizedPNL: formatApiNum(o.realizedPNL) || "0",
    fee: formatApiNum(o.fee) || "0",
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
  }));
}

// --- Bitget Helpers ---

async function placeBitgetOrder(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    payload: BitgetOrderPayload & { marginCoin?: string }
): Promise<any> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/placeOrder";

    // 1. Map Side
    let bitgetSide = "";
    const rawSide = payload.side.toLowerCase();

    // Robust mapping for One-Way Mode (Standard)
    if (payload.reduceOnly) {
        // Closing a position
        if (rawSide === "buy") bitgetSide = "close_short"; // Buying to close Short
        else if (rawSide === "sell") bitgetSide = "close_long"; // Selling to close Long
    } else {
        // Opening a position
        if (rawSide === "buy") bitgetSide = "open_long";
        else if (rawSide === "sell") bitgetSide = "open_short";
    }

    // 2. Build Payload
    const bitgetBody = {
        symbol: payload.symbol,
        marginCoin: payload.marginCoin || "USDT",
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
        const err = new Error(ORDER_ERRORS.BITGET_API_ERROR);
        (err as any).details = `${response.status} ${text.slice(0, 100)}`;
        throw err;
    }

    const res = await response.json();
    if (res.code !== "00000") {
        let msg = res.msg;
        if (msg && (msg.toLowerCase().includes("mode") || msg.toLowerCase().includes("position") || msg.toLowerCase().includes("side"))) {
            msg += " (Possible cause: Mismatch between App (Hedge Mode) and Exchange settings. Check One-Way vs Hedge Mode)";
        }
        throw new Error(`Bitget Error: ${res.code} ${msg}`);
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

    if (!response.ok) throw new Error(ORDER_ERRORS.BITGET_API_ERROR);
    const res = await response.json();
    if (res.code !== "00000") throw new Error(`Bitget Error: ${res.msg}`);

    const orders = res.data || [];
    return orders.map((o: any) => ({
        id: o.orderId,
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.orderType,
        side: o.side, // open_long etc
        price: formatApiNum(o.price) || "0",
        amount: formatApiNum(o.size) || "0",
        filled: formatApiNum(o.filledQty) || "0",
        status: o.status, // new, partial_fill
        time: parseInt(o.cTime),
        fee: formatApiNum(o.fee) || "0",
        realizedPNL: formatApiNum(o.totalProfits) || "0",
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
        price: formatApiNum(o.price) || "0",
        amount: formatApiNum(o.size) || "0",
        filled: formatApiNum(o.filledQty) || "0",
        avgPrice: formatApiNum(o.priceAvg) || "0",
        status: o.state, // filled, canceled
        time: parseInt(o.cTime),
        fee: formatApiNum(o.fee) || "0",
        realizedPNL: formatApiNum(o.totalProfits) || "0",
    }));
}
