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

/**
 * Bitunix REST request-body construction (FEAT-0405).
 *
 * The exchange signs `JSON.stringify(body)`, so the property insertion order
 * below is part of the wire contract, not a style choice. This module is the
 * single place a Bitunix order body is assembled, so a future client-side
 * signer (ADR-0013) can produce byte-for-byte the same payload the server
 * forwards upstream.
 *
 * Browser-safe: no `node:*` imports, no server-only SvelteKit modules. Both
 * `src/utils/server/venues/bitunix.ts` and the trading client may import it.
 */
import { Decimal } from "decimal.js";
import { formatApiNum } from "../utils";
import type { BitunixOrderPayload } from "../../types/bitunix";
import type { OrderRequestPayload } from "../../types/orderSchemas";
import { ORDER_ERRORS, cleanPayload } from "../server/venues/orderErrors";

/** The shape `modifyBitunixOrder` accepts (FEAT-0065). */
export interface BitunixModifyData {
  orderId?: string;
  clientId?: string;
  symbol?: string;
  qty?: string;
  price?: string;
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  tpOrderPrice?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  slOrderPrice?: string;
}

/**
 * Maps a validated `place-order` request onto the venue payload.
 *
 * The key order is the signature input order — do not reorder, do not spread
 * an object into it. `effect` is documented as required for LIMIT and
 * meaningless otherwise, so a market order sends none rather than a value the
 * exchange ignores (FEAT-0069), and HEDGE-mode closes carry `tradeSide` /
 * `positionId` (BUG-0062).
 */
export function buildBitunixOrderPayload(payload: OrderRequestPayload): BitunixOrderPayload {
  return {
    symbol: payload.symbol,
    side: payload.side,
    orderType: payload.orderType,
    qty: payload.qty,
    price: payload.price,
    reduceOnly: Boolean(payload.reduceOnly),
    triggerPrice: payload.triggerPrice || payload.stopPrice,
    tradeSide: payload.tradeSide,
    positionId: payload.positionId,
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
}

/**
 * Validates and formats a place-order payload into the exact object the
 * exchange signs.
 *
 * `formatApiNum` is what keeps a low-priced asset from being serialised as
 * `"1e-7"`, which the exchange rejects — every price-like field goes through
 * it, not just the top-level `price`. Throws `ORDER_ERRORS` codes rather than
 * messages, because the caller maps them to a locale.
 */
export function buildBitunixPlaceOrderBody(orderData: BitunixOrderPayload): Record<string, unknown> {
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
  // as every other price.
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

  return cleanPayload(payload);
}

/** Validates and formats a modify-order request into the signed object. */
export function buildBitunixModifyOrderBody(
  modifyData: BitunixModifyData,
): Record<string, unknown> {
  return cleanPayload({
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
  });
}
