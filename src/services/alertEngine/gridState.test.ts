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

import { describe, expect, it } from "vitest";
import type { GridDocument } from "../../lib/rules/types";
import type { PaperOrder, PaperPosition } from "../../stores/paperTrading.svelte";
import { PAPER_ACCOUNT } from "./botAccount";
import {
  deriveGridState,
  findGridSlotConflict,
  reservedGridSlots,
  type GridBook,
} from "./gridState";
import type { GridRuntimeRecord } from "./gridStore";

function gridDoc(overrides: Partial<GridDocument> = {}): GridDocument {
  return {
    kind: "grid",
    schema_version: 1,
    id: "grid-1",
    name: "Range Grid",
    symbol: "BTCUSDT",
    side: "long",
    evaluation_timeframe: "1h",
    lower_price: "40000",
    upper_price: "50000",
    level_count: 4,
    spacing: "arithmetic",
    sizing: { basis: "quote_budget", amount: "1000" },
    stop_out: [
      {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "lt",
        right: { kind: "constant", value: "38000" },
        timeframe: "1h",
      },
    ],
    consequence_level: "simulate",
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
    ...overrides,
  };
}

function pos(overrides: Partial<PaperPosition> = {}): PaperPosition {
  return {
    positionId: "pos-1",
    symbol: "BTCUSDT",
    side: "long",
    amount: "0.01",
    entryPrice: "42000",
    leverage: "1",
    marginMode: "cross",
    realizedPnl: "0",
    openedAt: 1000,
    ...overrides,
  };
}

function ord(overrides: Partial<PaperOrder> = {}): PaperOrder {
  return {
    orderId: "ord-1",
    symbol: "BTCUSDT",
    side: "BUY",
    orderType: "LIMIT",
    qty: "0.01",
    price: "41000",
    reduceOnly: false,
    tradeSide: "OPEN",
    createdAt: 1000,
    ...overrides,
  };
}

function emptyBook(overrides: Partial<GridBook> = {}): GridBook {
  return {
    executingAccount: PAPER_ACCOUNT,
    positions: [],
    orders: [],
    activeGrids: [],
    ...overrides,
  };
}

describe("gridState (FEAT-0819 stage 4)", () => {
  it("reports account_unavailable while paper trading is off, keeping closed grids closed", () => {
    const grid = gridDoc();
    const book = emptyBook({ executingAccount: null });

    expect(deriveGridState(grid, { status: "active" }, book).status).toBe(
      "account_unavailable",
    );
    expect(deriveGridState(grid, { status: "paused" }, book).status).toBe(
      "account_unavailable",
    );
    expect(deriveGridState(grid, { status: "stopping" }, book).status).toBe(
      "account_unavailable",
    );
    expect(
      deriveGridState(grid, { status: "closed", stopReason: "stop_out" }, book),
    ).toMatchObject({
      status: "closed",
      stopReason: "stop_out",
    });
  });

  it("counts owned opening orders, counter-orders, and position presence accurately", () => {
    const grid = gridDoc({ id: "g1" });
    const book = emptyBook({
      positions: [pos({ origin: "bot", botId: "g1" })],
      orders: [
        ord({ orderId: "o1", origin: "bot", botId: "g1", tradeSide: "OPEN", reduceOnly: false }),
        ord({
          orderId: "o2",
          origin: "bot",
          botId: "g1",
          tradeSide: "CLOSE",
          reduceOnly: true,
        }),
        ord({ orderId: "o3", origin: "bot", botId: "other", tradeSide: "OPEN" }),
      ],
    });

    expect(deriveGridState(grid, { status: "active" }, book)).toEqual({
      status: "active",
      hasPosition: true,
      openOrderCount: 1,
      counterOrderCount: 1,
      stopReason: undefined,
    });
  });

  it("refuses (symbol, side) occupied by manual position, another bot, or another grid", () => {
    const manualConflict = findGridSlotConflict(
      "btcusdt",
      "long",
      "g1",
      emptyBook({ positions: [pos({ symbol: "BTCUSDT", side: "long", origin: "manual" })] }),
    );
    expect(manualConflict).toEqual({ reason: "manual-position" });

    const singleBotConflict = findGridSlotConflict(
      "BTCUSDT",
      "long",
      "g1",
      emptyBook({
        positions: [pos({ symbol: "BTCUSDT", side: "long", origin: "bot", botId: "rule-9" })],
      }),
    );
    expect(singleBotConflict).toEqual({ reason: "bot-position", ownerId: "rule-9" });

    const otherGridConflict = findGridSlotConflict(
      "BTCUSDT",
      "long",
      "g1",
      emptyBook({
        activeGrids: [{ grid: gridDoc({ id: "g2", side: "long" }), status: "paused" }],
      }),
    );
    expect(otherGridConflict).toEqual({ reason: "other-grid", ownerId: "g2" });
  });

  it("allows starting on the opposite side of an occupied symbol", () => {
    const oppositeBook = emptyBook({
      positions: [pos({ symbol: "BTCUSDT", side: "long", origin: "manual" })],
      activeGrids: [{ grid: gridDoc({ id: "g-long", side: "long" }), status: "active" }],
    });

    expect(findGridSlotConflict("BTCUSDT", "short", "g-short", oppositeBook)).toBeNull();
  });

  it("exposes reserved slots for active, paused, or stopping grids and clears closed ones", () => {
    const gActive = gridDoc({ id: "g1", symbol: "BTCUSDT", side: "long" });
    const gPaused = gridDoc({ id: "g2", symbol: "ETHUSDT", side: "short" });
    const gClosed = gridDoc({ id: "g3", symbol: "SOLUSDT", side: "long" });
    const states: Record<string, GridRuntimeRecord> = {
      g1: { status: "active" },
      g2: { status: "paused" },
      g3: { status: "closed", stopReason: "manual" },
    };

    const reserved = reservedGridSlots([gActive, gPaused, gClosed], states, [], []);
    expect(reserved.has("BTCUSDT|long")).toBe(true);
    expect(reserved.has("ETHUSDT|short")).toBe(true);
    expect(reserved.has("SOLUSDT|long")).toBe(false);
  });

  it("excludes TP/SL plan legs from counterOrderCount and flags bookUnreadable as account_unavailable", () => {
    const grid = gridDoc({ id: "g1" });
    const book = emptyBook({
      positions: [pos({ origin: "bot", botId: "g1" })],
      orders: [
        ord({
          orderId: "tp-1",
          planGroupId: "grp-1",
          origin: "bot",
          botId: "g1",
          tradeSide: "CLOSE",
          reduceOnly: true,
        }),
        ord({
          orderId: "c-1",
          origin: "bot",
          botId: "g1",
          tradeSide: "CLOSE",
          reduceOnly: true,
        }),
      ],
    });

    expect(deriveGridState(grid, { status: "active" }, book).counterOrderCount).toBe(1);
    expect(
      deriveGridState(grid, { status: "active" }, { ...book, bookUnreadable: true }).status,
    ).toBe("account_unavailable");
    expect(
      deriveGridState(grid, { status: "closed", stopReason: "manual" }, { ...book, bookUnreadable: true })
        .status,
    ).toBe("closed");
  });

  it("keeps unstarted disabled grids armed without reserving slots and blocks manual opening orders", () => {
    const disabledDraft = gridDoc({ id: "draft-1", enabled: false });
    expect(deriveGridState(disabledDraft, undefined, emptyBook()).status).toBe("armed");
    expect(reservedGridSlots([disabledDraft], {}, [], []).size).toBe(0);

    const manualOrderConflict = findGridSlotConflict(
      "BTCUSDT",
      "long",
      "g1",
      emptyBook({
        orders: [ord({ origin: "manual", side: "BUY", tradeSide: "OPEN", reduceOnly: false })],
      }),
    );
    expect(manualOrderConflict).toEqual({ reason: "manual-order" });
  });
});
