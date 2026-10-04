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
 * BUG-0597 Phases C+D — the UTA place-order body matrix.
 *
 * UTA has no `tradeSide` request field (it exists only in responses, computed
 * by the venue). Direction closes split on `side` + `posSide` in hedge mode
 * and on `reduceOnly` in one-way mode (`docs/bitget-api/15_uta_writes.md`).
 * Every case below pins the exact body bytes, because the failure this guards
 * returns `00000` — a wrong body does not fail, it fills wrong.
 *
 * Fail-closed rules (a throw here is a refused order, never a wrong one):
 * - `posSide` + `reduceOnly` together contradict (hedge-only vs one-way-only)
 * - `posSide` outside long|short
 * - `marginMode` missing or outside crossed|isolated (the venue defaults to
 *   cross when omitted — a default that moves margin is not a default Cachy
 *   takes silently)
 */
import { describe, expect, it } from "vitest";
import { buildBitgetPlaceOrderBody } from "./bitgetBodies";

const BASE = {
  symbol: "BTCUSDT",
  orderType: "limit",
  force: "GTC",
  price: "90000",
  size: "0.001",
  marginMode: "cross",
};

describe("Bitget UTA place-order body (BUG-0597)", () => {
  it("opens long in hedge mode with side buy and posSide long", () => {
    expect(
      buildBitgetPlaceOrderBody({
        ...BASE,
        side: "buy",
        posSide: "long",
      }),
    ).toEqual({
      category: "USDT-FUTURES",
      symbol: "BTCUSDT",
      side: "buy",
      orderType: "limit",
      qty: "0.001",
      price: "90000",
      timeInForce: "gtc",
      posSide: "long",
      marginMode: "crossed",
    });
  });

  it("closes long in hedge mode with side sell and posSide long", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "sell",
      posSide: "long",
    }) as Record<string, unknown>;

    expect(body.side).toBe("sell");
    expect(body.posSide).toBe("long");
    expect(body).not.toHaveProperty("reduceOnly");
  });

  it("closes in one-way mode with reduceOnly and no posSide", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "sell",
      reduceOnly: true,
    }) as Record<string, unknown>;

    expect(body.reduceOnly).toBe("yes");
    expect(body).not.toHaveProperty("posSide");
  });

  it("opens in one-way mode with neither posSide nor reduceOnly", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "buy",
    }) as Record<string, unknown>;

    expect(body.side).toBe("buy");
    expect(body).not.toHaveProperty("posSide");
    expect(body).not.toHaveProperty("reduceOnly");
  });

  it("refuses posSide together with reduceOnly", () => {
    expect(() =>
      buildBitgetPlaceOrderBody({ ...BASE, side: "sell", posSide: "long", reduceOnly: true }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a posSide outside long and short", () => {
    expect(() =>
      buildBitgetPlaceOrderBody({ ...BASE, side: "buy", posSide: "both" }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a missing marginMode instead of letting the venue default", () => {
    const { marginMode: _dropped, ...withoutMode } = BASE;
    expect(() =>
      buildBitgetPlaceOrderBody({ ...withoutMode, side: "buy", posSide: "long" }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a marginMode outside crossed and isolated", () => {
    expect(() =>
      buildBitgetPlaceOrderBody({ ...BASE, side: "buy", posSide: "long", marginMode: "portfolio" }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("accepts the shared normalizeMarginMode spellings end to end", () => {
    // tradeService feeds normalizeMarginMode() output ("cross"/"isolation"),
    // not the venue spellings — the builder must take both, or every
    // isolated-margin order is refused while cross works.
    for (const [input, expected] of [
      ["cross", "crossed"],
      ["crossed", "crossed"],
      ["isolation", "isolated"],
      ["isolated", "isolated"],
    ] as const) {
      const body = buildBitgetPlaceOrderBody({
        ...BASE,
        side: "buy",
        posSide: "long",
        marginMode: input,
      }) as Record<string, unknown>;
      expect(body.marginMode).toBe(expected);
    }
  });

  it("omits price and timeInForce on market orders", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      orderType: "market",
      price: undefined,
      side: "sell",
      posSide: "long",
    }) as Record<string, unknown>;

    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("timeInForce");
  });

  it("passes a compliant clientId through as clientOid", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "buy",
      posSide: "long",
      clientOid: "opt-abcdef1234567890abcdef123456",
    }) as Record<string, unknown>;

    expect(body.clientOid).toBe("opt-abcdef1234567890abcdef123456");
  });

  it("drops a non-compliant clientId instead of sending it", () => {
    // 33 chars — one over the venue's 32. Sending it would reject the whole
    // order over metadata; dropping it keeps traceability via the response.
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "buy",
      posSide: "long",
      clientOid: "x".repeat(33),
    }) as Record<string, unknown>;

    expect(body).not.toHaveProperty("clientOid");
  });

  it("sends none of the V1 fields", () => {
    const body = buildBitgetPlaceOrderBody({
      ...BASE,
      side: "buy",
      posSide: "long",
    }) as Record<string, unknown>;

    for (const v1 of ["size", "timInForceValue", "marginCoin", "productType", "tradeSide"]) {
      expect(body).not.toHaveProperty(v1);
    }
    expect(body.qty).toBe("0.001");
  });

  it("still refuses a non-positive quantity", () => {
    expect(() =>
      buildBitgetPlaceOrderBody({ ...BASE, side: "buy", posSide: "long", size: "0" }),
    ).toThrow("bitunixErrors.INVALID_QTY");
  });
});
