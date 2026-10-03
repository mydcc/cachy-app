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
import { bitgetUpstreamPath } from "../../exchange/restSigningPlan";
import type {
  ExchangeAccountData,
  KlineQuery,
  TickersQuery,
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
    envelope: PresignedEnvelope,
    venueBody: string,
): Promise<unknown> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/orders", "place-order");

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitgetCallHeaders(envelope),
        body: venueBody,
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
    envelope: PresignedEnvelope,
): Promise<NormalizedOrder[]> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/orders", "pending");
    // `productType: umcbl` (USDT-M) is one of the parameters the client signed,
    // so it arrives in the envelope rather than being rebuilt here.
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        method: "GET",
        headers: bitgetCallHeaders(envelope),
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
    envelope: PresignedEnvelope,
    payload: Extract<OrderRequestPayload, { type: "history" }>,
): Promise<NormalizedOrder[]> {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/orders", "history");
    // The query is the client's, built through `buildOrdersHistoryQueryParams`
    // on both sides. That is also where the endpoint's "last seven days"
    // default now lives: a default computed here would be dated from *this*
    // process's clock and would never equal the one the client signed.
    const url = envelope.query
        ? `${baseUrl}${path}?${envelope.query}`
        : `${baseUrl}${path}`;

    const response = await fetchWithTimeout(url, {
        headers: bitgetCallHeaders(envelope),
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

    const { startTime, endTime } = payload;
    if (startTime !== undefined && !isNaN(startTime)) {
        mapped = mapped.filter((o) => (o.time ?? 0) >= startTime);
    }
    if (endTime !== undefined && !isNaN(endTime)) {
        mapped = mapped.filter((o) => (o.time ?? 0) <= endTime);
    }

    return mapped;
}

async function cancelBitgetOrder(
    envelope: PresignedEnvelope,
    venueBody: string,
) {
    const baseUrl = "https://api.bitget.com";
    const path = bitgetPath("/api/orders", "cancel-order");

    const response = await fetchWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: bitgetCallHeaders(envelope),
        body: venueBody,
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
 * against (`BITGET_UPSTREAM_PATHS` and, on `/api/orders`, `BITGET_ORDER_PATHS`
 * in `restSigningPlan`). `action` is what selects a row on the latter.
 *
 * Bitget's prehash covers the request path, so a literal here and a literal in
 * the signer is a divergence whose only symptom is a venue rejection in the
 * middle of a trade. Thrown rather than defaulted when the table has no entry:
 * a call sent to Cachy's own path carries a signature Bitget cannot verify.
 */
function bitgetPath(cachyPath: string, action?: string): string {
    const path = bitgetUpstreamPath(cachyPath, action);
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

/**
 * V2 market endpoints and the USDT-M product name.
 *
 * BUG-0576 — Bitget decommissioned the `/api/mix/v1/…` generation and answers
 * `30032 "The V1 API has been decommissioned"` before it looks at anything
 * else, which took out tickers and every kline. V2 changes three things at
 * once, all confirmed against the live API on 2026-09-30:
 *
 *   - the contract is the bare pair (`BTCUSDT`, no `_UMCBL`); sending the
 *     suffixed form answers `40034 "Parameter … does not exist"`
 *   - `productType` is required even on a single-symbol ticker and has to
 *     read `USDT-FUTURES` rather than V1's `umcbl`; without it the venue
 *     answers `400172 "Parameter verification failed"`
 *   - the paths sit under `/api/v2/mix/…`
 */
const BITGET_V2_BASE_URL = "https://api.bitget.com";
const BITGET_V2_PRODUCT_TYPE = "USDT-FUTURES";
const BITGET_V2_CANDLES_PATH = "/api/v2/mix/market/candles";
const BITGET_V2_TICKER_PATH = "/api/v2/mix/market/ticker";
const BITGET_V2_TICKERS_PATH = "/api/v2/mix/market/tickers";

/**
 * Bitget's own ceiling for one candles request, in rows.
 *
 * Above it the venue rejects the request rather than truncating it:
 * `limit=1000` answers `00000` with 1000 rows, `limit=1001` answers
 * `40053 "Value range verification failed: limit should be between (0, 1000]"`
 * (both verified 2026-09-30).
 *
 * The klines route clamps as well, and both ceilings happen to be 1000 today —
 * but that coincidence is not a contract. `MAX_KLINE_LIMIT` in
 * `lib/server/klineCacheKey.ts` is documented as *Bitunix's*: the largest value
 * a caller currently asks for, above which Bitunix truncates rather than
 * rejects. Clamping here is what keeps Bitget's ceiling from moving under us
 * when that unrelated constant changes.
 */
const BITGET_V2_MAX_CANDLES = 1000;

/**
 * Reads Bitget's `{code, msg, requestTime, data}` envelope without throwing.
 *
 * `safeJsonParse` raises on anything that is not JSON, and an upstream that
 * answers an HTML error page must not surface as a parse error: the HTTP status
 * is the useful diagnosis there, and the caller still checks it. `null` means
 * "no envelope to read", not "a good response".
 */
function parseBitgetEnvelope(
  text: string,
): { code?: string; msg?: string; data?: unknown } | null {
  try {
    const parsed = safeJsonParse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reduces a symbol Cachy is holding to the bare contract V2 addresses.
 *
 * BUG-0599 stopped `normalizeSymbol` from appending the V1 `_UMCBL` suffix, so
 * the strip below is no longer compensating for this app's own helper — it is
 * the wire-boundary guarantee, and it stays for that reason. Both callers take a
 * symbol from outside the store: `fetchBitgetKlines` is reached through the
 * chart's timeframe plumbing and `fetchBitgetTickers` through the query-string
 * route, so a raw `BTCUSDT_UMCBL` can arrive from a persisted payload, a
 * bookmark, or a hand-edited request without ever passing through
 * `normalizeSymbol`. Without the strip that reaches the venue and comes back
 * `40034`, with nothing in the app to explain it.
 *
 * Keeping it here rather than relying on `bitgetWireSymbol` alone is deliberate:
 * this is the last point before the query string is built, so the guarantee does
 * not depend on every caller upstream having normalized.
 */
function bitgetV2Symbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/_UMCBL$/, "");
}

async function fetchBitgetKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  // Bitget Granularity: 1m, 5m, 15m, 30m, 1H, 4H, 12H, 1D, 1W
  // V2 takes the same names and rejects the lowercase spellings with 400171,
  // so this mapping carries over unchanged from V1.
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

  const params: Record<string, string> = {
    symbol: bitgetV2Symbol(symbol),
    productType: BITGET_V2_PRODUCT_TYPE,
    granularity: mappedInterval,
  };
  // V2 honours `limit` here. V1's documentation was ambiguous about it, which
  // is why `limit` used to arrive as a parameter and then go unused, leaving
  // the row count to Bitget's default. Guarded so a missing or nonsensical
  // limit leaves the venue's own default in place rather than sending
  // `limit=NaN`, and capped at the venue's ceiling rather than relying on the
  // route's clamp happening to match it.
  if (Number.isFinite(limit) && limit > 0) {
    params.limit = String(Math.min(Math.floor(limit), BITGET_V2_MAX_CANDLES));
  }
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  // If no start/end, Bitget returns latest.

  const queryString = new URLSearchParams(params).toString();

  const response = await fetchWithTimeout(`${BITGET_V2_BASE_URL}${BITGET_V2_CANDLES_PATH}?${queryString}`, {}, DEFAULT_UPSTREAM_TIMEOUT_MS);

  // [[timestamp, open, high, low, close, volume, quoteVol], ...]
  // timestamp is string or number? usually string in response.

  const text = await response.text();
  const envelope = parseBitgetEnvelope(text);

  // Bitget wraps every V2 response in `{code, msg, requestTime, data}`, and
  // the candle array sits in `data`. This used to test the envelope itself for
  // being an array, which is never true — so a perfectly good 200 was reported
  // as "no candles" and every chart stayed empty regardless of the endpoint.
  //
  // The envelope is read before the status is judged, because Bitget pairs
  // every business error with a 4xx: `40034` unknown symbol, `400172` missing
  // productType, `400171` bad granularity and `40053` limit out of range all
  // arrive as HTTP 400 (verified 2026-09-30). Checking `response.ok` first
  // therefore discarded `msg` on every one of them and reduced a precise vendor
  // diagnosis to "Bitget API error: 400". The status check stays as the
  // fallback for an upstream that answers with no readable envelope at all.
  if (envelope && envelope.code !== undefined && envelope.code !== "00000") {
    throw new Error(
      `Bitget Error: ${envelope.code} ${envelope.msg || ""}`.trim(),
    );
  }
  if (!response.ok) {
    throw new Error(`Bitget API error: ${response.status}`);
  }

  const rows = envelope ? envelope.data : undefined;
  if (!Array.isArray(rows)) {
    // An explicitly empty `data` is a real answer and lands in the branch
    // above the map; anything else here is a shape this parser does not know.
    console.warn("[Klines] Unexpected Bitget response format", envelope);
    return [];
  }

  // Optimize: Return plain strings
  return rows
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
  // BUG-0576 — V2 needs `productType` on the single-symbol form too, not just
  // on the list form; without it the venue answers 400172.
  if (query.symbols) {
    const params = new URLSearchParams({
      symbol: bitgetV2Symbol(query.symbols),
      productType: BITGET_V2_PRODUCT_TYPE,
    });
    return `${BITGET_V2_BASE_URL}${BITGET_V2_TICKER_PATH}?${params.toString()}`;
  }
  return `${BITGET_V2_BASE_URL}${BITGET_V2_TICKERS_PATH}?productType=${BITGET_V2_PRODUCT_TYPE}`;
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
  envelope: PresignedEnvelope,
  payload: OrderRequestPayload,
  venueBody: string,
): Promise<unknown> {
  // Unreachable from the orders route once the envelope has been read: the
  // passphrase header is mandatory on a route the plan marks Bitget-reachable,
  // so `bitgetCallHeaders` below is what refuses a request without one. The
  // check keeps the message legible rather than letting a missing header read
  // as a missing envelope.
  if (!envelope.passphrase) throw new Error(ORDER_ERRORS.PASSPHRASE_REQUIRED);

  if (payload.type === "pending") {
    const orders = await fetchBitgetPendingOrders(envelope);
    return { orders };
  }
  if (payload.type === "history") {
    const orders = await fetchBitgetHistoryOrders(envelope, payload);
    return { orders };
  }
  if (payload.type === "place-order") {
    return await placeBitgetOrder(envelope, venueBody);
  }
  if (payload.type === "close-position") {
    return await placeBitgetOrder(envelope, venueBody);
  }
  if (payload.type === "cancel-order") {
    return await cancelBitgetOrder(envelope, venueBody);
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

  fetchAccount(envelope: PresignedEnvelope): Promise<ExchangeAccountData> {
    return fetchBitgetAccount(envelope);
  },

  fetchBalance(envelope: PresignedEnvelope): Promise<string> {
    return fetchBitgetBalance(envelope);
  },

  // `/api/v2/mix/market/candles` serves the last-price series only. V2 can
  // serve mark candles on the same path via `kLineType=mark` (verified
  // 2026-09-30), but wiring it is its own change; until then a mark request is
  // refused rather than answered with last-price candles wearing a mark label.
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
