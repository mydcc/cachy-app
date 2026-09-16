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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * A2 byte-parity gate (FEAT-0405 AC4, ADR-0013 failure mode 2).
 *
 * `buildVenueBody` exists so that the client and the server sign the *same*
 * bytes rather than two separately-formatted serialisations of the same
 * object. `signingConformance.test.ts` holds the algorithm to the vendor spec;
 * this file holds the body layer to the two properties that make that useful:
 *
 * 1. **One serialisation.** Signing the shared builder's string and signing the
 *    same payload as an object must produce the same signature. If it does not,
 *    one of the two paths is free to drift, and `assertPresignedConsistency`
 *    would start rejecting every request on the route — a 400 rate, not a
 *    degraded signature.
 * 2. **The builders are the only source.** Each venue/action pair dispatches to
 *    the module that owns that body. A venue fed an action it has no body for
 *    (Bitget account-settings, Bitunix cancel) throws instead of inventing one.
 */
import { describe, expect, it } from "vitest";
import { generateBitgetSignature } from "../server/bitget";
import { generateBitunixSignature } from "../server/bitunix";
import { signBitgetRequest, signBitunixRequest } from "../crypto/exchangeSigning";
import { AccountSettingsRequestSchema } from "../../types/accountSettingsSchemas";
import {
  CancelOrderSchema,
  ClosePositionSchema,
  ModifyOrderSchema,
  PlaceOrderSchema,
  type OrderRequestPayload,
} from "../../types/orderSchemas";
import {
  buildBitunixAccountSettingBody,
  buildBitunixClosePositionPayload,
  buildBitunixModifyOrderBody,
  buildBitunixOrderPayload,
  buildBitunixPlaceOrderBody,
} from "./bitunixBodies";
import { buildBitgetCancelOrderBody } from "./bitgetBodies";
import { buildVenueBody } from "./venueBodies";

const KEYS = { apiKey: "key-0001-abcdef", apiSecret: "secret-0001-abcdef" };
const FIXED = { nonce: "00112233445566778899aabbccddeeff", timestamp: "1700000000000" };

const placeOrder = () =>
  PlaceOrderSchema.parse({
    exchange: "bitunix",
    type: "place-order",
    symbol: "BTCUSDT",
    side: "buy",
    orderType: "LIMIT",
    qty: "0.5",
    price: "60000",
  });

const closePosition = () =>
  ClosePositionSchema.parse({
    exchange: "bitunix",
    type: "close-position",
    symbol: "BTCUSDT",
    side: "sell",
    amount: "0.5",
  });

const modifyOrder = () =>
  ModifyOrderSchema.parse({
    exchange: "bitunix",
    type: "modify-order",
    orderId: "77",
    qty: "0.5",
    price: "61000",
  });

const cancelOrder = () =>
  CancelOrderSchema.parse({
    exchange: "bitget",
    type: "cancel-order",
    symbol: "BTCUSDT",
    orderId: "77",
  });

const accountSetting = (extra: Record<string, unknown>) =>
  AccountSettingsRequestSchema.parse({
    exchange: "bitunix",
    symbol: "BTCUSDT",
    ...extra,
  });

describe("buildVenueBody dispatches to the module that owns the body", () => {
  it("builds the Bitunix place-order body through bitunixBodies", () => {
    const payload = placeOrder();

    expect(buildVenueBody("bitunix", payload)).toBe(
      JSON.stringify(buildBitunixPlaceOrderBody(buildBitunixOrderPayload(payload))),
    );
  });

  it("builds the Bitunix close-position body through bitunixBodies", () => {
    const payload = closePosition();

    expect(buildVenueBody("bitunix", payload)).toBe(
      JSON.stringify(
        buildBitunixPlaceOrderBody(
          buildBitunixClosePositionPayload({
            symbol: payload.symbol,
            side: payload.side,
            qty: payload.amount,
          }),
        ),
      ),
    );
  });

  it("builds the Bitunix modify-order body through bitunixBodies", () => {
    const payload = modifyOrder();

    expect(buildVenueBody("bitunix", payload)).toBe(
      JSON.stringify(buildBitunixModifyOrderBody(payload)),
    );
  });

  it("builds the Bitget place-order body with the venue's own key order", () => {
    expect(buildVenueBody("bitget", placeOrder())).toBe(
      JSON.stringify({
        symbol: "BTCUSDT",
        marginCoin: "USDT",
        side: "open_long",
        orderType: "limit",
        price: "60000",
        size: "0.5",
        timInForceValue: "normal",
      }),
    );
  });

  it("builds the Bitget close body as a reduce-only market order", () => {
    expect(buildVenueBody("bitget", closePosition())).toBe(
      JSON.stringify({
        symbol: "BTCUSDT",
        marginCoin: "USDT",
        side: "close_long",
        orderType: "market",
        size: "0.5",
        timInForceValue: "normal",
      }),
    );
  });

  it("builds the Bitget cancel body, which Bitunix would sign as a query", () => {
    const payload = cancelOrder();

    expect(buildVenueBody("bitget", payload)).toBe(
      JSON.stringify(buildBitgetCancelOrderBody(payload)),
    );
  });

  it("builds every account-settings body through bitunixBodies", () => {
    const payloads = [
      accountSetting({ type: "change-leverage", leverage: 10 }),
      accountSetting({ type: "change-margin-mode", marginMode: "ISOLATION" }),
      accountSetting({ type: "change-position-mode", positionMode: "ONE_WAY" }),
      accountSetting({ type: "adjust-position-margin", amount: "100", side: "LONG" }),
    ];

    for (const payload of payloads) {
      expect(buildVenueBody("bitunix", payload)).toBe(
        JSON.stringify(buildBitunixAccountSettingBody(payload)),
      );
    }
  });

  it("keeps the Bitget order body free of the Cachy-side defaults Bitget never asked for", () => {
    const body = JSON.parse(buildVenueBody("bitget", placeOrder())) as Record<string, unknown>;

    expect(body).not.toHaveProperty("reduceOnly");
    expect(body).not.toHaveProperty("exchange");
  });
});

describe("buildVenueBody refuses a venue/action pair with no body", () => {
  it("refuses Bitget account-settings", () => {
    expect(() =>
      buildVenueBody("bitget", accountSetting({ type: "change-leverage", leverage: 10 })),
    ).toThrow();
  });

  it("refuses Bitunix cancel-order, which the venue signs as a query", () => {
    expect(() => buildVenueBody("bitunix", cancelOrder())).toThrow();
  });

  it("refuses Bitget modify-order, which has no verified request format", () => {
    expect(() => buildVenueBody("bitget", modifyOrder())).toThrow();
  });
});

describe("the client and the server sign the bytes the builder produced", () => {
  const cases: Array<[string, string, OrderRequestPayload | ReturnType<typeof accountSetting>]> = [
    ["bitunix", "/api/v1/futures/trade/place_order", placeOrder()],
    ["bitunix", "/api/v1/futures/trade/place_order", closePosition()],
    ["bitunix", "/api/v1/futures/trade/modify_order", modifyOrder()],
    ["bitunix", "/api/v1/futures/account/change_leverage", accountSetting({ type: "change-leverage", leverage: 10 })],
    [
      "bitunix",
      "/api/v1/futures/account/adjust_position_margin",
      accountSetting({ type: "adjust-position-margin", amount: "100", positionId: "p-1" }),
    ],
    ["bitget", "/api/mix/v1/order/placeOrder", placeOrder()],
    ["bitget", "/api/mix/v1/order/placeOrder", closePosition()],
    ["bitget", "/api/mix/v1/order/cancel-order", cancelOrder()],
  ];

  it.each(cases)(
    "agrees on the %s signature over %s",
    async (venue, path, payload) => {
      const body = buildVenueBody(venue as "bitunix" | "bitget", payload);

      if (venue === "bitunix") {
        const fromString = await signBitunixRequest(KEYS.apiKey, KEYS.apiSecret, {}, body, FIXED);
        const fromObject = await signBitunixRequest(
          KEYS.apiKey,
          KEYS.apiSecret,
          {},
          JSON.parse(body),
          FIXED,
        );

        expect(fromString.bodyStr).toBe(body);
        expect(fromString.signature).toBe(fromObject.signature);
        return;
      }

      const fromString = await signBitgetRequest(KEYS.apiSecret, "POST", path, {}, body, FIXED);
      const fromObject = await signBitgetRequest(
        KEYS.apiSecret,
        "POST",
        path,
        {},
        JSON.parse(body),
        FIXED,
      );

      expect(fromString.bodyStr).toBe(body);
      expect(fromString.signature).toBe(fromObject.signature);
    },
  );

  it("posts the builder's string upstream without re-serialising it", () => {
    const body = buildVenueBody("bitunix", placeOrder());

    expect(generateBitunixSignature(KEYS.apiKey, KEYS.apiSecret, {}, body).bodyStr).toBe(body);
    expect(
      generateBitgetSignature(KEYS.apiSecret, "POST", "/api/mix/v1/order/placeOrder", {}, body)
        .bodyStr,
    ).toBe(body);
  });
});
