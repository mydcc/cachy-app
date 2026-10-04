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
 * BUG-0596 — the Bitget signed reads on UTA (`/api/v3/*`).
 *
 * What is pinned against a live venue, and what is not:
 *
 * - Envelopes, paths and empty-account shapes were observed live on 2026-10-03
 *   against `api.bitget.com` from a UTA account (`docs/bitget-api/14_uta_v3.md`):
 *   `data: {list, cursor}` on both order endpoints, `data: {list}` with no
 *   cursor and `list: null` on positions, a bare object on account/assets, and
 *   an intermittent 200-with-empty-body on current-position.
 * - Populated entries are transcribed from the vendor's documented samples
 *   (same file, "Documented" rows), because the account under test is empty
 *   and holds no position and no order. Field *names* come from those samples;
 *   no semantic beyond the name is asserted that the docs do not state.
 *
 * A test that only reads the signing-plan table would stay green while the
 * literals in `venues/bitget.ts` pointed at V1 — so every case below drives
 * the real venue module with a stubbed fetch and asserts on the parsed
 * result, not on the URL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bitgetVenue } from "./bitget";
import type { PresignedEnvelope } from "../presignedEnvelope";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** A minimal envelope: the venue never inspects these in these cases. */
const envelope: PresignedEnvelope = {
  apiKey: "test-key",
  signature: "test-signature",
  timestamp: "1791034226097",
  query: "category=USDT-FUTURES",
  passphrase: "test-passphrase",
};

function ok(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body) };
}

function requestedUrl(call = 0): URL {
  return new URL(fetchMock.mock.calls[call][0] as string);
}

// Live bytes, empty UTA account, 2026-10-03. Nothing secret in them: no keys,
// no balances, only the envelope the venue actually sends.
const EMPTY_LIST = (requestTime: number) => ({
  code: "00000",
  msg: "success",
  requestTime,
  data: { list: [], cursor: null },
});

// Vendor-documented samples (`docs/bitget-api/14_uta_v3.md`). Field names are
// the venue's; the values are the docs', and the tests assert mapping, not
// economics — no test here claims what a field *means* beyond its name.
const UTA_POSITION = {
  category: "USDT-FUTURES",
  symbol: "BTCUSDT",
  marginCoin: "USDT",
  holdMode: "hedge_mode",
  posSide: "long",
  marginMode: "crossed",
  positionBalance: "4701531.84941582",
  available: "119.2068",
  frozen: "0",
  total: "119.2068",
  leverage: "3",
  avgPrice: "108674",
  markPrice: "118097",
  liquidationPrice: "43099.9",
  unrealisedPnl: "1124573.04243999",
  createdTime: "1736378720620",
  updatedTime: "1753102803148",
};

const UTA_ORDER_LIVE = {
  orderId: "111111111111111111",
  clientOid: "111111111111111111",
  category: "USDT-FUTURES",
  symbol: "BTCUSDT",
  orderType: "limit",
  side: "buy",
  price: "45000",
  qty: "0.01",
  cumExecQty: "0",
  cumExecValue: "0",
  avgPrice: "0",
  orderStatus: "live",
  posSide: "long",
  holdMode: "hedge_mode",
  marginMode: "crossed",
  feeDetail: [],
  createdTime: "1730181468493",
  updatedTime: "1730181468493",
};

const UTA_ORDER_FILLED = {
  ...UTA_ORDER_LIVE,
  side: "sell",
  price: "49534.4",
  qty: "0.429",
  cumExecQty: "0.429",
  cumExecValue: "21250.2929",
  avgPrice: "49534.4",
  orderStatus: "filled",
  feeDetail: [{ feeCoin: "USDT", fee: "4.2500586" }],
};

const UTA_ASSETS = {
  accountEquity: "11.13919278",
  usdtEquity: "11.13921165",
  btcEquity: "0.00011256",
  unrealisedPnl: "0",
  effEquity: "6.19299777",
  mmr: "0",
  imr: "0",
  assets: [
    {
      coin: "USDT",
      equity: "6.19300826",
      balance: "6.19300826",
      available: "6.19300826",
      locked: "0",
    },
  ],
};

describe("Bitget signed reads on UTA (BUG-0596)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe("positions", () => {
    it("asks the UTA position endpoint, not a Classic path", async () => {
      fetchMock.mockResolvedValue(ok({ code: "00000", data: { list: null } }));

      await bitgetVenue.fetchPositions(envelope);

      expect(requestedUrl().pathname).toBe("/api/v3/position/current-position");
    });

    it("reads an empty account as no positions, not an error", async () => {
      // Live shape: `list` is `null`, and the endpoint carries no cursor.
      fetchMock.mockResolvedValue(ok({ code: "00000", data: { list: null } }));

      await expect(bitgetVenue.fetchPositions(envelope)).resolves.toEqual([]);
    });

    it("reads a 200 with an empty body as no positions", async () => {
      // Observed twice on an unchanged empty account (`14_uta_v3.md` trap 3):
      // HTTP 200, zero bytes. A parser that treats unparseable as failure
      // turns a venue quirk into a broken panel.
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => "" });

      await expect(bitgetVenue.fetchPositions(envelope)).resolves.toEqual([]);
    });

    it("maps the UTA position fields and carries the hold mode", async () => {
      fetchMock.mockResolvedValue(ok({ code: "00000", data: { list: [UTA_POSITION] } }));

      const [position] = await bitgetVenue.fetchPositions(envelope);

      expect(position.symbol).toBe("BTCUSDT");
      expect(position.side).toBe("LONG");
      expect(position.size).toBe("119.2068");
      expect(position.entryPrice).toBe("108674");
      expect(position.markPrice).toBe("118097");
      expect(position.liquidationPrice).toBe("43099.9");
      expect(position.unrealizedPnL).toBe("1124573.04243999");
      expect(position.leverage).toBe("3");
      // UTA says `crossed`; Cachy canonical is `cross`.
      expect(position.marginMode).toBe("cross");
      // What BUG-0597 reads to choose its request shape.
      expect(position.holdMode).toBe("hedge_mode");
    });
  });

  describe("account and balance", () => {
    it("asks the UTA assets endpoint for both routes", async () => {
      fetchMock.mockResolvedValue(ok({ code: "00000", data: UTA_ASSETS }));

      await bitgetVenue.fetchAccount(envelope);

      expect(requestedUrl().pathname).toBe("/api/v3/account/assets");
    });

    it("maps equity, margin availability and PnL off the documented fields", async () => {
      fetchMock.mockResolvedValue(ok({ code: "00000", data: UTA_ASSETS }));

      const account = await bitgetVenue.fetchAccount(envelope);

      expect(account.equity).toBe("11.13919278");
      // `effEquity` is the documented net value available for margin.
      expect(account.available).toBe("6.19299777");
      expect(account.totalUnrealizedPnL).toBe("0");
    });

    it("balance reads equity, the total including unrealised PnL", async () => {
      fetchMock.mockResolvedValue(ok({ code: "00000", data: UTA_ASSETS }));

      await expect(bitgetVenue.fetchBalance(envelope)).resolves.toBe("11.13919278");
    });
  });

  describe("orders", () => {
    it("asks the UTA order endpoints, not Classic paths", async () => {
      fetchMock.mockResolvedValue(ok(EMPTY_LIST(1791031742023)));

      await bitgetVenue.executeOrder(
        envelope,
        { exchange: "bitget", type: "pending" } as never,
        "",
      );

      expect(requestedUrl().pathname).toBe("/api/v3/trade/unfilled-orders");
    });

    it("reads an empty pending list as no orders", async () => {
      fetchMock.mockResolvedValue(ok(EMPTY_LIST(1791031742023)));

      const result = await bitgetVenue.executeOrder(
        envelope,
        { exchange: "bitget", type: "pending" } as never,
        "",
      );

      expect(result).toEqual({ orders: [] });
    });

    it("maps a live order with zero fill off the UTA fields", async () => {
      fetchMock.mockResolvedValue(
        ok({ code: "00000", data: { list: [UTA_ORDER_LIVE], cursor: null } }),
      );

      const result = (await bitgetVenue.executeOrder(
        envelope,
        { exchange: "bitget", type: "pending" } as never,
        "",
      )) as { orders: Array<{ filled: string; status: string }> };

      expect(result.orders).toHaveLength(1);
      // `cumExecQty`, not the `filledQty` of no generation (BUG-0589).
      expect(result.orders[0].filled).toBe("0");
      expect(result.orders[0].status).toBe("live");
    });

    it("maps a filled order's cumulative fill, not a per-fill field", async () => {
      fetchMock.mockResolvedValue(
        ok({ code: "00000", data: { list: [UTA_ORDER_FILLED], cursor: "123" } }),
      );

      const result = (await bitgetVenue.executeOrder(
        envelope,
        { exchange: "bitget", type: "history", limit: 10 } as never,
        "",
      )) as {
        orders: Array<{ filled: string; status: string; fee: string; clientId: string }>;
      };

      expect(result.orders).toHaveLength(1);
      expect(result.orders[0].filled).toBe("0.429");
      expect(result.orders[0].status).toBe("filled");
      expect(result.orders[0].fee).toBe("4.2500586");
      expect(result.orders[0].clientId).toBe("111111111111111111");
    });

    it("asks the UTA history endpoint for history reads", async () => {
      fetchMock.mockResolvedValue(ok(EMPTY_LIST(1791094965683)));

      await bitgetVenue.executeOrder(
        envelope,
        { exchange: "bitget", type: "history", limit: 10 } as never,
        "",
      );

      expect(requestedUrl().pathname).toBe("/api/v3/trade/history-orders");
    });
  });
});