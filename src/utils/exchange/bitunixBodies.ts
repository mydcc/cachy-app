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
import type { AccountSettingsPayload } from "../../types/accountSettingsSchemas";
import type { BitunixOrderPayload } from "../../types/bitunix";
import type {
  CancelAllPayload,
  CancelOrderPayload,
  CloseAllPositionsPayload,
  FlashClosePositionPayload,
  PlaceOrderPayload,
} from "../../types/orderSchemas";
import { ORDER_ERRORS, cleanPayload, type ExchangeError } from "./orderErrors";

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
 *
 * The result still holds `undefined` fields. It is an intermediate value, not
 * signable bytes: pass it through `buildBitunixPlaceOrderBody`, which formats
 * and strips them. Signing this object directly would produce a body the
 * exchange rejects.
 */
export function buildBitunixOrderPayload(payload: PlaceOrderPayload): BitunixOrderPayload {
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
 * The close-position request, expressed as the same intermediate payload a
 * place-order produces.
 *
 * Key order matters for the same reason as `buildBitunixOrderPayload`: the
 * place-order body is built by spreading this object, so reordering here
 * reorders the bytes the exchange signs. `reduceOnly` is always `true` — a
 * close that could open is not a close.
 */
export function buildBitunixClosePositionPayload(order: {
  symbol: string;
  side: string;
  qty: string;
}): BitunixOrderPayload {
  return {
    symbol: order.symbol,
    side: order.side,
    orderType: "MARKET",
    qty: order.qty,
    reduceOnly: true,
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

/**
 * Validates and formats a modify-order request into the signed object.
 *
 * Key order is the signature input order — do not reorder. Every price-like
 * field goes through `formatApiNum` for the same reason as
 * `buildBitunixPlaceOrderBody`: without it a low-priced level serialises as
 * `"1e-7"`, which the exchange rejects. There is no order-type context here,
 * so `price` is validated whenever it is present rather than only for LIMIT.
 */
export function buildBitunixModifyOrderBody(
  modifyData: BitunixModifyData,
): Record<string, unknown> {
  const normalized: BitunixModifyData = { ...modifyData };

  if (normalized.qty !== undefined) {
    const safeQty = formatApiNum(normalized.qty);
    if (!safeQty || new Decimal(safeQty).lte(0)) throw new Error(ORDER_ERRORS.INVALID_QTY);
    normalized.qty = safeQty;
  }

  if (normalized.price !== undefined) {
    const safePrice = formatApiNum(normalized.price);
    if (!safePrice || new Decimal(safePrice).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    normalized.price = safePrice;
  }

  for (const field of [
    "tpPrice",
    "tpOrderPrice",
    "slPrice",
    "slOrderPrice",
  ] as const) {
    const raw = normalized[field] as string | number | undefined;
    if (raw === undefined) continue;
    const safe = formatApiNum(raw);
    if (!safe || new Decimal(safe).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    normalized[field] = safe;
  }

  // A LIMIT take-profit or stop needs the price it will be placed at —
  // same rule as the place path, where learning it from a rejection costs a
  // round trip with a position already open behind it.
  if (normalized.tpOrderType === "LIMIT" && normalized.tpOrderPrice === undefined) {
    throw new Error(ORDER_ERRORS.INVALID_PRICE);
  }
  if (normalized.slOrderType === "LIMIT" && normalized.slOrderPrice === undefined) {
    throw new Error(ORDER_ERRORS.INVALID_PRICE);
  }

  return cleanPayload({
    orderId: normalized.orderId,
    clientId: normalized.clientId,
    symbol: normalized.symbol,
    qty: normalized.qty,
    price: normalized.price,
    tpPrice: normalized.tpPrice,
    tpStopType: normalized.tpStopType,
    tpOrderType: normalized.tpOrderType,
    tpOrderPrice: normalized.tpOrderPrice,
    slPrice: normalized.slPrice,
    slStopType: normalized.slStopType,
    slOrderType: normalized.slOrderType,
    slOrderPrice: normalized.slOrderPrice,
  });
}

/**
 * The four order-cancellation and position-closing bodies (FEAT-0405 A5).
 *
 * Key order is the wire contract, as everywhere in this module: `cancel_orders`
 * carries `{ symbol, orderList }` and `flash_close_position` a bare
 * `{ positionId }`, which is what `bitunix.ts` sent before the cutover and
 * therefore what the exchange has been reading all along.
 *
 * The two "all" endpoints take an optional symbol filter, and an absent symbol
 * means "every symbol" — so the empty object is a real request, not a body the
 * builder failed to fill in. A symbol sent as `undefined` would serialise to
 * nothing anyway, but `JSON.stringify` would drop the key on one side and not
 * the other if a caller ever passed `null`; omitting it here keeps the two
 * sides' strings identical by construction.
 */
export function buildBitunixCancelOrderBody(
  payload: CancelOrderPayload,
): Record<string, unknown> {
  return { symbol: payload.symbol, orderList: [{ orderId: payload.orderId }] };
}

export function buildBitunixCancelAllBody(
  payload: CancelAllPayload,
): Record<string, unknown> {
  return payload.symbol ? { symbol: payload.symbol } : {};
}

export function buildBitunixCloseAllPositionsBody(
  payload: CloseAllPositionsPayload,
): Record<string, unknown> {
  return payload.symbol ? { symbol: payload.symbol } : {};
}

export function buildBitunixFlashCloseBody(
  payload: FlashClosePositionPayload,
): Record<string, unknown> {
  return { positionId: payload.positionId };
}

/**
 * The account-settings write family's signed bodies (FEAT-0068).
 *
 * Field names and the `ISOLATION`/`CROSS` and `ONE_WAY`/`HEDGE` spellings are
 * Bitunix's own (docs/bitunix-api/02_account.md) — this module maps nothing,
 * the route validates, and the vehicle here is only the key order the
 * signature covers.
 *
 * `adjust-position-margin` carries the "either side or positionId" rule rather
 * than the Zod union, which cannot hold a refined object, and rather than the
 * venue module, which would be the only side enforcing it: in HEDGE mode an
 * unaddressed request would let the exchange pick a side, moving margin on a
 * position the trader was not looking at.
 */
export function buildBitunixAccountSettingBody(
  payload: AccountSettingsPayload,
): Record<string, unknown> {
  if (payload.type === "change-leverage") {
    return {
      symbol: payload.symbol,
      marginCoin: payload.marginCoin,
      leverage: payload.leverage,
    };
  }
  if (payload.type === "change-margin-mode") {
    return {
      symbol: payload.symbol,
      marginCoin: payload.marginCoin,
      marginMode: payload.marginMode,
    };
  }
  if (payload.type === "change-position-mode") {
    return {
      positionMode: payload.positionMode,
    };
  }
  if (payload.type === "adjust-position-margin") {
    if (!payload.side && !payload.positionId) {
      // Carries `code` as well as the message: the route reads the former to
      // pick the trader-facing string, and it used to be set at the throw site
      // in `adjustBitunixPositionMargin`. Moving the check without the code
      // would have swapped a specific refusal for a generic one.
      const error: ExchangeError = new Error(ORDER_ERRORS.VALIDATION_ERROR);
      error.code = "VALIDATION_ERROR";
      throw error;
    }
    return {
      symbol: payload.symbol,
      marginCoin: payload.marginCoin,
      amount: payload.amount,
      ...(payload.side ? { side: payload.side } : {}),
      ...(payload.positionId ? { positionId: payload.positionId } : {}),
    };
  }
  throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
}
