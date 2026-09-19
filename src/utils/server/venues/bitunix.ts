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
import type {
  BitunixResponse,
  BitunixOrder,
  BitunixOrderListWrapper,
} from "../../../types/bitunix";
import type { NormalizedOrder, NormalizedPosition } from "../../../types/exchange";
import type { OrderRequestPayload } from "../../../types/orderSchemas";
import type { AccountSettingsPayload } from "../../../types/accountSettingsSchemas";
import { formatApiNum } from "../../utils";
import { safeJsonParse } from "../../safeJson";
import { readExchangeJson } from "../exchangeResponse";
import { bitunixCallHeaders, type PresignedEnvelope } from "../presignedEnvelope";
import {
  fetchWithTimeout,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  type UpstreamApiError,
} from "../fetchWithTimeout";
import { ORDER_ERRORS, type ExchangeError } from "../../exchange/orderErrors";
import {
  UPSTREAM_RETRY_ATTEMPTS,
  isRetryableUpstreamStatus,
  retryAfterHeaderMs,
  sleep,
  upstreamRetryDelayMs,
} from "./upstreamRetry";
import type {
  ExchangeAccountData,
  KlinePriceSource,
  KlineQuery,
  TickersQuery,
  VenueKline,
  VenueModule,
} from "./types";

type ApiError = UpstreamApiError;

// --- Bitunix Helpers ---

async function cancelBitunixOrder(envelope: PresignedEnvelope, venueBody: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/cancel_orders";

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitunixCallHeaders(envelope),
        body: venueBody,
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

async function cancelAllBitunixOrders(envelope: PresignedEnvelope, venueBody: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/cancel_all_orders";

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitunixCallHeaders(envelope),
        body: venueBody,
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

async function closeAllBitunixPositions(envelope: PresignedEnvelope, venueBody: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/close_all_position";

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitunixCallHeaders(envelope),
        body: venueBody,
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

async function flashCloseBitunixPosition(envelope: PresignedEnvelope, venueBody: string) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/flash_close_position";

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitunixCallHeaders(envelope),
        body: venueBody,
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
    envelope: PresignedEnvelope,
): Promise<NormalizedOrder> {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/get_order_detail";
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: bitunixCallHeaders(envelope),
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
    envelope: PresignedEnvelope,
    venueBody: string,
) {
    const baseUrl = "https://fapi.bitunix.com";
    const path = "/api/v1/futures/trade/modify_order";

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitunixCallHeaders(envelope),
        body: venueBody,
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

/**
 * Posts an already-built body.
 *
 * The body arrives as a string from `buildVenueBody`, and both signers take a
 * string verbatim — re-serialising an object here would be a second chance to
 * disagree with the client about the signed bytes, which is the one thing the
 * shared builder exists to rule out (FEAT-0405 AC4).
 */
async function placeBitunixOrder(
  envelope: PresignedEnvelope,
  venueBody: string,
): Promise<BitunixOrder> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/place_order";

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers: bitunixCallHeaders(envelope),
    body: venueBody,
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

async function fetchBitunixPendingOrders(envelope: PresignedEnvelope): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_pending_orders";
  // This endpoint signs no parameters at all, so `envelope.query` is the empty
  // string the client sent rather than an absent header — there is nothing to
  // append, and appending a bare `?` would make the URL differ from the one
  // the signature was built for.
  const url = envelope.query
    ? `${baseUrl}${path}?${envelope.query}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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
  envelope: PresignedEnvelope,
  payload: Extract<OrderRequestPayload, { type: "history" }>,
): Promise<NormalizedOrder[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_orders";
  // Bitunix's own split: queryCanceled=false returns everything except
  // CANCELED (up to 90 days back); true returns ONLY CANCELED (up to 3 days
  // back). Neither call alone is a complete history.
  //
  // The query itself is the client's — see `buildOrdersHistoryQueryParams`,
  // which both sides build through. Only the range filter below is read off
  // the payload, because the venue's own startTime/endTime are not honoured by
  // every response shape and the mapped rows are filtered locally as before.
  const url = envelope.query
    ? `${baseUrl}${path}?${envelope.query}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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

  const { startTime, endTime } = payload;
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
  envelope: PresignedEnvelope,
): Promise<ExchangeAccountData> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";
  const url = envelope.query
    ? `${baseUrl}${path}?${envelope.query}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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
  envelope: PresignedEnvelope,
): Promise<string> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";
  const url = envelope.query
    ? `${baseUrl}${path}?${envelope.query}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
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
  priceSource: KlinePriceSource = "last",
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
  // Only sent for a mark request. The endpoint defaults to `LAST_PRICE`, so
  // omitting it keeps every existing call byte-identical on the wire — the
  // chart and every indicator go through here.
  if (priceSource === "mark") params.type = "MARK_PRICE";

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
  envelope: PresignedEnvelope,
): Promise<NormalizedPosition[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_pending_positions";
  const url = envelope.query
    ? `${baseUrl}${path}?${envelope.query}`
    : `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      ...bitunixCallHeaders(envelope),
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
 *
 * FEAT-0405 A5 — nothing here signs. `venueBody` is the exact string the client
 * signed; the three read actions carry no body at all, because their signature
 * covers `envelope.query`, which is also what the URL below is built from. The
 * only action whose body is not forwarded verbatim is none of them: the
 * zero-amount refusal for `close-position` now lives in `buildVenueBody`, on
 * the side that produces the bytes, rather than here where a rejection would
 * arrive after the client had already signed.
 */
async function executeOrder(
  envelope: PresignedEnvelope,
  payload: OrderRequestPayload,
  venueBody: string,
): Promise<unknown> {
  if (payload.type === "pending") {
    const orders = await fetchBitunixPendingOrders(envelope);
    return { orders };
  }
  if (payload.type === "history") {
    const orders = await fetchBitunixHistoryOrders(envelope, payload);
    return { orders };
  }
  if (payload.type === "place-order") {
    return await placeBitunixOrder(envelope, venueBody);
  }
  if (payload.type === "close-position") {
    return await placeBitunixOrder(envelope, venueBody);
  }
  if (payload.type === "close-all-positions") {
    return await closeAllBitunixPositions(envelope, venueBody);
  }
  if (payload.type === "flash-close-position") {
    return await flashCloseBitunixPosition(envelope, venueBody);
  }
  if (payload.type === "cancel-all") {
    return await cancelAllBitunixOrders(envelope, venueBody);
  }
  if (payload.type === "cancel-order") {
    return await cancelBitunixOrder(envelope, venueBody);
  }
  if (payload.type === "order-detail") {
    return await fetchBitunixOrderDetail(envelope);
  }
  if (payload.type === "modify-order") {
    return await modifyBitunixOrder(envelope, venueBody);
  }

  return null;
}

/*
 * FEAT-0068 — the account-settings write family.
 *
 * All four endpoints are POSTs under `/api/v1/futures/account/` that share
 * one shape: a JSON body, a signature over it, and a response whose payload
 * nobody needs — success is `code: 0`, and the *state* is read back from the
 * private WebSocket or a refetch rather than believed from this echo (see
 * FEAT-0068's acceptance criteria). So the helper returns the body it sent,
 * and the caller confirms elsewhere.
 *
 * The signature is the client's, not this process's: the route forwards the
 * envelope it just verified, and `body` is the same string the client signed.
 * `bitunixCallHeaders` is the single place that maps an envelope onto Bitunix's
 * header names, so this cannot drift from the other callers.
 */
async function postBitunixAccount(
  envelope: PresignedEnvelope,
  path: string,
  body: string,
): Promise<unknown> {
  const baseUrl = "https://fapi.bitunix.com";

  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers: bitunixCallHeaders(envelope),
    body,
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

/**
 * One endpoint per action. The bodies these endpoints carry are not assembled
 * here either: the client builds them through `buildVenueBody`, signs them, and
 * the route hands the string it received straight to `postBitunixAccount`. The
 * "either `side` or `positionId`" rule for `adjust-position-margin` moved with
 * them.
 */
const ACCOUNT_SETTING_PATHS: Record<AccountSettingsPayload["type"], string> = {
  "change-leverage": "/api/v1/futures/account/change_leverage",
  "change-margin-mode": "/api/v1/futures/account/change_margin_mode",
  "change-position-mode": "/api/v1/futures/account/change_position_mode",
  "adjust-position-margin": "/api/v1/futures/account/adjust_position_margin",
};

async function executeAccountSetting(
  envelope: PresignedEnvelope,
  payload: AccountSettingsPayload,
  venueBody: string,
): Promise<unknown> {
  return postBitunixAccount(envelope, ACCOUNT_SETTING_PATHS[payload.type], venueBody);
}

export const bitunixVenue: VenueModule = {
  id: "bitunix",
  requiresPassphrase: false,

  fetchAccount(envelope: PresignedEnvelope): Promise<ExchangeAccountData> {
    return fetchBitunixAccount(envelope);
  },

  fetchBalance(envelope: PresignedEnvelope): Promise<string> {
    return fetchBitunixBalance(envelope);
  },

  supportsMarkKlines: true,

  fetchKlines(query: KlineQuery): Promise<VenueKline[]> {
    return fetchBitunixKlines(
      query.symbol,
      query.interval,
      query.limit,
      query.start,
      query.end,
      query.priceSource,
    );
  },

  fetchPositions(envelope: PresignedEnvelope): Promise<NormalizedPosition[]> {
    return fetchBitunixPositions(envelope);
  },

  tickersUrl: bitunixTickersUrl,

  isSymbolNotFoundBody: bitunixIsSymbolNotFoundBody,

  executeOrder,

  executeAccountSetting,
};
