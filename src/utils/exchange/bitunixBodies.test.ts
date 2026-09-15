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
 * Byte-parity contract for FEAT-0405.
 *
 * The exchange signs `JSON.stringify(body)`, so these tests assert the exact
 * serialised string — not `toEqual` on an object, which would pass on a
 * reordered payload that the exchange rejects. Every expectation below is a
 * wire format, not a preference: changing one changes the signature.
 */
import { describe, it, expect } from "vitest";
import {
  buildBitunixModifyOrderBody,
  buildBitunixOrderPayload,
  buildBitunixPlaceOrderBody,
} from "./bitunixBodies";
import { ORDER_ERRORS, cleanPayload } from "../server/venues/orderErrors";
import type { OrderRequestPayload } from "../../types/orderSchemas";

const asRequest = (value: Record<string, unknown>): OrderRequestPayload =>
  value as unknown as OrderRequestPayload;

describe("cleanPayload", () => {
  it("drops only undefined keys, keeping null, empty string and zero", () => {
    const cleaned = cleanPayload({
      a: undefined,
      b: null,
      c: "",
      d: 0,
      e: false,
    } as Record<string, unknown>);

    expect(Object.keys(cleaned)).toEqual(["b", "c", "d", "e"]);
    expect(cleaned).toEqual({ b: null, c: "", d: 0, e: false });
  });

  it("preserves key insertion order", () => {
    const cleaned = cleanPayload({
      z: 1,
      a: 2,
      m: undefined,
      b: 3,
    } as Record<string, unknown>);

    expect(Object.keys(cleaned)).toEqual(["z", "a", "b"]);
  });
});

describe("buildBitunixOrderPayload", () => {
  it("maps a LIMIT order into the venue payload key order", () => {
    const payload = buildBitunixOrderPayload(
      asRequest({
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "LIMIT",
        qty: "0.5",
        price: "60000",
        reduceOnly: false,
        effect: "GTC",
        clientId: "abc-123",
      }),
    );

    expect(Object.keys(payload)).toEqual([
      "symbol",
      "side",
      "orderType",
      "qty",
      "price",
      "reduceOnly",
      "triggerPrice",
      "tradeSide",
      "positionId",
      "effect",
      "clientId",
      "tpPrice",
      "tpStopType",
      "tpOrderType",
      "tpOrderPrice",
      "slPrice",
      "slStopType",
      "slOrderType",
      "slOrderPrice",
    ]);
  });

  it("omits effect for a MARKET order (FEAT-0069)", () => {
    const payload = buildBitunixOrderPayload(
      asRequest({
        type: "place-order",
        symbol: "BTCUSDT",
        side: "SELL",
        orderType: "MARKET",
        qty: "1",
        reduceOnly: true,
        effect: "GTC",
      }),
    );

    expect(payload.effect).toBeUndefined();
  });

  it("falls back to stopPrice when triggerPrice is absent", () => {
    const payload = buildBitunixOrderPayload(
      asRequest({
        type: "place-order",
        symbol: "BTCUSDT",
        side: "SELL",
        orderType: "MARKET",
        qty: "1",
        stopPrice: "59000",
      }),
    );

    expect(payload.triggerPrice).toBe("59000");
  });
});

describe("buildBitunixPlaceOrderBody", () => {
  it("serialises a LIMIT order to the exact signed bytes", () => {
    const body = buildBitunixPlaceOrderBody(
      buildBitunixOrderPayload(
        asRequest({
          type: "place-order",
          symbol: "BTCUSDT",
          side: "BUY",
          orderType: "LIMIT",
          qty: "0.5",
          price: "60000",
          reduceOnly: false,
          effect: "GTC",
          clientId: "abc-123",
        }),
      ),
    );

    expect(JSON.stringify(body)).toBe(
      '{"symbol":"BTCUSDT","side":"BUY","orderType":"LIMIT","qty":"0.5","price":"60000","reduceOnly":false,"effect":"GTC","clientId":"abc-123"}',
    );
  });

  it("serialises a MARKET order without effect or price", () => {
    const body = buildBitunixPlaceOrderBody(
      buildBitunixOrderPayload(
        asRequest({
          type: "place-order",
          symbol: "BTCUSDT",
          side: "SELL",
          orderType: "MARKET",
          qty: "1",
          reduceOnly: true,
        }),
      ),
    );

    expect(JSON.stringify(body)).toBe(
      '{"symbol":"BTCUSDT","side":"SELL","orderType":"MARKET","qty":"1","reduceOnly":true}',
    );
  });

  it("formats low-priced assets without exponent notation", () => {
    const body = buildBitunixPlaceOrderBody(
      buildBitunixOrderPayload(
        asRequest({
          type: "place-order",
          symbol: "PEPEUSDT",
          side: "BUY",
          orderType: "LIMIT",
          qty: "1000",
          price: "0.000001",
          effect: "GTC",
        }),
      ),
    );

    expect(String(body.price)).not.toContain("e");
    expect(JSON.stringify(body)).toContain('"price":"0.000001"');
  });

  it("rejects a non-positive quantity with the ORDER_ERRORS code", () => {
    expect(() =>
      buildBitunixPlaceOrderBody(
        buildBitunixOrderPayload(
          asRequest({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0",
          }),
        ),
      ),
    ).toThrow(ORDER_ERRORS.INVALID_QTY);
  });

  it("rejects a LIMIT order with no price", () => {
    expect(() =>
      buildBitunixPlaceOrderBody(
        buildBitunixOrderPayload(
          asRequest({
            type: "place-order",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "LIMIT",
            qty: "1",
            effect: "GTC",
          }),
        ),
      ),
    ).toThrow(ORDER_ERRORS.INVALID_PRICE);
  });

  it("rejects a LIMIT take-profit without its order price", () => {
    expect(() =>
      buildBitunixPlaceOrderBody({
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "1",
        tpOrderType: "LIMIT",
      }),
    ).toThrow(ORDER_ERRORS.INVALID_PRICE);
  });
});

describe("buildBitunixModifyOrderBody", () => {
  it("serialises a modify request to the exact signed bytes", () => {
    const body = buildBitunixModifyOrderBody({
      orderId: "42",
      symbol: "BTCUSDT",
      qty: "0.5",
      price: "61000",
    });

    expect(JSON.stringify(body)).toBe(
      '{"orderId":"42","symbol":"BTCUSDT","qty":"0.5","price":"61000"}',
    );
  });

  it("keeps the declared field order when optional levels are present", () => {
    const body = buildBitunixModifyOrderBody({
      orderId: "42",
      symbol: "BTCUSDT",
      qty: "0.5",
      tpPrice: "70000",
      slPrice: "50000",
    });

    expect(Object.keys(body)).toEqual([
      "orderId",
      "symbol",
      "qty",
      "tpPrice",
      "slPrice",
    ]);
  });
});
