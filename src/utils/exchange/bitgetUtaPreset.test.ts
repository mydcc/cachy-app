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
 * BUG-0597 Phase F — the UTA place-order preset TP/SL wiring.
 *
 * UTA place-order takes preset protection as `takeProfit` + `stopLoss`
 * (trigger prices) with `tpTriggerBy` / `slTriggerBy` (`mark` | `market`),
 * `tpOrderType` / `slOrderType` (`limit` | `market`) and `tpLimitPrice` /
 * `slLimitPrice` (limit only) — transcribed, not observed
 * (`docs/bitget-api/15_uta_writes.md`). Every case below pins the exact wire
 * shape, because a preset the venue silently drops leaves the position
 * unprotected from its first tick (BUG-0503).
 *
 * Deliberately not flipped: `bitgetCapabilities.tpSlAtEntry` stays `false`
 * and the gate keeps refusing entries that carry a stop, so this wiring is
 * reachable only in tests until G-Live verifies the shape against a real
 * position. Test before flip, as the item demands.
 *
 * Fail-closed rules (a throw here is a refused order, never a wrong one):
 * - a preset sub-field without its trigger price is contradictory input
 * - LIMIT without its limit price
 * - MARKET with a limit price (silent downgrade to market, refused instead)
 * - `triggerPrice` / `stopPrice` have no UTA place mapping (orderType is
 *   limit|market only) and stay refused
 * - modify takes qty/price only per the UTA page and keeps refusing all ten
 */
import { describe, expect, it } from "vitest";
import {
  buildBitgetModifyOrderBody,
  buildBitgetOrderPayload,
  buildBitgetPlaceOrderBody,
} from "./bitgetBodies";
import { bitgetCapabilities } from "../../services/exchange/bitgetCapabilities";

const BASE = {
  symbol: "BTCUSDT",
  side: "BUY",
  orderType: "LIMIT",
  force: "GTC",
  price: "90000",
  qty: "0.001",
  marginMode: "cross",
  posSide: "LONG",
} as const;

function placeBody(overrides: Record<string, unknown> = {}) {
  const payload = buildBitgetOrderPayload({ ...BASE, ...overrides } as never);
  return buildBitgetPlaceOrderBody(payload) as Record<string, unknown>;
}

describe("Bitget UTA preset TP/SL (BUG-0597 Phase F)", () => {
  it("carries take-profit and stop-loss trigger prices onto the wire", () => {
    const body = placeBody({ tpPrice: "95000", slPrice: "85000" });

    expect(body.takeProfit).toBe("95000");
    expect(body.stopLoss).toBe("85000");
  });

  it("maps MARK_PRICE/LAST_PRICE to the mark/market trigger spellings", () => {
    const body = placeBody({
      tpPrice: "95000",
      tpStopType: "MARK_PRICE",
      slPrice: "85000",
      slStopType: "LAST_PRICE",
    });

    expect(body.tpTriggerBy).toBe("mark");
    expect(body.slTriggerBy).toBe("market");
  });

  it("omits the trigger spelling when none is given (venue defaults to market)", () => {
    const body = placeBody({ tpPrice: "95000", slPrice: "85000" });

    expect(body).not.toHaveProperty("tpTriggerBy");
    expect(body).not.toHaveProperty("slTriggerBy");
  });

  it("maps LIMIT preset order types with their limit prices", () => {
    const body = placeBody({
      tpPrice: "95000",
      tpOrderType: "LIMIT",
      tpOrderPrice: "95100",
      slPrice: "85000",
      slOrderType: "LIMIT",
      slOrderPrice: "84900",
    });

    expect(body.tpOrderType).toBe("limit");
    expect(body.tpLimitPrice).toBe("95100");
    expect(body.slOrderType).toBe("limit");
    expect(body.slLimitPrice).toBe("84900");
  });

  it("refuses a LIMIT preset without its limit price", () => {
    expect(() =>
      placeBody({ tpPrice: "95000", tpOrderType: "LIMIT" }),
    ).toThrow("bitunixErrors.INVALID_PRICE");
    expect(() =>
      placeBody({ slPrice: "85000", slOrderType: "LIMIT" }),
    ).toThrow("bitunixErrors.INVALID_PRICE");
  });

  it("refuses a MARKET preset carrying a limit price instead of downgrading silently", () => {
    expect(() =>
      placeBody({
        tpPrice: "95000",
        tpOrderType: "MARKET",
        tpOrderPrice: "95100",
      }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses orphaned preset sub-fields without their trigger price", () => {
    expect(() => placeBody({ tpOrderType: "LIMIT" })).toThrow(
      "bitunixErrors.VALIDATION_ERROR",
    );
    expect(() => placeBody({ slStopType: "MARK_PRICE" })).toThrow(
      "bitunixErrors.VALIDATION_ERROR",
    );
  });

  it("keeps refusing entry-trigger fields with no UTA place mapping", () => {
    expect(() => placeBody({ triggerPrice: "89000" })).toThrow(
      "bitunixErrors.VALIDATION_ERROR",
    );
    expect(() => placeBody({ stopPrice: "89000" })).toThrow(
      "bitunixErrors.VALIDATION_ERROR",
    );
  });

  it("pins the preset key order for the signature bytes", () => {
    const body = placeBody({
      tpPrice: "95000",
      tpStopType: "MARK_PRICE",
      tpOrderType: "LIMIT",
      tpOrderPrice: "95100",
      slPrice: "85000",
      slStopType: "LAST_PRICE",
      slOrderType: "MARKET",
    });

    expect(Object.keys(body)).toEqual([
      "category",
      "symbol",
      "side",
      "orderType",
      "qty",
      "price",
      "timeInForce",
      "posSide",
      "marginMode",
      "takeProfit",
      "tpTriggerBy",
      "tpOrderType",
      "tpLimitPrice",
      "stopLoss",
      "slTriggerBy",
      "slOrderType",
    ]);
  });

  it("leaves modify refusing every protection field (UTA modify takes qty/price only)", () => {
    expect(() =>
      buildBitgetModifyOrderBody({
        orderId: "123",
        symbol: "BTCUSDT",
        price: "89000",
        tpPrice: "95000",
      } as never),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
    expect(() =>
      buildBitgetModifyOrderBody({
        orderId: "123",
        symbol: "BTCUSDT",
        price: "89000",
        slPrice: "85000",
      } as never),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("keeps the capability closed until live verification flips it", () => {
    // The wiring above is reachable only in tests: the gate still refuses
    // entries that carry a stop while this is false (BUG-0503). G-Live
    // flips it after the shape is observed on a real position, not before.
    expect(bitgetCapabilities.tpSlAtEntry).toBe(false);
  });
});
