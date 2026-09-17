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

import {
  generateBitgetSignature,
  validateBitgetKeys,
} from "../bitget";
import type { NormalizedOrder, NormalizedPosition } from "../../../types/exchange";
import type { OrderRequestPayload } from "../../../types/orderSchemas";
import { formatApiNum } from "../../utils";
import { safeJsonParse } from "../../safeJson";
import { readExchangeJson } from "../exchangeResponse";
import { bitgetCallHeaders, type PresignedEnvelope } from "../presignedEnvelope";
import {
  fetchWithTimeout,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
} from "../fetchWithTimeout";
import { ORDER_ERRORS, type ExchangeError } from "../../exchange/orderErrors";
import { buildVenueBody } from "../../exchange/venueBodies";
import { bitgetUpstreamPath } from "../../exchange/restSigningPlan";
import type {
  ExchangeAccountData,
  KlineQuery,
  TickersQuery,
  VenueCredentials,
  VenueKline,
  VenueModule,
} from "./types";

// Raw fields read off Bitget's current/history order list responses. The
// two endpoints use different field names for fill price and status
// (priceAvg/state on history, unset on current) — both live here since
// this is "whatever field either endpoint's raw order carries," not a
// single canonical shape.
interface BitgetRawOrder {
  orderId?: string;
  symbol?: string;
  orderType?: string;
  side?: string;
  price?: string | number;
  priceAvg?: string | number;
  size?: string | number;
  filledQty?: string | number;
  status?: string;
  state?: string;
  cTime?: string | number;
  fee?: string | number;
  totalProfits?: string | number;
}

// --- Bitget Helpers ---

/**
 * Posts an already-built body.
 *
 * The body arrives as a string from `buildVenueBody` and the signer takes it
 * verbatim, so the client and the server cannot disagree about the bytes that
 * were signed (FEAT-0405 AC4).
 */
async function placeBitgetOrder(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    body: string
): Promise<unknown> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/placeOrder";

    const { timestamp, signature, bodyStr } = generateBitgetSignature(apiSecret, "POST", path, {}, body);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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
        (err as ExchangeError).details = `${response.status} ${text.slice(0, 100)}`;
        throw err;
    }

    const text = await response.text();
    const res = safeJsonParse(text);
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

    const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
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
    const text = await response.text();
    const res = safeJsonParse(text);
    if (res.code !== "00000") throw new Error(`Bitget Error: ${res.msg}`);

    const orders = res.data || [];
    return orders.map((o: BitgetRawOrder) => ({
        id: o.orderId,
        orderId: o.orderId,
        symbol: o.symbol,
        type: o.orderType,
        side: o.side, // open_long etc
        price: formatApiNum(o.price) || "0",
        amount: formatApiNum(o.size) || "0",
        filled: formatApiNum(o.filledQty) || "0",
        status: o.status, // new, partial_fill
        time: parseInt(String(o.cTime)),
        fee: formatApiNum(o.fee) || "0",
        realizedPNL: formatApiNum(o.totalProfits) || "0",
    }));
}

async function fetchBitgetHistoryOrders(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    limit = 20,
    startTime?: number,
    endTime?: number,
    symbol?: string
): Promise<NormalizedOrder[]> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/history";

    const params: Record<string, string> = {
        productType: "umcbl",
        pageSize: String(limit),
        startTime: startTime !== undefined && !isNaN(startTime)
            ? String(startTime)
            : String(Date.now() - 7 * 24 * 3600 * 1000) // Last 7 days default
    };
    if (endTime !== undefined && !isNaN(endTime)) params.endTime = String(endTime);
    if (symbol) params.symbol = symbol;

    const { timestamp, signature, queryString } = generateBitgetSignature(apiSecret, "GET", path, params);

    const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) throw new Error(ORDER_ERRORS.BITGET_API_ERROR);
    const text = await response.text();
    const res = safeJsonParse(text);
    if (res.code !== "00000") throw new Error(`Bitget Error: ${res.msg}`);

    const orders = res.data || [];
    let mapped: NormalizedOrder[] = orders.map((o: BitgetRawOrder) => ({
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
        time: parseInt(String(o.cTime)),
        fee: formatApiNum(o.fee) || "0",
        realizedPNL: formatApiNum(o.totalProfits) || "0",
    }));

    if (startTime !== undefined && !isNaN(startTime)) {
        mapped = mapped.filter((o) => (o.time ?? 0) >= startTime);
    }
    if (endTime !== undefined && !isNaN(endTime)) {
        mapped = mapped.filter((o) => (o.time ?? 0) <= endTime);
    }

    return mapped;
}

async function cancelBitgetOrder(
    apiKey: string,
    apiSecret: string,
    passphrase: string,
    body: string
) {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/order/cancel-order";

    const { timestamp, signature, bodyStr } = generateBitgetSignature(apiSecret, "POST", path, {}, body);

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
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
        throw new Error(`Bitget Cancel Error: ${response.status} ${text}`);
    }

    const text = await response.text();
    const res = safeJsonParse(text);
    if (res.code !== "00000") {
        throw new Error(`Bitget Error: ${res.msg}`);
    }

    return res.data;
}

// --- Account ---

/**
 * The path Bitget is asked on, read from the same table the browser signs
 * against (`BITGET_UPSTREAM_PATHS` in `restSigningPlan`).
 *
 * Bitget's prehash covers the request path, so a literal here and a literal in
 * the signer is a divergence whose only symptom is a venue rejection in the
 * middle of a trade. Thrown rather than defaulted when the table has no entry:
 * a call sent to Cachy's own path carries a signature Bitget cannot verify.
 */
function bitgetPath(cachyPath: string): string {
    const path = bitgetUpstreamPath(cachyPath);
    if (path === null) throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
    return path;
}

async function fetchBitgetAccount(
    envelope: PresignedEnvelope,
): Promise<ExchangeAccountData> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/account");
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        headers: bitgetCallHeaders(envelope)
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const text = await response.text();
    const res = safeJsonParse(text);

    if (res.code !== "00000") throw new Error(res.msg);

    const data = res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
    if (!data) throw new Error("No account data found");

    return {
        available: formatApiNum(data.available),
        margin: formatApiNum(data.locked),
        totalUnrealizedPnL: formatApiNum(data.unrealizedPL),
        marginCoin: data.marginCoin,
        frozen: formatApiNum(data.locked),
        equity: formatApiNum(data.equity)
    };
}

// --- Balance ---

async function fetchBitgetBalance(
  envelope: PresignedEnvelope,
): Promise<string> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/balance");
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        headers: bitgetCallHeaders(envelope)
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const res = await readExchangeJson(response);
    if (res.code !== "00000") throw new Error(res.msg);

    const data = res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
    if (!data) return "0";

    // Return equity (total balance including unrealized PnL) or marginBalance (wallet balance + unrealized PnL)?
    // Usually equity is what users want to see as "Total Balance".
    return formatApiNum(data.equity || data.marginBalance) || "0";
}

// --- Klines ---

// [timestamp, open, high, low, close, volume, quoteVol]
type BitgetCandleTuple = [string | number, string | number, string | number, string | number, string | number, string | number, (string | number)?];

async function fetchBitgetKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  const baseUrl = "https://api.bitget.com";
  const path = "/api/mix/v1/market/candles";

  // Bitget Granularity: 1m, 5m, 15m, 30m, 1H, 4H, 12H, 1D, 1W
  const map: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1w": "1W",
  };
  const mappedInterval = map[interval] || interval;

  // Bitget requires _UMCBL suffix usually for Mix
  let bitgetSymbol = symbol.toUpperCase();
  if (!bitgetSymbol.includes("_")) {
      bitgetSymbol += "_UMCBL";
  }

  const params: Record<string, string> = {
    symbol: bitgetSymbol,
    granularity: mappedInterval,
    // limit? Bitget doesn't explicitly support 'limit' param in some docs, but we can try.
    // Usually it relies on startTime/endTime.
  };
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  // If no start/end, Bitget returns latest.

  const queryString = new URLSearchParams(params).toString();

  const response = await fetchWithTimeout(`${baseUrl}${path}?${queryString}`, {}, DEFAULT_UPSTREAM_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Bitget API error: ${response.status}`);
  }

  const text = await response.text();
  const data = safeJsonParse(text);
  // [[timestamp, open, high, low, close, volume, quoteVol], ...]
  // timestamp is string or number? usually string in response.

  // Hardening: Check if data is actually an array (success) or error object
  if (!Array.isArray(data)) {
      if (data && data.code && data.code !== "00000") {
          throw new Error(`Bitget Error: ${data.msg || data.code}`);
      }
      // If valid empty result or unknown structure
      if (!data) return [];
      // Fallback if structure is unexpected but not explicit error
      console.warn("[Klines] Unexpected Bitget response format", data);
      return [];
  }

  // Optimize: Return plain strings
  return data
    .map((k: BitgetCandleTuple) => ({
      timestamp: parseInt(String(k[0])),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5], // base volume
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

// --- Positions ---

// Raw Bitget position fields (/api/mix/v1/position/allPosition).
interface BitgetRawPosition {
  symbol: string;
  holdSide?: string;
  total?: string | number;
  averageOpenPrice?: string | number;
  markPrice?: string | number;
  liquidationPrice?: string | number;
  margin?: string | number;
  unrealizedPL?: string | number;
  leverage?: string | number;
  marginMode?: string;
}

async function fetchBitgetPositions(
  envelope: PresignedEnvelope,
): Promise<NormalizedPosition[]> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/positions");
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        headers: bitgetCallHeaders(envelope)
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const res = await readExchangeJson(response);
    if (res.code !== "00000") throw new Error(res.msg);

    const data = res.data || [];

    return data
        .filter((p: BitgetRawPosition) => parseFloat(String(p.total || "0")) !== 0) // Filter empty positions
        .map((p: BitgetRawPosition) => {
            return {
                symbol: p.symbol,
                side: (p.holdSide || "").toUpperCase(),
                size: formatApiNum(p.total),
                entryPrice: formatApiNum(p.averageOpenPrice),
                markPrice: formatApiNum(p.markPrice),
                liquidationPrice: formatApiNum(p.liquidationPrice),
                margin: formatApiNum(p.margin),
                unrealizedPnL: formatApiNum(p.unrealizedPL),
                leverage: formatApiNum(p.leverage),
                marginMode: p.marginMode || ""
            };
        });
}


// --- Tickers ---

function bitgetTickersUrl(query: TickersQuery): string {
  // Bitget Futures API
  if (query.symbols) {
    let sym = query.symbols.toUpperCase();
    if (!sym.includes("_")) sym += "_UMCBL";
    return `https://api.bitget.com/api/mix/v1/market/ticker?symbol=${sym}`;
  }
  // All tickers
  return `https://api.bitget.com/api/mix/v1/market/tickers?productType=umcbl`;
}

/**
 * Bitget signals success with `code: "00000"` and reports a bad symbol as a
 * non-2xx, so the tickers route never applied the Bitunix body test here.
 * Returning false keeps that exactly as it was.
 */
function bitgetIsSymbolNotFoundBody(): boolean {
  return false;
}

// --- Venue module ---

/**
 * Runs one order-route action against Bitget.
 *
 * Resolves to `null` for an action Bitget does not implement — Bitget covers
 * fewer of them than Bitunix, and the route answered `null` with 200 for the
 * rest before this module existed.
 */
async function executeOrder(
  creds: VenueCredentials,
  payload: OrderRequestPayload,
): Promise<unknown> {
  const { apiKey, apiSecret, passphrase } = creds;

  // Unreachable from the routes, which reject a Bitget request without a
  // passphrase before they get here. Kept because it is also what narrows
  // `passphrase` from `string | undefined` for the calls below.
  if (!passphrase) throw new Error(ORDER_ERRORS.PASSPHRASE_REQUIRED);

  if (payload.type === "pending") {
    const orders = await fetchBitgetPendingOrders(apiKey, apiSecret, passphrase);
    return { orders };
  }
  if (payload.type === "history") {
    const orders = await fetchBitgetHistoryOrders(
      apiKey,
      apiSecret,
      passphrase,
      Number(payload.limit),
      payload.startTime,
      payload.endTime,
      payload.symbol
    );
    return { orders };
  }
  if (payload.type === "place-order") {
    return await placeBitgetOrder(apiKey, apiSecret, passphrase, buildVenueBody("bitget", payload));
  }
  if (payload.type === "close-position") {
    return await placeBitgetOrder(apiKey, apiSecret, passphrase, buildVenueBody("bitget", payload));
  }
  if (payload.type === "cancel-order") {
    return await cancelBitgetOrder(apiKey, apiSecret, passphrase, buildVenueBody("bitget", payload));
  }

  return null;
}

/*
 * FEAT-0068 — not wired for Bitget.
 *
 * Bitget has its own leverage / margin-mode / position-mode endpoints, but
 * Cachy has no verified request format for them and BUG-0001 is the standing
 * reminder not to guess an exchange's wire format. `null` is the venue
 * boundary's "I do not implement this", which the route turns into a refusal
 * rather than a 200 — and the client adapter refuses one step earlier still,
 * so this is the backstop, not the message the trader reads.
 *
 * `/api/account-settings` names Bitunix alone in `ROUTE_SIGNING_PLAN`, so a
 * Bitget account is refused while its envelope is being built and never reaches
 * this. It takes no parameters for that reason: there is nothing to forward to
 * a venue that has no endpoint, and a shorter signature keeps a call site from
 * having to invent them.
 */
async function executeAccountSetting(): Promise<null> {
  return null;
}

export const bitgetVenue: VenueModule = {
  id: "bitget",
  requiresPassphrase: true,

  validateKeys(creds: VenueCredentials): string | null {
    return validateBitgetKeys(creds.apiKey, creds.apiSecret, creds.passphrase);
  },

  fetchAccount(envelope: PresignedEnvelope): Promise<ExchangeAccountData> {
    return fetchBitgetAccount(envelope);
  },

  fetchBalance(envelope: PresignedEnvelope): Promise<string> {
    return fetchBitgetBalance(envelope);
  },

  // `/api/mix/v1/market/candles` serves the last-price series only. Bitget
  // does have a separate mark-candles endpoint, but wiring it is its own
  // change; until then a mark request is refused rather than answered with
  // last-price candles wearing a mark label.
  supportsMarkKlines: false,

  fetchKlines(query: KlineQuery): Promise<VenueKline[]> {
    return fetchBitgetKlines(
      query.symbol,
      query.interval,
      query.limit,
      query.start,
      query.end,
    );
  },

  fetchPositions(envelope: PresignedEnvelope): Promise<NormalizedPosition[]> {
    return fetchBitgetPositions(envelope);
  },

  tickersUrl: bitgetTickersUrl,

  isSymbolNotFoundBody: bitgetIsSymbolNotFoundBody,

  executeOrder,

  executeAccountSetting,
};
