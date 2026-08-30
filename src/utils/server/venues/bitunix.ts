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

import { Decimal } from "decimal.js";
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../bitunix";
import type {
  BitunixResponse,
  BitunixOrder,
  BitunixOrderListWrapper,
  BitunixOrderPayload,
} from "../../../types/bitunix";
import type { NormalizedOrder, NormalizedPosition } from "../../../types/exchange";
import type { OrderRequestPayload } from "../../../types/orderSchemas";
import type { AccountSettingsPayload } from "../../../types/accountSettingsSchemas";
import { formatApiNum } from "../../utils";
import { safeJsonParse } from "../../safeJson";
import { readExchangeJson } from "../exchangeResponse";
import {
  fetchWithTimeout,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  type UpstreamApiError,
} from "../fetchWithTimeout";
import { ORDER_ERRORS, cleanPayload, type ExchangeError } from "./orderErrors";
import {
  UPSTREAM_RETRY_ATTEMPTS,
  isRetryableUpstreamStatus,
  retryAfterHeaderMs,
  sleep,
  upstreamRetryDelayMs,
} from "./upstreamRetry";
import type {
  ExchangeAccountData,
  KlineQuery,
  TickersQuery,
  VenueCredentials,
  VenueKline,
  VenueModule,
} from "./types";

type ApiError = UpstreamApiError;

// --- Bitunix Helpers ---

async function cancelBitunixOrder(apiKey: string, apiSecret: string, symbol: string, orderId: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/cancel_orders";

    const payload = { symbol, orderList: [{ orderId }] };
    const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, payload);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "timestamp": timestamp,
            "nonce": nonce,
            "sign": signature,
            "Content-Type": "application/json",
        },
        body: bodyStr,
    });

    if (!response.ok) {
        // If 404/400, order might already be filled/cancelled. Ignore.
        const text = await response.text();
        if (response.status === 400 || response.status === 404) return;
        throw new Error(`Cancel failed: ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (String(res.code) !== "0") throw new Error(res.msg);

    // cancel_orders reports per-order outcomes rather than failing the whole
    // call — surface a rejected order (e.g. already filled) as an error
    // instead of a silent success.
    const failure = res.data?.failureList?.[0];
    if (failure) throw new Error(failure.errorMsg || `Cancel failed: ${failure.errorCode}`);

    return res.data;
}

async function cancelAllBitunixOrders(apiKey: string, apiSecret: string, symbol?: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/cancel_all_orders";

    const payload: Record<string, string> = {};
    if (symbol) payload.symbol = symbol;

    const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, payload);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "timestamp": timestamp,
            "nonce": nonce,
            "sign": signature,
            "Content-Type": "application/json",
        },
        body: bodyStr,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Cancel all failed: ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (String(res.code) !== "0") throw new Error(res.msg || `Bitunix error: ${res.code}`);

    // Surface partial failures from failureList if any
    const failure = res.data?.failureList?.[0];
    if (failure) {
        throw new Error(failure.errorMsg || `Cancel failed: ${failure.errorCode}`);
    }

    return res.data;
}

async function closeAllBitunixPositions(apiKey: string, apiSecret: string, symbol?: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/close_all_position";

    const payload: Record<string, string> = {};
    if (symbol) payload.symbol = symbol;

    const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, payload);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "timestamp": timestamp,
            "nonce": nonce,
            "sign": signature,
            "Content-Type": "application/json",
        },
        body: bodyStr,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Close all positions failed: ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (String(res.code) !== "0") throw new Error(res.msg || `Bitunix error: ${res.code}`);

    return res.data ?? { success: true };
}

async function flashCloseBitunixPosition(apiKey: string, apiSecret: string, positionId: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/flash_close_position";

    const payload = { positionId };
    const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, payload);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            "timestamp": timestamp,
            "nonce": nonce,
            "sign": signature,
            "Content-Type": "application/json",
        },
        body: bodyStr,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Flash close failed: ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (String(res.code) !== "0") throw new Error(res.msg || `Bitunix error: ${res.code}`);

    return res.data;
}

async function fetchBitunixOrderDetail(
    apiKey: string,
    apiSecret: string,
    orderId?: string,
    clientId?: string,
): Promise<NormalizedOrder> {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/get_order_detail";

    const params: Record<string, string> = {};
    if (orderId) params.orderId = orderId;
    if (clientId) params.clientId = clientId;

    const { nonce, timestamp, signature, queryString } = generateBitunixSignature(apiKey, apiSecret, params, "");

    const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
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
    const text = await response.text();
    const res = safeJsonParse(text) as BitunixResponse<BitunixOrder>;
    if (String(res.code) !== "0") throw new Error(res.msg || `Bitunix error: ${res.code}`);

    const o = res.data;
    if (!o) throw new Error("Order not found");

    return {
        id: o.orderId,
        orderId: o.orderId,
        clientId: o.clientId,
        symbol: o.symbol,
        type: o.type,
        side: o.side,
        price: formatApiNum(o.price) || null,
        amount: formatApiNum(o.qty) || "0",
        filled: formatApiNum(o.tradeQty) || "0",
        avgPrice: formatApiNum(o.avgPrice ?? o.averagePrice) || "0",
        realizedPNL: formatApiNum(o.realizedPNL) || "0",
        fee: formatApiNum(o.fee) || "0",
        reduceOnly: Boolean(o.reduceOnly),
        status: o.status || "UNKNOWN",
        time: (o.ctime && !isNaN(Number(o.ctime))) ? Number(o.ctime) : 0, // audit: safe — epoch-ms timestamp validation and conversion, not a financial value
        mtime: o.mtime,
        leverage: o.leverage,
        marginMode: o.marginMode,
        positionMode: o.positionMode,
        tpPrice: o.tpPrice,
        tpStopType: o.tpStopType,
        tpOrderType: o.tpOrderType,
        slPrice: o.slPrice,
        slStopType: o.slStopType,
        slOrderType: o.slOrderType,
    };
}

async function modifyBitunixOrder(
    apiKey: string,
    apiSecret: string,
    modifyData: {
        orderId?: string;
        clientId?: string;
        symbol?: string;
        qty: string;
        price?: string;
        tpPrice?: string;
        tpStopType?: string;
        tpOrderType?: string;
        tpOrderPrice?: string;
        slPrice?: string;
        slStopType?: string;
        slOrderType?: string;
        slOrderPrice?: string;
    },
) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/modify_order";

    const body: Record<string, unknown> = {
        orderId: modifyData.orderId,
        clientId: modifyData.clientId,
        symbol: modifyData.symbol,
        qty: modifyData.qty,
        price: modifyData.price,
        tpPrice: modifyData.tpPrice,
        tpStopType: modifyData.tpStopType,
        tpOrderType: modifyData.tpOrderType,
        tpOrderPrice: modifyData.tpOrderPrice,
        slPrice: modifyData.slPrice,
        slStopType: modifyData.slStopType,
        slOrderType: modifyData.slOrderType,
        slOrderPrice: modifyData.slOrderPrice,
    };

    const finalPayload = cleanPayload(body);
    const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, finalPayload);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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
        throw new Error(`Modify failed: ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (String(res.code) !== "0") throw new Error(res.msg || `Bitunix error: ${res.code}`);

    return res.data;
}

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

  const type = payload.orderType;
  if (type === "LIMIT" || type === "STOP_LIMIT" || type === "TAKE_PROFIT_LIMIT") {
    const safePrice = formatApiNum(orderData.price);
    if (!safePrice || new Decimal(safePrice).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    payload.price = safePrice;
  }

  if (orderData.triggerPrice) {
    const safeTrigger = formatApiNum(orderData.triggerPrice as string | number | undefined);
    if (!safeTrigger) throw new Error(ORDER_ERRORS.INVALID_TRIGGER);
    payload.triggerPrice = safeTrigger;
  }

  // FEAT-0069: attached TP/SL levels go through the same Decimal formatting
  // as every other price. `formatApiNum` is what keeps a low-priced asset
  // from being serialised as "1e-7", which the exchange rejects.
  for (const field of [
    "tpPrice",
    "tpOrderPrice",
    "slPrice",
    "slOrderPrice",
  ] as const) {
    const raw = orderData[field] as string | number | undefined;
    if (raw === undefined) continue;
    const safe = formatApiNum(raw);
    if (!safe || new Decimal(safe).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    payload[field] = safe;
  }

  // A LIMIT take-profit or stop needs the price it will be placed at.
  // Catching it here costs nothing; learning it from a rejection costs a
  // round trip with a position already open behind it.
  if (payload.tpOrderType === "LIMIT" && payload.tpOrderPrice === undefined) {
    throw new Error(ORDER_ERRORS.INVALID_PRICE);
  }
  if (payload.slOrderType === "LIMIT" && payload.slOrderPrice === undefined) {
    throw new Error(ORDER_ERRORS.INVALID_PRICE);
  }

  const finalPayload = cleanPayload(payload);

  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(apiKey, apiSecret, {}, finalPayload);

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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
    let errorMsg = ORDER_ERRORS.BITUNIX_API_ERROR;
    let details = `${response.status} ${text.slice(0, 200)}`;

    // Attempt to parse JSON error from exchange
    try {
        const jsonError = safeJsonParse(text);
        if (jsonError.msg || jsonError.message || jsonError.error) {
            errorMsg = jsonError.msg || jsonError.message || jsonError.error;
        }
        if (jsonError.code) {
             details = `Code: ${jsonError.code}`;
        }
    } catch {
        // Ignore JSON parse error, stick to text
    }

    const err: ExchangeError = new Error(errorMsg);
    err.details = details;
    throw err;
  }

  const text = await response.text();
  const res: BitunixResponse<BitunixOrder> = safeJsonParse(text);
  if (String(res.code) !== "0") {
    // msg as the main error text, for legacy compatibility.
    const err: ExchangeError = new Error(res.msg);
    err.code = String(res.code);
    throw err;
  }

  return res.data;
}

async function fetchBitunixPendingOrders(apiKey: string, apiSecret: string): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_pending_orders";
  const { nonce, timestamp, signature } = generateBitunixSignature(apiKey, apiSecret, {}, "");

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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
  const text = await response.text();
  const res = safeJsonParse(text) as BitunixResponse<BitunixOrder[] | BitunixOrderListWrapper>;
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
    price: formatApiNum(o.price) || null,
    amount: formatApiNum(o.qty) || "0",
    filled: formatApiNum(o.tradeQty) || "0",
    status: o.status || "UNKNOWN",
    time: o.ctime || 0,
    mtime: o.mtime,
    fee: formatApiNum(o.fee) || "0",
    realizedPNL: formatApiNum(o.realizedPNL) || "0",
    // Bitunix documents these on Get Pending Orders too ("Analog zu Get
    // History Orders", docs/bitunix-api/07_trade.md:500) but they were
    // never mapped through — the order tooltip's Leverage/Margin Mode/TP-SL
    // rows always rendered empty regardless of what the exchange sent.
    leverage: o.leverage,
    marginMode: o.marginMode,
    positionMode: o.positionMode,
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
  limit = 20,
  queryCanceled = false,
  startTime?: number,
  endTime?: number,
  symbol?: string
): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_orders";
  // Bitunix's own split: queryCanceled=false returns everything except
  // CANCELED (up to 90 days back); true returns ONLY CANCELED (up to 3 days
  // back). Neither call alone is a complete history.
  const params: Record<string, string> = { limit: String(limit) };
  if (queryCanceled) params.queryCanceled = "true";
  if (symbol) params.symbol = symbol;
  if (startTime !== undefined && !isNaN(startTime)) params.startTime = String(startTime);
  if (endTime !== undefined && !isNaN(endTime)) params.endTime = String(endTime);
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(apiKey, apiSecret, params, "");

  const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
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
  const text = await response.text();
  const res = safeJsonParse(text);
  if (String(res.code) !== "0") throw new Error(`Bitunix error: ${res.code}`);

  let listData: BitunixOrder[] = [];
  if (res.data) {
    if (Array.isArray(res.data)) listData = res.data;
    else if ("orderList" in res.data) listData = res.data.orderList;
  }

  let mapped: NormalizedOrder[] = listData.map((o) => ({
    id: o.orderId,
    orderId: o.orderId,
    clientId: o.clientId,
    symbol: o.symbol,
    type: o.type,
    side: o.side,
    price: formatApiNum(o.price) || "0",
    amount: formatApiNum(o.qty) || "0",
    filled: formatApiNum(o.tradeQty) || "0",
    avgPrice: formatApiNum(o.avgPrice ?? o.averagePrice) || "0",
    realizedPNL: formatApiNum(o.realizedPNL) || "0",
    fee: formatApiNum(o.fee) || "0",
    reduceOnly: Boolean(o.reduceOnly),
    status: o.status || "UNKNOWN",
    // Hardening: Explicitly validate time, default to 0 only if missing/invalid
    time: (o.ctime && !isNaN(Number(o.ctime))) ? Number(o.ctime) : 0, // audit: safe — epoch-ms timestamp validation and conversion, not a financial value
    mtime: o.mtime,
    // Bitunix documents all of these on Get History Orders
    // (docs/bitunix-api/07_trade.md:294-325) but they were never mapped
    // through — the order tooltip's Leverage/Margin Mode/TP-SL rows always
    // rendered empty regardless of what the exchange sent.
    leverage: o.leverage,
    marginMode: o.marginMode,
    positionMode: o.positionMode,
    tpPrice: o.tpPrice,
    tpStopType: o.tpStopType,
    tpOrderType: o.tpOrderType,
    slPrice: o.slPrice,
    slStopType: o.slStopType,
    slOrderType: o.slOrderType,
  }));

  if (startTime !== undefined && !isNaN(startTime)) {
    mapped = mapped.filter((o) => (o.time ?? 0) >= startTime);
  }
  if (endTime !== undefined && !isNaN(endTime)) {
    mapped = mapped.filter((o) => (o.time ?? 0) <= endTime);
  }

  return mapped;
}

// --- Account ---

async function fetchBitunixAccount(
  apiKey: string,
  apiSecret: string,
): Promise<ExchangeAccountData> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";

  const params: Record<string, string> = {
    marginCoin: "USDT",
  };

  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    null,
  );

  const url = `${baseUrl}${path}?${queryString}`;

  const response = await fetchWithTimeout(url, {
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

  const text = await response.text();
  const res = safeJsonParse(text);

  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  const data = Array.isArray(res.data) ? res.data[0] : res.data;

  if (!data) throw new Error("No account data found");

  const available = new Decimal(data.available || "0");
  const margin = new Decimal(data.margin || "0");
  const crossPnL = new Decimal(data.crossUnrealizedPNL || "0");
  const isoPnL = new Decimal(data.isolationUnrealizedPNL || "0");
  const totalPnL = crossPnL.plus(isoPnL);

  return {
    available: formatApiNum(available),
    margin: formatApiNum(margin),
    totalUnrealizedPnL: formatApiNum(totalPnL),
    marginCoin: data.marginCoin,
    frozen: formatApiNum(data.frozen),
    transfer: formatApiNum(data.transfer),
    bonus: formatApiNum(data.bonus),
    positionMode: data.positionMode,
    crossUnrealizedPNL: formatApiNum(crossPnL),
    isolationUnrealizedPNL: formatApiNum(isoPnL),
  };
}

// --- Balance ---

async function fetchBitunixBalance(
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";

  // Params for the request
  const params: Record<string, string> = {
    marginCoin: "USDT",
  };

  // FEAT-0321: this path used to hand-roll the signing algorithm inline. It
  // signed byte-for-byte identically to `generateBitunixSignature`, which
  // `src/utils/server/bitunix.test.ts` records and now guards.
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    "",
  );

  const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
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

  const data = await readExchangeJson(response);

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  // Parsing Logic
  const accountInfo = data.data;

  if (!accountInfo) {
    return "0";
  }

  // Case: It returns an array of assets (as per documentation)
  if (Array.isArray(accountInfo)) {
    const usdt = accountInfo.find(
      (a) =>
        a.marginCoin === "USDT" || a.currency === "USDT" || a.asset === "USDT",
    );
    if (usdt) {
      // Calculate total wallet balance = available + margin + frozen
      // If explicit marginBalance/equity is present, prioritize that.
      if (usdt.marginBalance) return formatApiNum(usdt.marginBalance) || "0";
      if (usdt.equity) return formatApiNum(usdt.equity) || "0";

      const available = new Decimal(usdt.available || "0");
      const margin = new Decimal(usdt.margin || "0");
      const frozen = new Decimal(usdt.frozen || "0");
      return formatApiNum(available.plus(margin).plus(frozen)) || "0";
    }
  }

  // Case: Direct property on the object (fallback)
  if (accountInfo.marginBalance) {
    return formatApiNum(accountInfo.marginBalance) || "0";
  }

  // Fallback: available
  if (accountInfo.available) {
    return formatApiNum(accountInfo.available) || "0";
  }

  // Fallback: equity
  if (accountInfo.equity) {
    return formatApiNum(accountInfo.equity) || "0";
  }

  return "0";
}

// --- Klines ---

// Bitunix kline entry — field names vary across API versions/endpoints,
// hence the pairs (open/o, id/time, ...).
interface BitunixRawKline {
  open?: string | number;
  o?: string | number;
  high?: string | number;
  h?: string | number;
  low?: string | number;
  l?: string | number;
  close?: string | number;
  c?: string | number;
  quoteVol?: string | number;
  q?: string | number;
  volume?: string | number;
  vol?: string | number;
  v?: string | number;
  amount?: string | number;
  id?: string | number;
  time?: string | number;
  ts?: string | number;
}

async function fetchBitunixKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/market/kline";

  const map: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
    "1M": "1M",
  };
  const mappedInterval = map[interval] || interval;

  const params: Record<string, string> = {
    symbol: symbol.toUpperCase(),
    interval: mappedInterval,
    limit: limit.toString(),
  };
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  const queryString = new URLSearchParams(params).toString();
  const fullUrl = `${baseUrl}${path}?${queryString}`;

  const requestInit: RequestInit = {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  };

  let response!: Response;
  for (let attempt = 1; attempt <= UPSTREAM_RETRY_ATTEMPTS; attempt++) {
    try {
      response = await fetchWithTimeout(fullUrl, requestInit, DEFAULT_UPSTREAM_TIMEOUT_MS);
    } catch (e) {
      // Timeouts (surfaced as 504) are transient — retry them. Everything
      // else propagates immediately.
      if ((e as ApiError)?.status === 504 && attempt < UPSTREAM_RETRY_ATTEMPTS) {
        await sleep(upstreamRetryDelayMs(attempt));
        continue;
      }
      throw e;
    }
    if (response.ok || !isRetryableUpstreamStatus(response.status) || attempt === UPSTREAM_RETRY_ATTEMPTS) {
      break;
    }
    const delay =
      response.status === 429
        ? (retryAfterHeaderMs(response) ?? upstreamRetryDelayMs(attempt))
        : upstreamRetryDelayMs(attempt);
    await sleep(delay);
  }

  if (!response.ok) {
    const text = await response.text();
    let data;
    try {
      data = safeJsonParse(text);
    } catch {
      // Leave `data` undefined: the upstream body was not valid JSON.
      // The shape check below rejects it and returns a proper error response.
    }

    if (
      data &&
      (data.code === 2 ||
        data.code === "2" ||
        (data.msg &&
          typeof data.msg === "string" &&
          data.msg.toLowerCase().includes("system error")))
    ) {
      const error = new Error("Symbol not found") as ApiError;
      error.status = 404;
      throw error;
    }

    const safeText = text.slice(0, 100);
    console.error(`Bitunix API error ${response.status}: ${safeText}...`);
    const error = new Error(`Bitunix API error: ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }

  const responseText = await response.text();
  const data = safeJsonParse(responseText);

  if (data.code !== 0 && data.code !== "0") {
    if (
        data.code === 2 ||
        data.code === "2" ||
        (data.msg && data.msg.toLowerCase().includes("system error"))
      ) {
        const error = new Error("Symbol not found") as ApiError;
        error.status = 404;
        throw error;
      }
      throw new Error(`Bitunix API error: ${data.msg}`);
  }

  const results = data.data || [];
  
  if (limit > 5) {
      console.log(`[Bitunix API] ${symbol}:${interval} requested ${limit} with end ${end}. Got ${results.length}. FirstTS: ${results[0]?.time || results[0]?.id}, LastTS: ${results[results.length-1]?.time || results[results.length-1]?.id}`);
  }

  const mapped = results.map((k: BitunixRawKline) => ({
    open: String(k.open || k.o || 0),
    high: String(k.high || k.h || 0),
    low: String(k.low || k.l || 0),
    close: String(k.close || k.c || 0),
    volume: String(k.quoteVol || k.q || k.volume || k.vol || k.v || k.amount || 0),
    timestamp: k.id || k.time || k.ts || 0, // Swapped id and time priority
  }));

  // Optimization: Bitunix usually returns data in descending order.
  if (mapped.length > 1 && Number(mapped[0].timestamp) > Number(mapped[mapped.length - 1].timestamp)) { // audit: safe — comparing epoch-ms timestamps for sort order, not a financial computation
    mapped.reverse();
  }

  return mapped;
}

// --- Positions ---

// Raw Bitunix position fields — names vary across API versions/endpoints,
// hence the fallback chains at each read site below.
interface BitunixRawPosition {
  positionId?: string | number;
  side?: string | number;
  positionSide?: string;
  symbol: string;
  qty?: string | number;
  positionAmount?: string | number;
  holdVolume?: string | number;
  avgOpenPrice?: string | number;
  openAvgPrice?: string | number;
  avgPrice?: string | number;
  liquidationPrice?: string | number;
  liqPrice?: string | number;
  markPrice?: string | number;
  mark_price?: string | number;
  margin?: string | number;
  positionMargin?: string | number;
  maintMargin?: string | number;
  unrealizedPNL?: string | number;
  unrealizedPnL?: string | number;
  openLoss?: string | number;
  leverage?: string | number;
  marginMode?: string | number;
  marginRate?: string | number;
  realizedPNL?: string | number;
}

async function fetchBitunixPositions(
  apiKey: string,
  apiSecret: string,
): Promise<NormalizedPosition[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_pending_positions";

  // Params for the request
  const params: Record<string, string> = {};

  // FEAT-0321: this path used to hand-roll the signing algorithm inline. It
  // signed byte-for-byte identically to `generateBitunixSignature`, which
  // `src/utils/server/bitunix.test.ts` records and now guards.
  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    "",
  );

  const url = queryString
    ? `${baseUrl}${path}?${queryString}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
      // Add User-Agent to avoid potential blocking
      "User-Agent": "CachyApp/1.0",
    },
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

  // Normalized Position Object
  const rawPositions = Array.isArray(data.data) ? data.data : [];

  return rawPositions
    .map((p: BitunixRawPosition) => {
      // Robust side detection
      let side = "SHORT";
      if (p.side) {
        const s = p.side.toString().toUpperCase();
        if (s === "LONG" || s === "BUY" || s === "1") {
          side = "LONG";
        }
      } else if (p.positionSide) {
        const ps = p.positionSide.toString().toUpperCase();
        if (ps === "LONG") side = "LONG";
      }

      return {
        positionId: p.positionId !== undefined ? String(p.positionId) : undefined,
        symbol: p.symbol,
        side: side,
        // size: "qty" as per docs. Fallback to older fields.
        size: formatApiNum(p.qty || p.positionAmount || p.holdVolume),
        // entryPrice: "avgOpenPrice" as per docs.
        entryPrice: formatApiNum(
          p.avgOpenPrice || p.openAvgPrice || p.avgPrice,
        ),

        // Fixed Duplicate Keys Issue:
        liquidationPrice: formatApiNum(p.liquidationPrice || p.liqPrice),
        markPrice: formatApiNum(p.markPrice || p.mark_price),
        margin: formatApiNum(
          p.margin || p.positionMargin || p.maintMargin,
        ),

        // unrealizedPnL: "unrealizedPNL" as per docs.
        unrealizedPnL: formatApiNum(
          p.unrealizedPNL || p.unrealizedPnL || p.openLoss,
        ),
        marginRate: formatApiNum(p.marginRate),
        realizedPnl: formatApiNum(p.realizedPNL),
        leverage: formatApiNum(p.leverage),
        // marginType: "ISOLATION" | "CROSS" as per docs.
        marginMode:
          p.marginMode === "CROSS" ||
          p.marginMode === "cross" ||
          p.marginMode === 1 ||
          p.marginMode === "1"
            ? "cross"
            : "isolated",
      };
    })
    .filter((p: NormalizedPosition) => parseFloat(p.size || "0") !== 0); // audit: safe — zero-size filter: parseFloat used only for equality comparison, not stored or computed
}


// --- Tickers ---

function bitunixTickersUrl(query: TickersQuery): string {
  let apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/tickers`;
  if (query.symbols) {
    apiUrl += `?symbols=${query.symbols}`;
  }
  return apiUrl;
}

/**
 * Bitunix answers an unknown symbol with HTTP 200 and `code: 2` (or a "system
 * error" message) rather than a 404, so the tickers route has to read the body
 * to tell "no such symbol" from a successful empty result.
 */
function bitunixIsSymbolNotFoundBody(data: unknown): boolean {
  const body = data as { code?: unknown; msg?: unknown } | null | undefined;
  return Boolean(
    body &&
      (body.code === 2 ||
        body.code === "2" ||
        (body.msg &&
          typeof body.msg === "string" &&
          body.msg.toLowerCase().includes("system error"))),
  );
}

// --- Venue module ---

/**
 * Runs one order-route action against Bitunix.
 *
 * Resolves to `null` for an action Bitunix does not implement, which is what
 * the route's inline `if/else if` chain did when no branch matched.
 */
async function executeOrder(
  creds: VenueCredentials,
  payload: OrderRequestPayload,
): Promise<unknown> {
  const { apiKey, apiSecret } = creds;

  if (payload.type === "pending") {
    const orders = await fetchBitunixPendingOrders(apiKey, apiSecret);
    return { orders };
  }
  if (payload.type === "history") {
    const orders = await fetchBitunixHistoryOrders(
      apiKey,
      apiSecret,
      Number(payload.limit), // audit: safe — API pagination limit (integer count), not a financial value
      payload.queryCanceled,
      payload.startTime,
      payload.endTime,
      payload.symbol
    );
    return { orders };
  }
  if (payload.type === "place-order") {
    const orderPayload: BitunixOrderPayload = {
      symbol: payload.symbol,
      side: payload.side,
      orderType: payload.orderType,
      qty: payload.qty,
      price: payload.price,
      reduceOnly: Boolean(payload.reduceOnly),
      triggerPrice: payload.triggerPrice || payload.stopPrice,
      // HEDGE-mode close (BUG-0062) — see PlaceOrderSchema's comment.
      tradeSide: payload.tradeSide,
      positionId: payload.positionId,
      // FEAT-0069. `effect` is documented as required for LIMIT and
      // meaningless otherwise, so a market order sends none rather than a
      // value the exchange ignores.
      effect: payload.orderType === "MARKET" ? undefined : payload.effect,
      clientId: payload.clientId,
      tpPrice: payload.tpPrice,
      tpStopType: payload.tpStopType,
      tpOrderType: payload.tpOrderType,
      tpOrderPrice: payload.tpOrderPrice,
      slPrice: payload.slPrice,
      slStopType: payload.slStopType,
      slOrderType: payload.slOrderType,
      slOrderPrice: payload.slOrderPrice,
    };
    // Remove undefined safe
    const cleanedPayload = cleanPayload(orderPayload);

    return await placeBitunixOrder(apiKey, apiSecret, cleanedPayload);
  }
  if (payload.type === "close-position") {
    const safeAmount = formatApiNum(payload.amount);
    if (!safeAmount || new Decimal(safeAmount).lte(0)) throw new Error(ORDER_ERRORS.INVALID_AMOUNT);

    const closeOrder: BitunixOrderPayload = {
      symbol: payload.symbol,
      side: payload.side,
      orderType: "MARKET",
      qty: safeAmount,
      reduceOnly: true,
    };
    return await placeBitunixOrder(apiKey, apiSecret, closeOrder);
  }
  if (payload.type === "close-all-positions") {
    return await closeAllBitunixPositions(apiKey, apiSecret, payload.symbol);
  }
  if (payload.type === "flash-close-position") {
    return await flashCloseBitunixPosition(apiKey, apiSecret, payload.positionId);
  }
  if (payload.type === "cancel-all") {
    return await cancelAllBitunixOrders(apiKey, apiSecret, payload.symbol);
  }
  if (payload.type === "cancel-order") {
    return await cancelBitunixOrder(apiKey, apiSecret, payload.symbol, payload.orderId);
  }
  if (payload.type === "order-detail") {
    return await fetchBitunixOrderDetail(apiKey, apiSecret, payload.orderId, payload.clientId);
  }
  if (payload.type === "modify-order") {
    return await modifyBitunixOrder(apiKey, apiSecret, payload);
  }

  return null;
}

/*
 * FEAT-0068 — the account-settings write family.
 *
 * All four endpoints are POSTs under `/api/v1/futures/account/` that share
 * one shape: a JSON body, the standard signature over it, and a response
 * whose payload nobody needs — success is `code: 0`, and the *state* is read
 * back from the private WebSocket or a refetch rather than believed from
 * this echo (see FEAT-0068's acceptance criteria). So the helper returns the
 * body it sent, and the caller confirms elsewhere.
 */
async function postBitunixAccount(
  apiKey: string,
  apiSecret: string,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const baseUrl = "https://fapi.bitunix.com";
  const { nonce, timestamp, signature, bodyStr } = generateBitunixSignature(
    apiKey,
    apiSecret,
    {},
    body,
  );

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      timestamp,
      nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  if (!response.ok) {
    const text = await response.text();
    const error: ApiError = new Error(
      `Bitunix API error: ${response.status} ${text.slice(0, 200)}`,
    );
    error.status = response.status;
    throw error;
  }

  const res = await readExchangeJson<BitunixResponse<unknown>>(response);
  if (String(res.code) !== "0") {
    // The preconditions this family documents — "not while a position or
    // order is open" for margin mode and position mode — are enforced by the
    // exchange, and this is where that refusal becomes an error rather than
    // a silent success. The UI disables the control beforehand; that is
    // courtesy, this is the guarantee.
    const error: ExchangeError = new Error(res.msg || `Bitunix API error code: ${res.code}`);
    // `code` is a string on `ExchangeError` and `string | number` on the
    // wire, so it is normalised rather than cast — the route puts it in a
    // JSON body, where 0 and "0" would read differently to the client.
    error.code = String(res.code);
    throw error;
  }

  return res.data ?? null;
}

async function adjustBitunixPositionMargin(
  apiKey: string,
  apiSecret: string,
  payload: Extract<AccountSettingsPayload, { type: "adjust-position-margin" }>,
): Promise<unknown> {
  // "Entweder `side` oder `positionId` erforderlich" (02_account.md). Checked
  // here rather than in the Zod union, which cannot hold a refined object —
  // and checked at all because in HEDGE mode an unaddressed request would let
  // the exchange pick a side, moving margin on a position the trader was not
  // looking at.
  if (!payload.side && !payload.positionId) {
    const error: ExchangeError = new Error(ORDER_ERRORS.VALIDATION_ERROR);
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  return postBitunixAccount(apiKey, apiSecret, "/api/v1/futures/account/adjust_position_margin", {
    symbol: payload.symbol,
    marginCoin: payload.marginCoin,
    amount: payload.amount,
    ...(payload.side ? { side: payload.side } : {}),
    ...(payload.positionId ? { positionId: payload.positionId } : {}),
  });
}

async function executeAccountSetting(
  creds: VenueCredentials,
  payload: AccountSettingsPayload,
): Promise<unknown> {
  const { apiKey, apiSecret } = creds;

  if (payload.type === "change-leverage") {
    return postBitunixAccount(apiKey, apiSecret, "/api/v1/futures/account/change_leverage", {
      symbol: payload.symbol,
      marginCoin: payload.marginCoin,
      leverage: payload.leverage,
    });
  }
  if (payload.type === "change-margin-mode") {
    return postBitunixAccount(apiKey, apiSecret, "/api/v1/futures/account/change_margin_mode", {
      symbol: payload.symbol,
      marginCoin: payload.marginCoin,
      marginMode: payload.marginMode,
    });
  }
  if (payload.type === "change-position-mode") {
    return postBitunixAccount(apiKey, apiSecret, "/api/v1/futures/account/change_position_mode", {
      positionMode: payload.positionMode,
    });
  }
  return adjustBitunixPositionMargin(apiKey, apiSecret, payload);
}

export const bitunixVenue: VenueModule = {
  id: "bitunix",
  requiresPassphrase: false,

  validateKeys(creds: VenueCredentials): string | null {
    return validateBitunixKeys(creds.apiKey, creds.apiSecret);
  },

  fetchAccount(creds: VenueCredentials): Promise<ExchangeAccountData> {
    return fetchBitunixAccount(creds.apiKey, creds.apiSecret);
  },

  fetchBalance(creds: VenueCredentials): Promise<string> {
    return fetchBitunixBalance(creds.apiKey, creds.apiSecret);
  },

  fetchKlines(query: KlineQuery): Promise<VenueKline[]> {
    return fetchBitunixKlines(
      query.symbol,
      query.interval,
      query.limit,
      query.start,
      query.end,
    );
  },

  fetchPositions(creds: VenueCredentials): Promise<NormalizedPosition[]> {
    return fetchBitunixPositions(creds.apiKey, creds.apiSecret);
  },

  tickersUrl: bitunixTickersUrl,

  isSymbolNotFoundBody: bitunixIsSymbolNotFoundBody,

  executeOrder,

  executeAccountSetting,
};
