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
 * BUG-0597 Phase E — the UTA modify-order body.
 *
 * `POST /api/v3/trade/modify-order` takes orderId and/or clientOid (orderId
 * wins), symbol, category, and qty and/or price — at least one of the two.
 * Money-neutral direction: a modify changes price or size of a resting
 * order; it cannot open a position. The fail-closed rules still apply
 * because a malformed modify is a refused modify, and a refused modify the
 * trader mistakes for an applied one leaves a stale order resting.
 */
import { describe, expect, it } from "vitest";
import { buildBitgetModifyOrderBody } from "./bitgetBodies";

const BASE = {
  orderId: "111111111111111111",
  symbol: "BTCUSDT",
};

describe("Bitget UTA modify-order body (BUG-0597 Phase E)", () => {
  it("modifies price only", () => {
    expect(buildBitgetModifyOrderBody({ ...BASE, price: "89000" })).toEqual({
      orderId: "111111111111111111",
      symbol: "BTCUSDT",
      category: "USDT-FUTURES",
      price: "89000",
    });
  });

  it("modifies quantity only", () => {
    expect(buildBitgetModifyOrderBody({ ...BASE, qty: "0.002" })).toEqual({
      orderId: "111111111111111111",
      symbol: "BTCUSDT",
      category: "USDT-FUTURES",
      qty: "0.002",
    });
  });

  it("modifies both at once", () => {
    const body = buildBitgetModifyOrderBody({
      ...BASE,
      qty: "0.002",
      price: "89000",
    }) as Record<string, unknown>;

    expect(body.qty).toBe("0.002");
    expect(body.price).toBe("89000");
  });

  it("addresses by clientOid when no orderId is given", () => {
    const { orderId: _dropped, ...withoutId } = BASE;
    const body = buildBitgetModifyOrderBody({
      ...withoutId,
      clientOid: "opt-abcdef1234567890abcdef123456",
      price: "89000",
    }) as Record<string, unknown>;

    expect(body.clientOid).toBe("opt-abcdef1234567890abcdef123456");
    expect(body).not.toHaveProperty("orderId");
  });

  it("refuses a modify with neither qty nor price", () => {
    expect(() => buildBitgetModifyOrderBody({ ...BASE })).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a modify with no identifier", () => {
    const { orderId: _dropped, ...withoutId } = BASE;
    expect(() =>
      buildBitgetModifyOrderBody({ ...withoutId, price: "89000" }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a modify with no symbol", () => {
    const { symbol: _dropped, ...withoutSymbol } = BASE;
    expect(() =>
      buildBitgetModifyOrderBody({ ...withoutSymbol, price: "89000" }),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("refuses a non-positive quantity", () => {
    expect(() =>
      buildBitgetModifyOrderBody({ ...BASE, qty: "0", price: "89000" }),
    ).toThrow("bitunixErrors.INVALID_QTY");
  });

  it("refuses protection fields until their format is verified (Phase F)", () => {
    expect(() =>
      buildBitgetModifyOrderBody({ ...BASE, price: "89000", tpPrice: "95000" } as never),
    ).toThrow("bitunixErrors.VALIDATION_ERROR");
  });

  it("never sends autoCancel", () => {
    // autoCancel=yes cancels the original when modify fails — a destructive
    // default Cachy does not opt into. The venue default (no) applies.
    const body = buildBitgetModifyOrderBody({
      ...BASE,
      qty: "0.002",
      price: "89000",
    }) as Record<string, unknown>;

    expect(body).not.toHaveProperty("autoCancel");
  });
});