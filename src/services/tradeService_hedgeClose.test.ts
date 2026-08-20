/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tradeService } from "./tradeService";
import { omsService } from "./omsService";
import { Decimal } from "decimal.js";

// Regression (BUG-0062/BUG-0063): closing a position 500'd with "must not
// be null" for every account, HEDGE or ONE_WAY alike. Root cause: Bitunix's
// place_order docs (docs/bitunix-api/07_trade.md:32/583) list `tradeSide` as
// unconditionally `Required: true`, and `positionId` as required whenever
// `tradeSide = CLOSE` — neither is scoped to HEDGE mode, despite the
// description text ("nur im Hedge-Modus erforderlich") suggesting otherwise.
// BUG-0062 trusted that text and only sent tradeSide/positionId when
// positionMode === "hedge", so ONE_WAY accounts (confirmed live, BUG-0063)
// kept 500ing exactly as before. The fix sends tradeSide="CLOSE" and
// positionId unconditionally, with `side` matching the position's own side
// (not inverted) per the documented request example.

vi.mock("./omsService", () => ({
  omsService: {
    getPositions: vi.fn(),
    updatePosition: vi.fn(),
    addOptimisticOrder: vi.fn(),
    removeOrder: vi.fn(),
    getOrder: vi.fn(),
    updateOrder: vi.fn(),
  },
}));

vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    apiProvider: "bitunix",
    apiKeys: { bitunix: { key: "test", secret: "test" } },
    appAccessToken: "test-token",
    secretsReady: Promise.resolve(),
  },
}));

vi.mock("../stores/market.svelte", async () => {
  const { Decimal } = await import("decimal.js");
  return {
    marketState: { data: { XRPUSDT: { lastPrice: new Decimal(1.05) } } },
  };
});

vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn(), debug: vi.fn() },
}));

describe("TradeService close-order fields (BUG-0062/BUG-0063)", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ code: "0", data: { orderId: "1" } }),
      json: async () => ({ code: "0", data: { orderId: "1" } }),
    } as Response);
  });

  function lastBody(): Record<string, unknown> {
    const calls = fetchSpy.mock.calls;
    const call = calls[calls.length - 1];
    return JSON.parse(call[1]?.body as string);
  }

  describe("closePosition", () => {
    it("sends tradeSide=CLOSE and positionId, with side matching the position (not inverted), in HEDGE mode", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "long",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
          positionId: "662491704776252252",
          positionMode: "hedge",
        },
      ]);

      await tradeService.closePosition({
        symbol: "XRPUSDT",
        positionSide: "long",
        forceFullClose: true,
      });

      const body = lastBody();
      expect(body.side).toBe("BUY");
      expect(body.tradeSide).toBe("CLOSE");
      expect(body.positionId).toBe("662491704776252252");
    });

    it("sends tradeSide=CLOSE and positionId, with side matching the position (not inverted), in ONE_WAY mode too", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "long",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
          positionId: "662491704776252252",
          positionMode: "one_way",
        },
      ]);

      await tradeService.closePosition({
        symbol: "XRPUSDT",
        positionSide: "long",
        forceFullClose: true,
      });

      const body = lastBody();
      expect(body.side).toBe("BUY");
      expect(body.tradeSide).toBe("CLOSE");
      expect(body.positionId).toBe("662491704776252252");
    });

    it("still sends tradeSide=CLOSE when positionMode is unknown, omitting positionId only if truly absent", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "long",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
        },
      ]);

      await tradeService.closePosition({
        symbol: "XRPUSDT",
        positionSide: "long",
        forceFullClose: true,
      });

      const body = lastBody();
      expect(body.side).toBe("BUY");
      expect(body.tradeSide).toBe("CLOSE");
      expect(body.positionId).toBeUndefined();
    });

    it("uses SELL (not BUY) to close a short position", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "short",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
          positionId: "999",
          positionMode: "hedge",
        },
      ]);

      await tradeService.closePosition({
        symbol: "XRPUSDT",
        positionSide: "short",
        forceFullClose: true,
      });

      const body = lastBody();
      expect(body.side).toBe("SELL");
      expect(body.tradeSide).toBe("CLOSE");
    });
  });

  describe("flashClosePosition", () => {
    it("sends native flash-close-position and positionId in HEDGE mode", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "long",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
          positionId: "662491704776252252",
          positionMode: "hedge",
        },
      ]);

      await tradeService.flashClosePosition("XRPUSDT", "long");

      const body = lastBody();
      expect(body.type).toBe("flash-close-position");
      expect(body.symbol).toBe("XRPUSDT");
      expect(body.positionId).toBe("662491704776252252");
    });

    it("sends native flash-close-position and positionId in ONE_WAY mode too", async () => {
      vi.mocked(omsService.getPositions).mockReturnValue([
        {
          symbol: "XRPUSDT",
          side: "long",
          amount: new Decimal(9.1),
          lastUpdated: Date.now(),
          positionId: "662491704776252252",
          positionMode: "one_way",
        },
      ]);

      await tradeService.flashClosePosition("XRPUSDT", "long");

      const body = lastBody();
      expect(body.type).toBe("flash-close-position");
      expect(body.symbol).toBe("XRPUSDT");
      expect(body.positionId).toBe("662491704776252252");
    });
  });
});
