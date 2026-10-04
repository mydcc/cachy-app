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
 * Validates and formats a place-order payload into the exact object the
 * exchange signs.
 *
 * Key order is the signature input order — do not reorder, do not spread an
 * object into it. `size` and a LIMIT `price` go through `formatApiNum` for
 * the same reason as the Bitunix path: without it a low-priced level
 * serialises as `"1e-7"`, which the exchange rejects. Throws `ORDER_ERRORS`
 * codes rather than messages, because the caller maps them to a locale.
 *
 * UTA shape (BUG-0597): `side` carries direction only; open-versus-close in
 * hedge mode rides on `posSide`, in one-way mode on `reduceOnly`. There is no
 * `tradeSide` request field — the venue computes it for the response. Every
 * refusal below is a refused order, never a wrong one: a body this function
 * rejects cannot fill, and a body it emits states its intent completely, so
 * the venue has nothing left to assume.
 */
export function buildBitgetPlaceOrderBody(
  order: BitgetOrderPayload & { marginCoin?: string },
): Record<string, unknown> {
  const safeSize = formatApiNum(order.size);
  if (!safeSize || new Decimal(safeSize).lte(0))
    throw new Error(ORDER_ERRORS.INVALID_QTY);

  const orderType = String(order.orderType).toLowerCase();
  if (orderType !== "limit" && orderType !== "market")
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);

  const side = String(order.side).toLowerCase();
  if (side !== "buy" && side !== "sell")
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);

  let price: string | undefined;
  if (orderType === "limit") {
    const safePrice = formatApiNum(order.price);
    if (!safePrice || new Decimal(safePrice).lte(0))
      throw new Error(ORDER_ERRORS.INVALID_PRICE);
    price = safePrice;
  }

  // Hedge-only vs one-way-only: the venue documents `posSide` as required in
  // hedge-mode positions and `reduceOnly` as applicable in one-way mode only.
  // Both at once is a contradiction no account mode accepts, so it throws
  // here rather than travelling as a request the venue resolves by guessing.
  const posSide =
    order.posSide === undefined
      ? undefined
      : String(order.posSide).toLowerCase();
  if (posSide !== undefined && !["long", "short"].includes(posSide)) {
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
  const reduceOnly = Boolean(order.reduceOnly);
  if (posSide !== undefined && reduceOnly)
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);

  // Required, never defaulted: an omitted `marginMode` opens cross-margin,
  // and Cachy does not choose a trader's margin mode by omission. Accepts the
  // shared `normalizeMarginMode` spellings (`cross`, `isolation`) alongside
  // the venue's own (`crossed`, `isolated`) — the tradeService helper feeds
  // the former, so rejecting it would refuse every isolated-margin order.
  const marginMode = String(order.marginMode ?? "").toLowerCase();
  const venueMarginMode =
    marginMode === "crossed" || marginMode === "cross"
      ? "crossed"
      : marginMode === "isolated" || marginMode === "isolation"
        ? "isolated"
        : null;
  if (!venueMarginMode) throw new Error(ORDER_ERRORS.VALIDATION_ERROR);

  // `clientOid` is venue metadata, not money: a non-compliant value is
  // dropped (traceability then comes from the response `orderId`) rather
  // than rejecting the order over it.
  const clientOid =
    typeof order.clientOid === "string" &&
    /^[.A-Z:/a-z0-9_-]{1,32}$/.test(order.clientOid)
      ? order.clientOid
      : undefined;

  return cleanPayload({
    category: "USDT-FUTURES",
    symbol: order.symbol,
    side,
    orderType,
    qty: safeSize,
    price,
    timeInForce:
      orderType === "market" ? undefined : mapTimeInForce(order.force),
    posSide,
    marginMode: venueMarginMode,
    reduceOnly: reduceOnly ? "yes" : undefined,
    clientOid,
    ...buildPresetLeg(
      {
        price: order.tpPrice,
        stopType: order.tpStopType,
        orderType: order.tpOrderType,
        orderPrice: order.tpOrderPrice,
      },
      "takeProfit",
      "tpTriggerBy",
      "tpOrderType",
      "tpLimitPrice",
    ),
    ...buildPresetLeg(
      {
        price: order.slPrice,
        stopType: order.slStopType,
        orderType: order.slOrderType,
        orderPrice: order.slOrderPrice,
      },
      "stopLoss",
      "slTriggerBy",
      "slOrderType",
      "slLimitPrice",
    ),
  });
}

/**
 * Maps one preset leg (TP or SL) onto its UTA wire keys, in wire order.
 *
 * An absent leg maps to nothing. A leg with a trigger price but no trigger
 * spelling relies on the venue's documented `market` default. A leg with a
 * trigger price but no order type sends the trigger alone — what executes
 * at the trigger then is venue behaviour Phase G verifies live, which is
 * why the gate keeps this wiring unreachable until then. Everything else
 * contradictory is refused: sub-fields without their trigger price, a
 * LIMIT leg without its limit price, a MARKET leg carrying one, and unknown
 * spellings. Each refusal is a refused order, never a silently
 * downgraded one.
 */
function buildPresetLeg(
  leg: {
    price?: string;
    stopType?: string;
    orderType?: string;
    orderPrice?: string;
  },
  takeKey: string,
  triggerByKey: string,
  orderTypeKey: string,
  limitPriceKey: string,
): Record<string, unknown> {
  if (
    leg.price === undefined &&
    leg.stopType === undefined &&
    leg.orderType === undefined &&
    leg.orderPrice === undefined
  ) {
    return {};
  }
  if (leg.price === undefined)
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);

  const take = formatApiNum(leg.price);
  if (!take || new Decimal(take).lte(0))
    throw new Error(ORDER_ERRORS.INVALID_PRICE);

  let triggerBy: string | undefined;
  if (leg.stopType !== undefined) {
    const stopType = String(leg.stopType).toUpperCase();
    if (stopType === "MARK_PRICE") triggerBy = "mark";
    else if (stopType === "LAST_PRICE") triggerBy = "market";
    else throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }

  let type: string | undefined;
  let limitPrice: string | undefined;
  if (leg.orderType !== undefined) {
    const presetOrderType = String(leg.orderType).toUpperCase();
    if (presetOrderType === "LIMIT") {
      if (leg.orderPrice === undefined)
        throw new Error(ORDER_ERRORS.INVALID_PRICE);
      const safe = formatApiNum(leg.orderPrice);
      if (!safe || new Decimal(safe).lte(0))
        throw new Error(ORDER_ERRORS.INVALID_PRICE);
      type = "limit";
      limitPrice = safe;
    } else if (presetOrderType === "MARKET") {
      if (leg.orderPrice !== undefined)
        throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
      type = "market";
    } else {
      throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
    }
  } else if (leg.orderPrice !== undefined) {
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }

  return {
    [takeKey]: take,
    [triggerByKey]: triggerBy,
    [orderTypeKey]: type,
    [limitPriceKey]: limitPrice,
  };
}

/**
 * Maps a Cachy time-in-force to the UTA spelling. Limit orders state theirs
 * explicitly rather than relying on the venue's gtc default.
 */
function mapTimeInForce(force: string | undefined): string {
  switch (String(force ?? "").toLowerCase()) {
    case "ioc":
      return "ioc";
    case "fok":
      return "fok";
    case "post_only":
      return "post_only";
    case "gtc":
    case "":
    case "normal":
      return "gtc";
    default:
      throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
}

/**
 * Preset TP/SL fields with a verified UTA place-order mapping (BUG-0597
 * Phase F): `tpPrice` → `takeProfit`, `slPrice` → `stopLoss`, the stop
 * types onto `tpTriggerBy` / `slTriggerBy` (`MARK_PRICE` → `mark`,
 * `LAST_PRICE` → `market`), the order types verbatim, and the order prices
 * onto `tpLimitPrice` / `slLimitPrice`. Carried by `buildBitgetOrderPayload`
 * and mapped by `buildBitgetPlaceOrderBody`, which validates them — a LIMIT
 * preset without its limit price, a MARKET preset carrying one, or an
 * orphaned sub-field without its trigger price is a refused order, never a
 * silently downgraded one.
 *
 * Modify keeps refusing every field below: UTA `modify-order` takes
 * qty and/or price only, so a preset travelling there has no venue param
 * to land on.
 */
export const BITGET_PRESET_PROTECTION_FIELDS = [
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
 * Protection-relevant `place-order` fields with no UTA mapping at all.
 * `triggerPrice` / `stopPrice` trigger an entry, and UTA place-order takes
 * `limit` | `market` only — so they are refused with `VALIDATION_ERROR`
 * instead of travelling as a request the venue resolves by guessing.
 * (`effect`, `clientId` and `positionId` stay unmapped as before: `force`
 * defaults to `"normal"` and the latter two are Bitunix-HEDGE-only.)
 */
export const BITGET_UNSUPPORTED_PROTECTION_FIELDS = [
  "triggerPrice",
  "stopPrice",
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
    if (payload[field] !== undefined)
      throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
  return {
    symbol: payload.symbol,
    side: payload.side.toLowerCase(),
    orderType: payload.orderType.toLowerCase(),
    size: payload.qty,
    price: payload.price,
    // Effect travels as the UTA time-in-force spelling; absent means gtc,
    // resolved in the body builder rather than here.
    force: (payload.effect ?? "GTC").toLowerCase(),
    reduceOnly: Boolean(payload.reduceOnly),
    marginCoin: payload.marginCoin,
    clientOid: payload.clientId,
    // Hedge position side and margin mode ride the payload from the caller
    // (tradeService resolves both); the body builder validates them.
    posSide: payload.posSide?.toLowerCase(),
    marginMode: payload.marginMode,
    // Preset protection rides the payload for the place body to map (Phase
    // F); entry-trigger prices have no UTA mapping and stay refused above.
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
 * place-order produces. `amount` arrives already formatted by the caller, in
 * the same way `buildBitunixClosePositionPayload` takes a formatted `qty`.
 *
 * `posSide` is required (compile-time, not validated): without it a hedge
 * close is an open with the wrong sign, so a close that does not name its
 * side does not compile. One-way closes travel a different path
 * (`place-order` + `reduceOnly`, which the body builder maps); `reduceOnly`
 * is one-way-only on UTA and is never sent here.
 */
export function buildBitgetClosePositionPayload(order: {
  symbol: string;
  side: string;
  amount: string;
  marginCoin?: string;
  posSide: string;
  marginMode?: string;
}): BitgetOrderPayload & { marginCoin?: string } {
  return {
    symbol: order.symbol,
    side: order.side.toLowerCase(),
    orderType: "market",
    size: order.amount,
    force: "GTC",
    reduceOnly: false,
    marginCoin: order.marginCoin,
    posSide: order.posSide,
    marginMode: order.marginMode,
  };
}

/**
 * The UTA cancel body. The venue takes exactly one identifier (`orderId` or
 * `clientOid`, orderId winning if both arrive) plus `category` — no symbol,
 * no margin coin. Cachy cancels by `orderId` (the route schema requires it),
 * so the builder sends only that and the venue's priority rule never triggers.
 *
 * BUG-0597 Phase B: money-neutral direction — a cancel can refuse or
 * mis-target, but it can never open a position.
 */
export function buildBitgetCancelOrderBody(payload: {
  symbol: string;
  orderId: string;
  marginCoin?: string;
}): Record<string, unknown> {
  // symbol/marginCoin are route-level fields Cachy still requires, but UTA
  // cancel takes neither — they are intentionally not sent, not forgotten.
  // Likewise the category is USDT-FUTURES only: Cachy cancels USDT-M perps
  // and nothing else, so a single literal is correct until that changes.
  return {
    orderId: payload.orderId,
    category: "USDT-FUTURES",
  };
}

/**
 * The UTA modify body. Identity is orderId and/or clientOid (the venue lets
 * orderId win when both arrive, so both travel when both are known); the
 * change itself is qty and/or price, at least one required. `symbol` is
 * required by the venue and refused when absent — a modify that does not
 * name its market has no business travelling.
 *
 * `autoCancel` is never sent: `yes` cancels the original when modify fails,
 * a destructive default Cachy does not opt into. The venue default (`no`)
 * applies. Protection fields stay refused — Phase F wired their format for
 * place-order only, and UTA `modify-order` takes qty and/or price, so a
 * preset travelling here has no venue param to land on. The refusal travels
 * as the `bitunixErrors.VALIDATION_ERROR` key, translated at the call site
 * like the place path — a trader who cannot modify a protected order sees a
 * typed refusal, not a raw error.
 */
export function buildBitgetModifyOrderBody(payload: {
  orderId?: string;
  clientOid?: string;
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
}): Record<string, unknown> {
  if (!payload.orderId && !payload.clientOid)
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  if (!payload.symbol) throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  if (payload.qty === undefined && payload.price === undefined) {
    throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
  }
  for (const field of [
    ...BITGET_UNSUPPORTED_PROTECTION_FIELDS,
    ...BITGET_PRESET_PROTECTION_FIELDS,
  ]) {
    if ((payload as Record<string, unknown>)[field] !== undefined) {
      throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
    }
  }

  let qty: string | undefined;
  if (payload.qty !== undefined) {
    const safeQty = formatApiNum(payload.qty);
    if (!safeQty || new Decimal(safeQty).lte(0))
      throw new Error(ORDER_ERRORS.INVALID_QTY);
    qty = safeQty;
  }

  let price: string | undefined;
  if (payload.price !== undefined) {
    const safePrice = formatApiNum(payload.price);
    if (!safePrice || new Decimal(safePrice).lte(0))
      throw new Error(ORDER_ERRORS.INVALID_PRICE);
    price = safePrice;
  }

  return cleanPayload({
    orderId: payload.orderId,
    clientOid: payload.clientOid,
    symbol: payload.symbol,
    category: "USDT-FUTURES",
    qty,
    price,
  });
}
