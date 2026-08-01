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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "decimal.js";

/**
 * Roadmap item 17, and the promise ADR-0001 makes: **no core function may
 * depend on the chat server.** The calculator, the journal and risk management
 * must work with the network down.
 *
 * This test makes the chat server not merely slow but broken — the connection
 * builder throws — and then exercises the risk engine against the published
 * example. If a future change lets a cloud failure propagate, this fails.
 */

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./logger", () => ({ logger: mockLogger }));

// The SpacetimeDB connection cannot be established at all.
vi.mock("../lib/spacetimedb", () => ({
  DbConnection: {
    builder: () => {
      throw new Error("ECONNREFUSED: chat server unreachable");
    },
  },
  tables: {},
  reducers: {},
}));

vi.mock("../lib/spacetimedb/global_message_type", () => ({ default: {} }));

import { cloudService } from "./cloudService";
import { calculator } from "../lib/calculator";
import { CONSTANTS } from "../lib/constants";

describe("core functions when the chat server is unreachable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cloudService as unknown as { connected: boolean }).connected = false;
    (cloudService as unknown as { lastError: string | null }).lastError = null;
  });

  it("connect() reports the failure instead of throwing it at the caller", async () => {
    // A rejected promise here would surface as an unhandled rejection in any
    // caller that does not wrap it — the settings tab does, but nothing else
    // should have to.
    await expect(
      cloudService.connect("http://127.0.0.1:3000", "cachy-server", "token"),
    ).resolves.toBeUndefined();

    const status = cloudService.status();
    expect(status.connected).toBe(false);
    expect(status.lastError).toContain("ECONNREFUSED");
  });

  it("sendMessage() while disconnected is a no-op, not a throw", () => {
    expect(() => cloudService.sendMessage("hello")).not.toThrow();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "network",
      "Cannot send message: Not connected",
    );
  });

  it("the risk engine still produces the documented result", async () => {
    await cloudService
      .connect("http://127.0.0.1:3000", "cachy-server", "token")
      .catch(() => {});

    // The worked example from the whitepaper: $10,000 account, 1% risk,
    // entry $50,000, stop $49,000. Same inputs as whitepaper-claims.test.ts.
    const result = calculator.calculateBaseMetrics(
      {
        accountSize: new Decimal(10000),
        riskPercentage: new Decimal(1),
        entryPrice: new Decimal(50000),
        stopLossPrice: new Decimal(49000),
        leverage: new Decimal(10),
        fees: new Decimal(0),
        symbol: "BTCUSDT",
        useAtrSl: false,
        atrValue: new Decimal(0),
        atrMultiplier: new Decimal(0),
        targets: [],
        totalPercentSold: new Decimal(0),
      } as never,
      CONSTANTS.TRADE_TYPE_LONG,
    );

    expect(result).not.toBeNull();
    expect(result!.positionSize.toNumber()).toBe(0.1);
    expect(result!.riskAmount.toNumber()).toBe(100);
    expect(result!.positionSize.times(50000).toNumber()).toBe(5000);
  });

  it("journal statistics still compute", async () => {
    await cloudService
      .connect("http://127.0.0.1:3000", "cachy-server", "token")
      .catch(() => {});

    const stats = calculator.calculateJournalStats([]);

    expect(stats).toBeDefined();
    expect(cloudService.status().connected).toBe(false);
  });
});
