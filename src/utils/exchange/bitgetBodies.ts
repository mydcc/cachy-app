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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Bitget REST request-body construction (FEAT-0405).
 *
 * Mirror of `bitunixBodies.ts`, and for the same reason: the exchange signs
 * `JSON.stringify(body)`, so the property insertion order below is part of the
 * wire contract, not a style choice. This module is the single place a Bitget
 * order body is assembled, so the client-side signer (ADR-0013) can produce
 * byte-for-byte the same payload the server forwards upstream.
 *
 * Browser-safe: no `node:*` imports, no server-only SvelteKit modules. Both
 * `src/utils/server/venues/bitget.ts` and the trading client may import it.
 */
import { Decimal } from "decimal.js";
import type { BitgetOrderPayload } from "../../types/bitget";
import type { PlaceOrderPayload } from "../../types/orderSchemas";
import { formatApiNum } from "../utils";
import { ORDER_ERRORS, cleanPayload } from "./orderErrors";

/**
 * Bitget encodes open-versus-close in the side, where Cachy encodes it in
 * `reduceOnly`. An unrecognised side stays `""` rather than guessing a
 * direction — the exchange rejects it, which is the outcome a guess would
 * have hidden.
 */
function bitgetSide(rawSide: string, reduceOnly: boolean): string {
  const side = rawSide.toLowerCase();
  if (reduceOnly) {
    if (side === "buy") return "close_short";
    if (side === "sell") return "close_long";
  } else {
    if (side === "buy") return "open_long";
    if (side === "sell") return "open_short";
  }
  return "";
}

/**
 * Validates and formats a place-order payload into the exact object the
 * exchange signs.
 *
 * Key order is the signature input order — do not reorder, do not spread an
 * object into it. `size` and a LIMIT `price` go through `formatApiNum` for
 * the same reason as the Bitunix path: without it a low-priced level
 * serialises as `"1e-7"`, which the exchange rejects. Throws `ORDER_ERRORS`
 * codes rather than messages, because the caller maps them to a locale.
 */
export function buildBitgetPlaceOrderBody(
  order: BitgetOrderPayload & { marginCoin?: string },
): Record<string, unknown> {
  const safeSize = formatApiNum(order.size);
  if (!safeSize || new Decimal(safeSize).lte(0)) throw new Error(ORDER_ERRORS.INVALID_QTY);

  let price = order.price;
  if (String(order.orderType).toLowerCase() === "limit") {
    const safePrice = formatApiNum(order.price);
    if (!safePrice || new Decimal(safePrice).lte(0)) throw new Error(ORDER_ERRORS.INVALID_PRICE);
    price = safePrice;
  }

  return cleanPayload({
    symbol: order.symbol,
    marginCoin: order.marginCoin || "USDT",
    side: bitgetSide(order.side, Boolean(order.reduceOnly)),
    orderType: order.orderType,
    price,
    size: safeSize,
    timInForceValue: order.force,
  });
}

/**
 * Protection-relevant `place-order` fields Bitget has no verified mapping
 * for. Sending them would drop the trader's stop or TP/SL silently, leaving
 * a position unprotected from its first tick — so they are refused with
 * `VALIDATION_ERROR` instead, the same way an unknown venue/action pair is.
 * (`effect`, `clientId`, `tradeSide` and `positionId` stay unmapped as
 * before: `force` defaults to `"normal"` and the latter two are
 * Bitunix-HEDGE-only.)
 */
const BITGET_UNSUPPORTED_PROTECTION_FIELDS = [
  "triggerPrice",
  "stopPrice",
  "tpPrice",
  "tpStopType",
  "tpOrderType",
  "tpOrderPrice",
  "slPrice",
  "slStopType",
  "slOrderType",
  "slOrderPrice",
] as const;

/**
 * Maps a validated `place-order` request onto the venue payload.
 *
 * The result still holds `undefined` fields. It is an intermediate value, not
 * signable bytes: pass it through `buildBitgetPlaceOrderBody`, which formats
 * and strips them. Signing this object directly would produce a body the
 * exchange rejects.
 */
export function buildBitgetOrderPayload(
  payload: PlaceOrderPayload,
): BitgetOrderPayload & { marginCoin?: string } {
  for (const field of BITGET_UNSUPPORTED_PROTECTION_FIELDS) {
    if (payload[field] !== undefined) throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
  return {
    symbol: payload.symbol,
    side: payload.side.toLowerCase(),
    orderType: payload.orderType.toLowerCase(),
    size: payload.qty,
    price: payload.price,
    force: "normal",
    reduceOnly: Boolean(payload.reduceOnly),
    marginCoin: payload.marginCoin,
  };
}

/**
 * The close-position request, expressed as the same intermediate payload a
 * place-order produces. `reduceOnly` is always `true` — a close that could
 * open is not a close. `amount` arrives already formatted by the caller, in
 * the same way `buildBitunixClosePositionPayload` takes a formatted `qty`.
 */
export function buildBitgetClosePositionPayload(order: {
  symbol: string;
  side: string;
  amount: string;
  marginCoin?: string;
}): BitgetOrderPayload & { marginCoin?: string } {
  return {
    symbol: order.symbol,
    side: order.side.toLowerCase(),
    orderType: "market",
    size: order.amount,
    force: "normal",
    reduceOnly: true,
    marginCoin: order.marginCoin,
  };
}

/**
 * The cancel body. Both venues POST this one, so it is not a transport
 * difference: Bitunix documents `cancel_orders` as a `POST` carrying
 * `{ symbol, orderList }` (`docs/bitunix-api/07_trade.md`) — the same shape
 * family as the Bitget body here, only grouped differently. The Bitunix builder
 * is not written yet, which is the sole reason `buildVenueBody("bitunix", …)`
 * throws for this pair.
 */
export function buildBitgetCancelOrderBody(payload: {
  symbol: string;
  orderId: string;
  marginCoin?: string;
}): Record<string, unknown> {
  return {
    symbol: payload.symbol,
    marginCoin: payload.marginCoin,
    orderId: payload.orderId,
  };
}
