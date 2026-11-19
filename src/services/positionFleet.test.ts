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

import { describe, it, expect } from "vitest";
import { Decimal } from "decimal.js";
import type { OMSPosition } from "./omsTypes";
import {
  aggregateFleet,
  buildFleetRows,
  filterFleetRows,
  ownerFilterOptions,
  sortFleetRows,
  type FleetOwner,
  type FleetSortKey,
} from "./positionFleet";

function pos(over: Partial<OMSPosition> & { symbol: string; positionId?: string }): OMSPosition {
  return {
    side: "long",
    amount: new Decimal("1"),
    entryPrice: new Decimal("100"),
    markPrice: new Decimal("100"),
    unrealizedPnl: new Decimal("0"),
    leverage: new Decimal("5"),
    marginMode: "cross",
    ...over,
  };
}

const owners = new Map<string, FleetOwner>([
  ["p-b1", { botId: "b1", name: "RSI 15m" }],
  ["p-b2", { botId: "b2", name: "Weekly trend" }],
  ["p-b3", { botId: "b3", name: null }],
]);

/** Ten positions, five symbols, three bots plus two manual ones. */
function fleet(): OMSPosition[] {
  return [
    pos({ positionId: "p-b1", symbol: "BTCUSDT", unrealizedPnl: new Decimal("-5"), openedAt: 300 }),
    pos({ positionId: "m-1", symbol: "ETHUSDT", unrealizedPnl: new Decimal("12"), openedAt: 100 }),
    pos({ positionId: "p-b2", symbol: "SOLUSDT", unrealizedPnl: new Decimal("2"), openedAt: 200 }),
    pos({ positionId: "p-b3", symbol: "ADAUSDT", unrealizedPnl: new Decimal("-20"), openedAt: 50 }),
    pos({ positionId: "m-2", symbol: "XRPUSDT", unrealizedPnl: new Decimal("1") }),
  ];
}

describe("FEAT-0824 — fleet rows", () => {
  it("gives every row a unique key even when positionIds repeat or are missing", () => {
    const rows = buildFleetRows([
      pos({ symbol: "BTCUSDT", positionId: "dup" }),
      pos({ symbol: "BTCUSDT", positionId: "dup", side: "short" }),
      pos({ symbol: "ETHUSDT" }),
      pos({ symbol: "ETHUSDT" }),
    ]);
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r.key)).size).toBe(4);
  });

  it("joins the owner by positionId and leaves a manual position without one", () => {
    const rows = buildFleetRows(fleet(), owners);
    const byId = new Map(rows.map((r) => [r.position.positionId, r.owner]));
    expect(byId.get("p-b1")).toEqual({ botId: "b1", name: "RSI 15m" });
    expect(byId.get("m-1")).toBeNull();
  });
});

describe("FEAT-0824 — sorting", () => {
  const ids = (rows: ReturnType<typeof buildFleetRows>) => rows.map((r) => r.position.positionId);

  it("sorts by symbol A→Z", () => {
    const sorted = sortFleetRows(buildFleetRows(fleet(), owners), "symbol");
    expect(sorted.map((r) => r.position.symbol)).toEqual([
      "ADAUSDT", "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT",
    ]);
  });

  it("sorts by owner name, falls back to botId for a deleted bot, manual last", () => {
    const sorted = sortFleetRows(buildFleetRows(fleet(), owners), "owner");
    // b3 has no name → sorts by its id "b3"; names: "RSI 15m", "Weekly trend"
    expect(ids(sorted)).toEqual(["p-b3", "p-b1", "p-b2", "m-1", "m-2"]);
  });

  it("sorts by PnL worst first, so the losing leg is on top", () => {
    const sorted = sortFleetRows(buildFleetRows(fleet(), owners), "pnl");
    expect(ids(sorted)).toEqual(["p-b3", "p-b1", "m-2", "p-b2", "m-1"]);
  });

  it("puts an unpriced leg last under PnL sorting — its number is a placeholder", () => {
    const rows = buildFleetRows(
      [
        pos({ positionId: "u", symbol: "AAA", unrealizedPnl: new Decimal("-999"), unpriced: true }),
        pos({ positionId: "v", symbol: "BBB", unrealizedPnl: new Decimal("5") }),
      ],
    );
    expect(ids(sortFleetRows(rows, "pnl"))).toEqual(["v", "u"]);
  });

  it("sorts by age oldest first; a position with no open time goes last", () => {
    const sorted = sortFleetRows(buildFleetRows(fleet(), owners), "age");
    expect(ids(sorted)).toEqual(["p-b3", "m-1", "p-b2", "p-b1", "m-2"]);
  });

  it("is stable and never mutates its input", () => {
    const rows = buildFleetRows(fleet(), owners);
    const before = rows.map((r) => r.key);
    sortFleetRows(rows, "pnl");
    expect(rows.map((r) => r.key)).toEqual(before);
  });

  it.each(["symbol", "owner", "pnl", "age"] as FleetSortKey[])(
    "%s sort drops and duplicates nothing",
    (key) => {
      const rows = buildFleetRows(fleet(), owners);
      const sorted = sortFleetRows(rows, key);
      expect(sorted.map((r) => r.key).sort()).toEqual(rows.map((r) => r.key).sort());
    },
  );
});

describe("FEAT-0824 — filtering", () => {
  const rows = () => buildFleetRows(fleet(), owners);

  it("all returns every row", () => {
    expect(filterFleetRows(rows(), "all")).toHaveLength(5);
  });

  it("manual returns exactly the rows without an owner", () => {
    expect(filterFleetRows(rows(), "manual").map((r) => r.position.positionId)).toEqual(["m-1", "m-2"]);
  });

  it("bots returns every bot-owned row; bot:<id> one bot's", () => {
    expect(filterFleetRows(rows(), "bots")).toHaveLength(3);
    expect(filterFleetRows(rows(), "bot:b2").map((r) => r.position.positionId)).toEqual(["p-b2"]);
  });

  it("manual and bots partition the book — nothing dropped, nothing doubled", () => {
    const all = rows();
    const keys = [...filterFleetRows(all, "manual"), ...filterFleetRows(all, "bots")].map((r) => r.key).sort();
    expect(keys).toEqual(all.map((r) => r.key).sort());
  });

  it("an unknown filter shows nothing rather than everything", () => {
    expect(filterFleetRows(rows(), "bot:gone")).toEqual([]);
  });
});

describe("FEAT-0824 — aggregates", () => {
  const noStop = () => undefined;

  it("sums PnL exactly under Decimal (0.1 + 0.2 is 0.3, not 0.30000000000000004)", () => {
    const rows = buildFleetRows([
      pos({ positionId: "a", symbol: "A", unrealizedPnl: new Decimal("0.1") }),
      pos({ positionId: "b", symbol: "B", unrealizedPnl: new Decimal("0.2") }),
    ]);
    expect(aggregateFleet(rows, noStop).totalPnl.toString()).toBe("0.3");
  });

  it("leaves an unpriced leg out of the PnL total and counts it", () => {
    const rows = buildFleetRows([
      pos({ positionId: "a", symbol: "A", unrealizedPnl: new Decimal("10") }),
      pos({ positionId: "b", symbol: "B", unrealizedPnl: new Decimal("-999"), unpriced: true }),
    ]);
    const agg = aggregateFleet(rows, noStop);
    expect(agg.totalPnl.toString()).toBe("10");
    expect(agg.unpricedCount).toBe(1);
    expect(agg.count).toBe(2);
  });

  it("exposure is Σ size × mark, falling back to entry when there is no mark", () => {
    const rows = buildFleetRows([
      pos({ positionId: "a", symbol: "A", amount: new Decimal("2"), markPrice: new Decimal("110") }),
      pos({ positionId: "b", symbol: "B", amount: new Decimal("3"), markPrice: undefined, entryPrice: new Decimal("50") }),
    ]);
    expect(aggregateFleet(rows, noStop).exposure.toString()).toBe("370");
  });

  it("open risk is the entry→stop loss of each protected position, per side", () => {
    const rows = buildFleetRows([
      pos({ positionId: "l", symbol: "L", side: "long", amount: new Decimal("2"), entryPrice: new Decimal("100") }),
      pos({ positionId: "s", symbol: "S", side: "short", amount: new Decimal("3"), entryPrice: new Decimal("50") }),
    ]);
    const stops: Record<string, Decimal> = { L: new Decimal("95"), S: new Decimal("52") };
    const agg = aggregateFleet(rows, (p) => stops[p.symbol]);
    // long: (100-95)*2 = 10; short: (52-50)*3 = 6
    expect(agg.openRisk.toString()).toBe("16");
    expect(agg.unprotectedCount).toBe(0);
  });

  it("a stop already past entry (locked-in profit) risks nothing, never a negative number", () => {
    const rows = buildFleetRows([pos({ positionId: "l", symbol: "L", entryPrice: new Decimal("100") })]);
    expect(aggregateFleet(rows, () => new Decimal("105")).openRisk.toString()).toBe("0");
  });

  it("counts a position with no stop as unprotected instead of silently risking zero", () => {
    const rows = buildFleetRows([
      pos({ positionId: "a", symbol: "A" }),
      pos({ positionId: "b", symbol: "B" }),
    ]);
    const agg = aggregateFleet(rows, (p) => (p.symbol === "A" ? new Decimal("90") : undefined));
    expect(agg.unprotectedCount).toBe(1);
    expect(agg.openRisk.toString()).toBe("10");
  });

  it("is order-independent and equals a fresh computation over the same book (reload)", () => {
    const stop = (p: OMSPosition) => new Decimal(p.entryPrice).minus(7);
    const rows = buildFleetRows(fleet(), owners);
    const a = aggregateFleet(rows, stop);
    const b = aggregateFleet(buildFleetRows([...fleet()].reverse(), owners), stop);
    expect(b.totalPnl.equals(a.totalPnl)).toBe(true);
    expect(b.exposure.equals(a.exposure)).toBe(true);
    expect(b.openRisk.equals(a.openRisk)).toBe(true);
  });

  it("empty book is all zeros", () => {
    const agg = aggregateFleet([], noStop);
    expect([agg.count, agg.totalPnl.toString(), agg.exposure.toString(), agg.openRisk.toString()]).toEqual([0, "0", "0", "0"]);
  });
});

describe("FEAT-0824 — owner filter options", () => {
  it("offers no choice when the book has no bot-owned position", () => {
    const rows = buildFleetRows([pos({ positionId: "m", symbol: "A" })]);
    expect(ownerFilterOptions(rows)).toEqual([]);
  });

  it("lists all, manual, bots and each bot once, with counts that add up", () => {
    const rows = buildFleetRows(
      [
        ...fleet(),
        pos({ positionId: "p-b1-second", symbol: "LTCUSDT" }),
      ],
      new Map([...owners, ["p-b1-second", { botId: "b1", name: "RSI 15m" }]]),
    );
    const options = ownerFilterOptions(rows);
    const count = (value: string) => options.find((o) => o.value === value)?.count;
    expect(options.map((o) => o.value)).toEqual(["all", "manual", "bots", "bot:b1", "bot:b2", "bot:b3"]);
    expect([count("all"), count("manual"), count("bots"), count("bot:b1")]).toEqual([6, 2, 4, 2]);
    expect(count("manual")! + count("bots")!).toBe(count("all"));
  });
});
