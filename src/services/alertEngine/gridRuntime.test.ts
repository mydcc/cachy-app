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
 * FEAT-0819 stage 4 — end-to-end integration suite for the grid bot runtime:
 * placement through OrderGate, counter-order rebalancing, Decimal fees,
 * pause/resume, trend_filter withdraw & rebuild, strict cancel-before-close
 * stop & stop_out, crash recovery from `"stopping"`, reload reconciliation,
 * `(symbol, side)` slot collision / opposite-side independence, paper-only
 * enforcement, and `account_unavailable`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/env", () => ({ browser: true, dev: true }));

vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../toastService.svelte", () => ({
  toastService: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), add: vi.fn() },
}));

const appFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/appAuth", () => ({
  appFetch: appFetchMock,
  appAuthHeaders: () => ({}),
}));

import { migrateAccounts } from "../../stores/settings/accounts";
vi.mock("../../stores/settings.svelte", async () => {
  const actual = await vi.importActual<typeof import("../../stores/settings.svelte")>(
    "../../stores/settings.svelte",
  );
  return {
    settingsState: {
      ...actual.settingsState,
      apiProvider: "bitunix",
      ...migrateAccounts({
        apiKeys: { bitunix: { key: "paper-test-key", secret: "paper-test-secret" } },
      }),
    },
  };
});

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { FeedReading } from "../../lib/rules/feedReadings";
import type { Condition, EvaluationCandle, GridDocument } from "../../lib/rules/types";
import { marketState } from "../../stores/market.svelte";
import { paperState } from "../../stores/paperTrading.svelte";
import { botsState } from "../../stores/botsState.svelte";
import {
  botOrderEnvironment,
  gridRuntimeEnvironment,
  syncGridMarketSubscriptions,
} from "../../stores/alerts.svelte";
import { omsService } from "../omsService";
import { registerConfirmationCheck, registerKillSwitch, registerRiskLimitCheck } from "../orderGate";
import { paperExchange } from "../paperExchange";
import { paperTradingService } from "../paperTradingService";
import { tradeService } from "../tradeService";
import { externalFeedStore } from "./externalFeedStore";
import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import { setGridBookChangeListener } from "./gridBookBus";
import {
  gridRuntime,
  gridSlotCloseClientId,
  gridSlotOpenClientId,
  type GridRuntimeEnvironment,
} from "./gridRuntime";
import { deleteGrid, patchGridState, readGridState, saveGrid } from "./gridStore";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");
const HOUR_MS = 3_600_000;

let testCandles: EvaluationCandle[] = [];
let testMarkCandles: EvaluationCandle[] = [];
let testFeeds: readonly FeedReading[] = [];

function makeCandle(index: number, close: string, low = close, high = close): EvaluationCandle {
  return {
    open_time_ms: index * HOUR_MS,
    open: close,
    high,
    low,
    close,
    volume: "10",
  };
}

function makeGrid(overrides: Partial<GridDocument> = {}): GridDocument {
  return {
    kind: "grid",
    schema_version: 1,
    id: "grid-1",
    name: "BTC Range Grid",
    symbol: "BTCUSDT",
    side: "long",
    evaluation_timeframe: "1h",
    lower_price: "40000",
    upper_price: "44000",
    level_count: 4,
    spacing: "arithmetic",
    sizing: { basis: "quote_budget", amount: "4000" },
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
    provenance: { source: "human", created_at_ms: 1700000000000 },
    ...overrides,
  };
}

function buildTestEnv(
  overrides: Partial<GridRuntimeEnvironment> = {},
): GridRuntimeEnvironment {
  const base = gridRuntimeEnvironment({
    tradeService,
    paperExchange,
    paperTradingService,
    externalFeedStore,
    readCandles: (_s, tf) => (tf === "1h" ? testCandles : []),
    readMarkCandles: (_s, tf) => (tf === "1h" ? testMarkCandles : []),
  });
  return {
    ...base,
    readFeeds: () => testFeeds,
    ensureSymbolMeta: async () => {},
    ...overrides,
  };
}

function setLivePrice(price: string): void {
  const p = new Decimal(price);
  const now = Date.now();
  const entry = marketState.getOrCreateSymbol("BTCUSDT");
  entry.lastPrice = p;
  entry.markPrice = p;
  entry.indexPrice = p;
  entry.lastUpdated = now;
  entry.lastPriceUpdatedAt = now;
  entry.markPriceUpdatedAt = now;
  entry.lastPriceSource = "ws";
  paperTradingService.onPrice("BTCUSDT", p);
}

beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ WASM_JS)) as {
    default: (binary: BufferSource) => Promise<unknown>;
  };
  await mod.default(readFileSync(WASM_BINARY));
  ruleSchema.setLoader(async () => mod as never);
  await ruleSchema.load();
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  appFetchMock.mockReset();

  paperTradingService.destroy();
  paperState.reloadFromStorage();
  paperState.resetBook();
  paperState.setConfig("failureMode", "none");
  paperState.setConfig("slippageBps", "0");
  paperState.setConfig("takerFeeBps", "0");
  paperState.setConfig("startingBalance", "10000");
  paperState.resetBook();
  paperTradingService.install();
  paperTradingService.setEnabled(true);

  registerKillSwitch(null);
  registerRiskLimitCheck(null);
  registerConfirmationCheck(null);
  omsService.reset();

  marketState.symbolMeta["BTCUSDT"] = {
    symbol: "BTCUSDT",
    basePrecision: 2,
    quotePrecision: 1,
    minTradeVolume: new Decimal("0.01"),
    maxLimitOrderVolume: new Decimal("100"),
    symbolStatus: "OPEN",
    isApiSupported: true,
  };
  setLivePrice("45000");
  paperTradingService.syncToStores();

  testCandles = [makeCandle(0, "45000"), makeCandle(1, "45000")];
  testMarkCandles = [];
  testFeeds = [];

  gridRuntime.configure(buildTestEnv());
  setGridBookChangeListener(() => {
    gridRuntime.notifyBookChanged();
  });
});

afterEach(() => {
  setGridBookChangeListener(null);
  gridRuntime.configure(null);
  paperTradingService.destroy();
});

describe("FEAT-0819 — a failed resume leaves the grid paused", () => {
  it("reverts to paused and reports the failure when the reconcile throws", async () => {
    saveGrid(makeGrid());
    const started = await gridRuntime.startGrid("grid-1");
    expect(started).toEqual({ ok: true });
    expect((await gridRuntime.pauseGrid("grid-1")).ok).toBe(true);

    // resume reads the metadata once; the reconcile that follows reads it again and throws.
    let metaCalls = 0;
    gridRuntime.configure(
      buildTestEnv({
        ensureSymbolMeta: async () => {
          metaCalls += 1;
          if (metaCalls >= 2) throw new Error("metadata unavailable mid-reconcile");
        },
      }),
    );

    await expect(gridRuntime.resumeGrid("grid-1")).resolves.toEqual({
      ok: false,
      reason: "resume-failed",
    });
    expect(readGridState("grid-1")?.status).toBe("paused");
  });
});

describe("FEAT-0819 — a grid changed while its start is pending", () => {
    /**
   * Holds the start at its only await (symbol metadata). `reached` resolves once the
   * start is genuinely pending there, so a test mutates the grid mid-start, not before
   * the lock has even handed the start its document.
   */
  function pauseStartAtMetadata(): {
    reached: Promise<void>;
    release: () => void;
    env: GridRuntimeEnvironment;
  } {
    let release = (): void => {};
    let markReached = (): void => {};
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const reached = new Promise<void>((resolveReached) => {
      markReached = resolveReached;
    });
    return {
      reached,
      release,
      env: buildTestEnv({
        ensureSymbolMeta: async () => {
          markReached();
          await gate;
        },
      }),
    };
  }

  it("refuses to start a grid that was deleted while the start was pending", async () => {
    saveGrid(makeGrid());
    const { reached, release, env } = pauseStartAtMetadata();
    gridRuntime.configure(env);

    const pending = gridRuntime.startGrid("grid-1");
    await reached;
    deleteGrid("grid-1");
    release();

    await expect(pending).resolves.toEqual({ ok: false, reason: "grid-not-found" });
    expect(paperState.orders.filter((o) => o.origin === "bot")).toHaveLength(0);
    expect(readGridState("grid-1")).toBeUndefined();
  });

  it("refuses to start with the old document when it was edited while the start was pending", async () => {
    saveGrid(makeGrid());
    const { reached, release, env } = pauseStartAtMetadata();
    gridRuntime.configure(env);

    const pending = gridRuntime.startGrid("grid-1");
    await reached;
    saveGrid(makeGrid({ level_count: 6 }));
    release();

    await expect(pending).resolves.toEqual({ ok: false, reason: "grid-changed" });
    expect(paperState.orders.filter((o) => o.origin === "bot")).toHaveLength(0);
    expect(readGridState("grid-1")).toBeUndefined();
  });
});

describe("gridRuntime (FEAT-0819 stage 4)", () => {
  it("places exactly level_count attributed opening LIMIT orders within range and budget", async () => {
    const grid = makeGrid();
    saveGrid(grid);

    const res = await gridRuntime.startGrid("grid-1");
    expect(res).toEqual({ ok: true });
    expect(appFetchMock).not.toHaveBeenCalled();

    // 4 levels over [40000, 44000]: open prices 40000, 41000, 42000, 43000.
    expect(paperState.orders).toHaveLength(4);
    const hash = ruleSchema.gridContentHash(grid);
    let totalNotional = new Decimal(0);

    for (let i = 0; i < 4; i += 1) {
      const order = paperState.orders.find(
        (o) => o.clientOrderId === gridSlotOpenClientId("grid-1", i),
      );
      expect(order).toBeDefined();
      expect(order?.origin).toBe("bot");
      expect(order?.botId).toBe("grid-1");
      expect(order?.ruleId).toBe("grid-1");
      expect(order?.strategyHash).toBe(hash);
      expect(order?.tradeSide).toBe("OPEN");
      expect(order?.reduceOnly).toBe(false);

      const price = new Decimal(order!.price!);
      expect(price.gte("40000") && price.lte("44000")).toBe(true);
      totalNotional = totalNotional.plus(price.times(order!.qty));
    }

    // Truncating budget split guarantees Σ qty × openPrice <= budget.
    expect(totalNotional.lte("4000")).toBe(true);
    expect(readGridState("grid-1")?.status).toBe("active");
    expect(botsState.gridStates.get("grid-1")?.openOrderCount).toBe(4);
  });

  it("supports geometric spacing within range bounds", async () => {
    const grid = makeGrid({
      id: "grid-geo",
      spacing: "geometric",
      lower_price: "40000",
      upper_price: "48400",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);

    const res = await gridRuntime.startGrid("grid-geo");
    expect(res).toEqual({ ok: true });
    expect(paperState.orders).toHaveLength(2);
    // Geometric 2-step between 40000 and 48400 -> lines [40000, 44000, 48400]
    expect(paperState.orders.map((o) => o.price)).toEqual(["40000", "44000"]);
  });

  it("refuses startup on budget exhaustion without leaving partial orders on the book", async () => {
    paperState.setConfig("startingBalance", "1000");
    paperTradingService.resetBook();

    const grid = makeGrid({ sizing: { basis: "quote_budget", amount: "4000" } });
    saveGrid(grid);

    const res = await gridRuntime.startGrid("grid-1");
    expect(res).toEqual({ ok: false, reason: "insufficient-balance" });
    expect(paperState.orders).toHaveLength(0);
    expect(readGridState("grid-1")).toBeUndefined();
  });

  it("refuses send-level or disabled-paper execution and reaches zero network calls", async () => {
    const sendGrid: GridDocument = {
      ...makeGrid({ id: "grid-send" }),
      consequence_level: "send",
    };
    localStorage.setItem("cachy_grids_v1", JSON.stringify([sendGrid]));

    expect(await gridRuntime.startGrid("grid-send")).toEqual({
      ok: false,
      reason: "level-not-supported",
    });

    const paperGrid = makeGrid();
    saveGrid(paperGrid);
    paperTradingService.setEnabled(false);

    expect(await gridRuntime.startGrid("grid-1")).toEqual({
      ok: false,
      reason: "paper-trading-off",
    });
    expect(botsState.gridStates.get("grid-1")?.status).toBe("account_unavailable");
    expect(appFetchMock).not.toHaveBeenCalled();
  });

  it("enforces (symbol, side) exclusivity against manual positions, other bots/grids, and allows opposite side", async () => {
    saveGrid(makeGrid({ id: "grid-long-1", side: "long" }));
    saveGrid(makeGrid({ id: "grid-long-2", side: "long" }));
    saveGrid(makeGrid({ id: "grid-short-1", side: "short" }));

    expect(await gridRuntime.startGrid("grid-long-1")).toEqual({ ok: true });

    // Second long grid on BTCUSDT is refused.
    expect(await gridRuntime.startGrid("grid-long-2")).toEqual({
      ok: false,
      reason: "slot-conflict:other-grid",
    });

    // Single-entry long bot sees reserved BTCUSDT|long slot.
    const singleBotEnv = botOrderEnvironment(
      () => new Decimal("42000"),
      () => new Decimal("42000"),
    );
    expect(singleBotEnv.hasOpenPosition("BTCUSDT", "long")).toBe(true);
    expect(singleBotEnv.hasOpenPosition("BTCUSDT", "short")).toBe(false);

    // Opposite short grid on the same symbol is allowed!
    expect(await gridRuntime.startGrid("grid-short-1")).toEqual({ ok: true });

    // Cleanup short grid and place a manual short position -> a second short grid refuses.
    expect(await gridRuntime.stopGrid("grid-short-1", "manual")).toEqual({ ok: true });
    await paperExchange.handle("/api/orders", {
      type: "place-order",
      symbol: "BTCUSDT",
      side: "SELL",
      orderType: "MARKET",
      qty: "0.01",
      tradeSide: "OPEN",
      origin: "manual",
    });
    expect(await gridRuntime.startGrid("grid-short-1")).toEqual({
      ok: false,
      reason: "slot-conflict:manual-position",
    });
  });

  it("rebalances filled levels into reduce-only counter-orders with Decimal taker fees, and re-opens on close", async () => {
    paperState.setConfig("takerFeeBps", "6"); // 0.06%
    paperTradingService.resetBook();

    // 2 levels on [40000, 42000] -> slot 0: open 40000 / close 41000, slot 1: open 41000 / close 42000.
    // Budget 2000 -> 1000 per slot -> slot 0 qty 0.02 (0.025 floor to 0.01 step = 0.02), slot 1 qty 0.02.
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Price dips to 40900 -> slot 1 opening (41000) fills; slot 0 (40000) stays open.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
        ),
      ).toBe(true);
    });

    const openFill = paperState.fills.find(
      (f) => f.clientOrderId === gridSlotOpenClientId("grid-1", 1),
    );
    expect(openFill).toBeDefined();
    expect(openFill?.origin).toBe("bot");
    expect(openFill?.botId).toBe("grid-1");
    // Open fill fee: 40900 * 0.02 * 0.0006 = 0.4908
    expect(openFill?.fee).toBe(
      new Decimal("40900").times("0.02").times("0.0006").toString(),
    );

    const counterOrder = paperState.orders.find(
      (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
    );
    expect(counterOrder?.price).toBe("42000"); // strictly within [40000, 42000]
    expect(counterOrder?.reduceOnly).toBe(true);
    expect(counterOrder?.tradeSide).toBe("CLOSE");

    // Price rises to 42000 -> counter-order fills -> position closes & slot 1 opening is re-placed!
    setLivePrice("42000");
    await vi.waitFor(() => {
      const openOrder = paperState.orders.find(
        (o) => o.clientOrderId === gridSlotOpenClientId("grid-1", 1),
      );
      expect(openOrder).toBeDefined();
    });

    const closeFill = paperState.fills.find(
      (f) => f.clientOrderId === gridSlotCloseClientId("grid-1", 1),
    );
    expect(closeFill).toBeDefined();
    expect(closeFill?.tradeSide).toBe("CLOSE");
    expect(paperState.positions).toHaveLength(0);

    const expectedCloseFee = new Decimal("42000").times("0.02").times("0.0006");
    expect(closeFill?.fee).toBe(expectedCloseFee.toString());
    const expectedNet = new Decimal("42000")
      .minus("40900")
      .times("0.02")
      .minus(expectedCloseFee);
    expect(closeFill?.realizedPnl).toBe(expectedNet.toString());
  });

  it("pauses new opening placements while keeping counter-orders and stop_out active, then resumes from the book", async () => {
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Fill slot 1 opening -> counter-order sits at 42000.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
        ),
      ).toBe(true);
    });

    expect(await gridRuntime.pauseGrid("grid-1")).toEqual({ ok: true });
    expect(readGridState("grid-1")?.status).toBe("paused");

    // Counter-order still fills at 42000 while paused, but NO new s1:open order is placed!
    setLivePrice("42000");
    await vi.waitFor(() => {
      expect(paperState.positions).toHaveLength(0);
    });
    // Wait a tick for rebalance listener to settle cleanly.
    await gridRuntime.reconcileGrid("grid-1");
    expect(
      paperState.orders.some(
        (o) => o.clientOrderId === gridSlotOpenClientId("grid-1", 1),
      ),
    ).toBe(false);

    // Resuming rebuilds missing slot 1 opening order from document + book.
    expect(await gridRuntime.resumeGrid("grid-1")).toEqual({ ok: true });
    expect(
      paperState.orders.map((o) => o.clientOrderId).sort(),
    ).toEqual([
      gridSlotOpenClientId("grid-1", 0),
      gridSlotOpenClientId("grid-1", 1),
    ]);
  });

  it("cancels only unfilled opening orders when trend_filter reads false and rebuilds when it reads true", async () => {
    const filter: Condition = {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gt",
      right: { kind: "constant", value: "41500" },
      timeframe: "1h",
    };
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
      trend_filter: filter,
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Fill slot 1 (41000) -> counter-order rests at 42000, slot 0 open rests at 40000.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
        ),
      ).toBe(true);
    });

    // Close 1h candle at 40500 -> trend_filter false (40500 <= 41500), stop_out false (> 38000).
    testCandles = [makeCandle(0, "45000"), makeCandle(1, "40500")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);

    // Opening order s0:open cancelled, counter-order s1:close stays!
    expect(paperState.orders.map((o) => o.clientOrderId)).toEqual([
      gridSlotCloseClientId("grid-1", 1),
    ]);

    // Later candle closes at 41800 -> trend_filter true -> ladder opening s0:open rebuilt, counter-order preserved!
    testCandles.push(makeCandle(2, "41800"));
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 2 * HOUR_MS);

    expect(paperState.orders.map((o) => o.clientOrderId).sort()).toEqual([
      gridSlotOpenClientId("grid-1", 0),
      gridSlotCloseClientId("grid-1", 1),
    ]);
  });

  it("enforces strict cancel-before-close ordering on stop and stop_out (even when paused)", async () => {
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);

    const events: string[] = [];
    const env = buildTestEnv({
      cancelOrdersOwnedBy: (botId) => {
        events.push(`cancel:${botId}:orders=${paperState.orders.length}`);
        const count = paperExchange.cancelOrdersOwnedBy(botId);
        // Simulate an adverse price tick right between cancel and close:
        // because all resting entries were already cancelled, ZERO new fills can happen!
        setLivePrice("37000");
        events.push(`after-tick:orders=${paperState.orders.length}`);
        return count;
      },
      closePosition: async (params) => {
        events.push(`close:${params.symbol}:${params.positionSide}`);
        return tradeService.closePosition(params);
      },
    });
    gridRuntime.configure(env);

    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });
    // Fill slot 1 at 41000 so grid holds a live position + resting slot 0 entry + resting slot 1 counter-order.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(paperState.positions).toHaveLength(1);
    });

    // Pause the grid, then trigger stop_out via candle close below 38000.
    expect(await gridRuntime.pauseGrid("grid-1")).toEqual({ ok: true });
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "37500")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);

    expect(events).toEqual([
      "cancel:grid-1:orders=2",
      "after-tick:orders=0",
      "close:BTCUSDT:long",
    ]);
    expect(paperState.orders).toHaveLength(0);
    expect(paperState.positions).toHaveLength(0);
    expect(readGridState("grid-1")?.status).toBe("closed");
    expect(readGridState("grid-1")?.stopReason).toBe("stop_out");
  });

  it("recovers cleanly from a persisted stopping state (crash between cancel and close) and mid-ladder reload", async () => {
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Fill slot 1 -> position open + counter-order resting + slot 0 open resting.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(paperState.positions).toHaveLength(1);
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
        ),
      ).toBe(true);
    });

    // Test reload mid-ladder recovery: simulate a lost order after reload with position + fill history.
    paperExchange.cancelOpeningOrdersOwnedBy("grid-1");
    expect(paperState.orders).toHaveLength(1); // only s1:close remains

    gridRuntime.configure(buildTestEnv());
    await gridRuntime.reconcileAllGrids();

    // Missing s0:open is rebuilt, existing s1:close is NOT duplicated!
    expect(paperState.orders.map((o) => o.clientOrderId).sort()).toEqual([
      gridSlotOpenClientId("grid-1", 0),
      gridSlotCloseClientId("grid-1", 1),
    ]);

    // Calling reconcileAllGrids again is strictly idempotent.
    await gridRuntime.reconcileAllGrids();
    expect(paperState.orders).toHaveLength(2);

    // Now simulate crash mid-stop (`status: "stopping"` persisted before close ran).
    patchGridState("grid-1", { status: "stopping", stopReason: "manual" });
    gridRuntime.configure(buildTestEnv());
    await gridRuntime.reconcileAllGrids();

    expect(paperState.orders).toHaveLength(0);
    expect(paperState.positions).toHaveLength(0);
    expect(readGridState("grid-1")?.status).toBe("closed");
    expect(readGridState("grid-1")?.stopReason).toBe("manual");
  });

  it("freezes evaluation and stop_out when paper trading turns off (account_unavailable)", async () => {
    const grid = makeGrid();
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    paperTradingService.setEnabled(false);
    expect(botsState.gridStates.get("grid-1")?.status).toBe("account_unavailable");

    // Candle below 38000 does NOT trigger stop_out while paper book is offline.
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "35000")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);

    expect(readGridState("grid-1")?.status).toBe("active");
    expect(paperState.orders).toHaveLength(4);
  });

  it("supports short grids end to end with reduce-only BUY counter-orders", async () => {
    setLivePrice("39000");

    const shortGrid = makeGrid({
      id: "grid-short",
      side: "short",
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
      stop_out: [
        {
          kind: "compare",
          left: { kind: "price", field: "close" },
          op: "gt",
          right: { kind: "constant", value: "44000" },
          timeframe: "1h",
        },
      ],
    });
    saveGrid(shortGrid);
    expect(await gridRuntime.startGrid("grid-short")).toEqual({ ok: true });

    // Short opens at upper lines: slot 0 @ 41000 (close 40000), slot 1 @ 42000 (close 41000).
    setLivePrice("41200");
    await vi.waitFor(() => {
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-short", 0),
        ),
      ).toBe(true);
    });

    const closeOrd = paperState.orders.find(
      (o) => o.clientOrderId === gridSlotCloseClientId("grid-short", 0),
    );
    expect(closeOrd?.price).toBe("40000");

    // Price drops back to 40000 -> short counter-order fills cleanly.
    setLivePrice("40000");
    await vi.waitFor(() => {
      expect(paperState.positions).toHaveLength(0);
    });
    expect(paperState.fills.at(-1)?.clientOrderId).toBe(
      gridSlotCloseClientId("grid-short", 0),
    );
  });

  it("survives >500 fill eviction without duplicating open orders and ignores TP/SL plan legs", async () => {
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Fill slot 1 at 41000 -> openSlots: [1], counter-order placed.
    setLivePrice("40900");
    await vi.waitFor(() => {
      expect(readGridState("grid-1")?.openSlots).toEqual([1]);
    });

    // Attach unrelated TP/SL plan legs stamped with the same botId and evict fill history + delete counter-order.
    const posId = paperState.positions[0].positionId;
    paperState.setOrders([
      ...paperState.orders.filter(
        (o) => o.clientOrderId !== gridSlotCloseClientId("grid-1", 1),
      ),
      {
        orderId: "plan-sl",
        planGroupId: "grp-1",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.02",
        triggerPrice: "39000",
        triggerDirection: "below",
        planType: "SL",
        reduceOnly: true,
        tradeSide: "CLOSE",
        positionId: posId,
        origin: "bot",
        botId: "grid-1",
        createdAt: Date.now(),
      },
    ]);
    // Simulates MAX_FILLS (500) eviction of the grid's opening fill.
    for (let i = 0; i < 501; i += 1) {
      paperState.addFill({
        fillId: `evict-${i}`,
        orderId: `o-evict-${i}`,
        symbol: "ETHUSDT",
        side: "BUY",
        orderType: "MARKET",
        tradeSide: "OPEN",
        qty: "0.01",
        price: "2000",
        fee: "0",
        realizedPnl: "0",
        positionId: "p-evict",
        createdAt: Date.now(),
      });
    }
    expect(paperState.fills.some((f) => f.botId === "grid-1")).toBe(false);

    await gridRuntime.reconcileGrid("grid-1");

    // Must rebuild s1:close (NOT duplicate s1:open, NOT blocked by plan-sl!).
    expect(
      paperState.orders.some(
        (o) => o.clientOrderId === gridSlotCloseClientId("grid-1", 1),
      ),
    ).toBe(true);
    expect(
      paperState.orders.filter(
        (o) => o.clientOrderId === gridSlotOpenClientId("grid-1", 1),
      ),
    ).toHaveLength(0);

    // Even if counter-order is absent AND remainingCloseQty is already 0, NEVER place duplicate opening order.
    const pos = paperState.positions[0];
    paperState.setPositions([{ ...pos, amount: "0.01" }]);
    paperState.setOrders([
      ...paperState.orders.filter(
        (o) => o.clientOrderId !== gridSlotCloseClientId("grid-1", 1),
      ),
      {
        orderId: "existing-c0",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "LIMIT",
        qty: "0.01",
        price: "41000",
        reduceOnly: true,
        tradeSide: "CLOSE",
        clientOrderId: gridSlotCloseClientId("grid-1", 0),
        origin: "bot",
        botId: "grid-1",
        createdAt: Date.now(),
      },
    ]);
    await gridRuntime.reconcileGrid("grid-1");
    expect(
      paperState.orders.filter(
        (o) => o.clientOrderId === gridSlotOpenClientId("grid-1", 1),
      ),
    ).toHaveLength(0);
  });

  it("rolls back partial orders and restores pre-start state on OrderGate startup refusal, and rejects resumeGrid on armed grids", async () => {
    const grid = makeGrid();
    saveGrid(grid);

    // Unstarted armed grid cannot be resumed directly.
    expect(await gridRuntime.resumeGrid("grid-1")).toEqual({
      ok: false,
      reason: "invalid-state:armed",
    });

    // Fail the 2nd opening order via RMS hook -> must roll back the 1st placed order and state.
    let seen = 0;
    registerRiskLimitCheck(() => {
      seen += 1;
      if (seen >= 2) {
        return {
          field: "maxPositionSize",
          reason: "riskLimit",
          messageKey: "orderGate.riskLimit",
          values: { field: "maxPositionSize" },
        };
      }
      return null;
    });

    const res = await gridRuntime.startGrid("grid-1");
    expect(res.ok).toBe(false);
    expect(paperState.orders).toHaveLength(0);
    expect(readGridState("grid-1")).toBeUndefined();
  });

  it("respects warmup_candles, retains anchor on indeterminate mark candles, reads feeds, and replays backfill batches via onEachClose", async () => {
    const crossFilter: Condition = {
      kind: "cross",
      left: { kind: "price", field: "close" },
      direction: "below",
      right: { kind: "constant", value: "41000" },
      timeframe: "1h",
    };
    const markStop: Condition = {
      kind: "compare",
      left: { kind: "price", field: "close", source: "mark" },
      op: "lt",
      right: { kind: "constant", value: "38000" },
      timeframe: "1h",
    };
    const feedFilter: Condition = {
      kind: "group",
      op: "all",
      of: [
        crossFilter,
        {
          kind: "external_feed",
          feed: "funding_rate",
          op: "lt",
          value: "0.01",
        },
      ],
    };

    const grid = makeGrid({
      trend_filter: feedFilter,
      stop_out: [markStop],
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });

    // Only 1 candle (< warmup 2 for cross_below) -> must neither evaluate nor stamp anchor.
    testCandles = [makeCandle(0, "40000")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 0);
    expect(readGridState("grid-1")?.lastEvaluatedAnchorMs).toBeUndefined();
    expect(paperState.orders).toHaveLength(4);

    // 2 candles arrive, mark candles initially empty (indeterminate) -> anchor must NOT lock out retry!
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "40000")];
    testMarkCandles = [];
    testFeeds = [
      { feed: "funding_rate", symbol: "BTCUSDT", source: "bitunix", value: "0.001", asOfMs: Date.now() },
    ];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", HOUR_MS);
    expect(readGridState("grid-1")?.lastEvaluatedAnchorMs).toBeUndefined();

    // Once mark candles arrive (>= 38000), re-evaluating SAME anchor progresses cleanly!
    testMarkCandles = [makeCandle(0, "42000"), makeCandle(1, "40500")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", HOUR_MS);
    expect(readGridState("grid-1")?.lastEvaluatedAnchorMs).toBe(HOUR_MS);
    expect(readGridState("grid-1")?.lastTrendFilter).toBe(true);

    // Reconnect/backfill batch delivers intermediate candle dropping below 38000 before recovering -> onEachClose triggers stop_out!
    const series = [
      makeCandle(0, "42000"),
      makeCandle(1, "40500"),
      makeCandle(2, "37000"),
      makeCandle(3, "43000"),
    ];
    const loop = new RuleEvaluationLoop({
      readCandles: () => series,
      readRules: () => [],
      onEachClose: (sym, tf, anchorMs) => {
        testCandles = series.filter((c) => c.open_time_ms <= anchorMs);
        testMarkCandles = testCandles;
        void gridRuntime.onGridCandleClose(sym, tf, anchorMs);
      },
    });
    // Prime high-water mark at anchor 1 (HOUR_MS), then backfill batch closes 2 and 3.
    loop.observeCandles(
      "BTCUSDT",
      "1h",
      [
        { time: 0 },
        { time: HOUR_MS },
        { time: 2 * HOUR_MS },
      ],
    );
    loop.observeCandles(
      "BTCUSDT",
      "1h",
      [
        { time: 0 },
        { time: HOUR_MS },
        { time: 2 * HOUR_MS },
        { time: 3 * HOUR_MS },
        { time: 4 * HOUR_MS },
      ],
    );

    await vi.waitFor(() => {
      expect(readGridState("grid-1")?.status).toBe("closed");
      expect(readGridState("grid-1")?.stopReason).toBe("stop_out");
    });
  });

  it("coalesces concurrent fills arriving mid-self-mutation, protects recordBotExit on partial close, and reserves balance across grids", async () => {
    // 1. Cumulative balance reservation across two grids + disabled unstarted draft + manual order block.
    const draftDisabled = makeGrid({ id: "grid-draft", enabled: false });
    saveGrid(draftDisabled);

    const gridA = makeGrid({
      id: "grid-a",
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "6000" },
    });
    const gridB = makeGrid({
      id: "grid-b",
      side: "short",
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "5000" },
    });
    saveGrid(gridA);
    saveGrid(gridB);

    expect(await gridRuntime.startGrid("grid-a")).toEqual({ ok: true });
    expect(botsState.gridStates.get("grid-draft")?.status).toBe("armed");
    expect(await gridRuntime.startGrid("grid-b")).toEqual({
      ok: false,
      reason: "insufficient-balance",
    });

    // 2. Concurrent fill during self-mutation queues a trailing reconcile.
    const smallB = makeGrid({
      id: "grid-b-small",
      side: "short",
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(smallB);
    expect(await gridRuntime.startGrid("grid-b-small")).toEqual({ ok: true });

    const gridC = makeGrid({
      id: "grid-c-eth",
      symbol: "ETHUSDT",
      lower_price: "2000",
      upper_price: "2400",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "1000" },
    });
    marketState.symbolMeta["ETHUSDT"] = {
      symbol: "ETHUSDT",
      basePrecision: 2,
      quotePrecision: 1,
      minTradeVolume: new Decimal("0.01"),
      maxLimitOrderVolume: new Decimal("100"),
      symbolStatus: "OPEN",
      isApiSupported: true,
    };
    const ethEntry = marketState.getOrCreateSymbol("ETHUSDT");
    ethEntry.lastPrice = new Decimal("2500");
    ethEntry.markPrice = new Decimal("2500");
    ethEntry.indexPrice = new Decimal("2500");
    ethEntry.lastUpdated = Date.now();
    ethEntry.lastPriceUpdatedAt = ethEntry.lastUpdated;
    ethEntry.markPriceUpdatedAt = ethEntry.lastUpdated;
    ethEntry.lastPriceSource = "ws";
    paperTradingService.onPrice("ETHUSDT", new Decimal("2500"));
    saveGrid(gridC);

    let injectedFill = false;
    const realPlace = tradeService.placeGridOrder.bind(tradeService);
    gridRuntime.configure(
      buildTestEnv({
        placeGridOrder: async (params) => {
          const out = await realPlace(params);
          if (!injectedFill && params.attribution.botId === "grid-c-eth") {
            injectedFill = true;
            // Price rises to 41200 -> fills smallB short slot while gridRuntime.isSelfMutating() is true!
            setLivePrice("41200");
          }
          return out;
        },
      }),
    );

    expect(await gridRuntime.startGrid("grid-c-eth")).toEqual({ ok: true });
    await vi.waitFor(() => {
      expect(
        paperState.orders.some(
          (o) => o.clientOrderId === gridSlotCloseClientId("grid-b-small", 0),
        ),
      ).toBe(true);
    });

    // 3. Partial close (both 0 and 0.5) leaves position open -> stopGrid refuses position-remaining
    // WITHOUT calling recordBotExit AND WITHOUT entering a microtask retry loop!
    const recordExitSpy = vi.fn();
    let closeCalls = 0;
    const origClose = tradeService.closePosition.bind(tradeService);
    gridRuntime.configure(
      buildTestEnv({
        recordBotExit: recordExitSpy,
        closePosition: async (params) => {
          closeCalls += 1;
          return origClose(params);
        },
      }),
    );

    paperState.setConfig("failureMode", "partial");
    paperState.setConfig("partialFillRatio", "0");
    expect(await gridRuntime.stopGrid("grid-b-small", "manual")).toEqual({
      ok: false,
      reason: "position-remaining",
    });
    // Flush microtasks while failureMode === "partial" (ratio 0) is STILL active.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(closeCalls).toBe(1);
    expect(recordExitSpy).not.toHaveBeenCalled();

    paperState.setConfig("partialFillRatio", "0.5");
    expect(await gridRuntime.stopGrid("grid-b-small", "manual")).toEqual({
      ok: false,
      reason: "position-remaining",
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(closeCalls).toBe(2);
    expect(recordExitSpy).not.toHaveBeenCalled();

    // Once full close succeeds on manual stop, grid reaches closed (recordBotExit reserved for stop_out).
    paperState.setConfig("failureMode", "none");
    expect(await gridRuntime.stopGrid("grid-b-small", "manual")).toEqual({ ok: true });
    expect(readGridState("grid-b-small")?.status).toBe("closed");
    expect(recordExitSpy).not.toHaveBeenCalled();
  });

  it("blocks startGrid on active/paused/stopping grids and propagates resume/reconcile refusals", async () => {
    const grid = makeGrid({
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-1")).toEqual({ ok: true });
    expect(await gridRuntime.startGrid("grid-1")).toEqual({
      ok: false,
      reason: "invalid-state:active",
    });

    expect(await gridRuntime.pauseGrid("grid-1")).toEqual({ ok: true });
    expect(await gridRuntime.startGrid("grid-1")).toEqual({
      ok: false,
      reason: "invalid-state:paused",
    });

    // Simulate kill switch engaging while paused -> resumeGrid must fail and revert to paused.
    paperExchange.cancelOpeningOrdersOwnedBy("grid-1");
    registerKillSwitch(() => true);
    const resumeRes = await gridRuntime.resumeGrid("grid-1");
    expect(resumeRes.ok).toBe(false);
    expect(readGridState("grid-1")?.status).toBe("paused");
    registerKillSwitch(null);

    expect(await gridRuntime.resumeGrid("grid-1")).toEqual({ ok: true });
    expect(await gridRuntime.stopGrid("grid-1", "manual")).toEqual({ ok: true });
  });

  it("fires price stop_out without waiting for unwarmed trend_filter indicators and replays mark-price stop_out on cache update", async () => {
    const emaFilter: Condition = {
      kind: "compare",
      left: { kind: "indicator", indicator: { id: "ema", params: { period: 20 }, output: "value" } },
      op: "gt",
      right: { kind: "constant", value: "39000" },
      timeframe: "1h",
    };
    const markStop: Condition = {
      kind: "compare",
      left: { kind: "price", field: "close", source: "mark" },
      op: "lt",
      right: { kind: "constant", value: "38000" },
      timeframe: "1h",
    };

    const ensured: Array<[string, string, number | undefined]> = [];
    gridRuntime.configure(
      buildTestEnv({
        ensureMarkCandles: (sym, tf, req) => {
          ensured.push([sym, tf, req]);
          return undefined;
        },
      }),
    );

    saveGrid(makeGrid({ id: "grid-warmup", trend_filter: emaFilter }));
    expect(await gridRuntime.startGrid("grid-warmup")).toEqual({ ok: true });

    // Only 2 candles (< EMA(20) warmup): price stop_out below 38000 MUST still fire immediately.
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "37000")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);
    expect(readGridState("grid-warmup")?.status).toBe("closed");
    expect(readGridState("grid-warmup")?.stopReason).toBe("stop_out");

    // Stale mark candle cache (only bucket 0 while closing anchor is bucket 1): must withhold stale data and replay when bucket 1 arrives!
    saveGrid(makeGrid({ id: "grid-mark", stop_out: [markStop] }));
    expect(await gridRuntime.startGrid("grid-mark")).toEqual({ ok: true });
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "40500")];
    testMarkCandles = [makeCandle(0, "42000")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);
    expect(readGridState("grid-mark")?.lastEvaluatedAnchorMs).toBeUndefined();
    expect(ensured).toEqual([["BTCUSDT", "1h", 1 * HOUR_MS]]);

    testMarkCandles = [makeCandle(0, "42000"), makeCandle(1, "37500")];
    await gridRuntime.notifyMarkCandlesUpdated("BTCUSDT", "1h");
    expect(readGridState("grid-mark")?.status).toBe("closed");
    expect(readGridState("grid-mark")?.stopReason).toBe("stop_out");
  });

  it("fails open on unavailable trend_filter feeds with once-per-outage notice, blocks manual collision, and closes grids on book reset", async () => {
    const droppedNotices: Array<{ ruleId: string; feeds: string[] }> = [];
    gridRuntime.configure(
      buildTestEnv({
        onDroppedTrendFilter: (info) => droppedNotices.push({ ruleId: info.ruleId, feeds: info.feeds }),
      }),
    );

    const grid = makeGrid({
      id: "grid-adr29",
      lower_price: "40000",
      upper_price: "42000",
      level_count: 2,
      sizing: { basis: "quote_budget", amount: "2000" },
      trend_filter: {
        kind: "external_feed",
        feed: "funding_rate",
        op: "lt",
        value: "0.01",
      },
    });
    saveGrid(grid);
    expect(await gridRuntime.startGrid("grid-adr29")).toEqual({ ok: true });

    // 1. Live feed healthy -> negative check withdraws entries cleanly.
    testFeeds = [
      { feed: "funding_rate", symbol: "BTCUSDT", source: "bitunix", value: "0.05", asOfMs: Date.now() },
    ];
    testCandles = [makeCandle(0, "42000"), makeCandle(1, "42000")];
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 1 * HOUR_MS);
    expect(paperState.orders).toHaveLength(0);

    // 2. Manual paper order on reserved active (BTCUSDT, long) slot must be blocked!
    await expect(
      paperExchange.handle("/api/orders", {
        type: "place-order",
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        qty: "0.01",
        tradeSide: "OPEN",
        origin: "manual",
      }),
    ).rejects.toThrow("settings.automation.orderRefusedPositionOpen");

    // 3. Feed outage -> ADR-0029 fail-open rebuilds entries and signals ONCE per outage across consecutive closes.
    testFeeds = [];
    testCandles.push(makeCandle(2, "42100"), makeCandle(3, "42200"));
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 2 * HOUR_MS);
    await gridRuntime.onGridCandleClose("BTCUSDT", "1h", 3 * HOUR_MS);
    expect(droppedNotices).toEqual([{ ruleId: "grid-adr29", feeds: ["funding_rate"] }]);
    expect(paperState.orders).toHaveLength(2);

    // 4. Book reset closes occupying grids rather than leaving stale active states.
    paperTradingService.resetBook();
    expect(readGridState("grid-adr29")?.status).toBe("closed");

    // 5. Active/paused grids maintain independent marketWatcher kline & price subscriptions across lifecycle and release on stop.
    const watcher = { register: vi.fn(), unregister: vi.fn() };
    gridRuntime.configure(
      buildTestEnv({
        syncSubscriptions: () => syncGridMarketSubscriptions(watcher),
      }),
    );
    saveGrid(makeGrid({ id: "grid-sub", evaluation_timeframe: "1h", stop_out: [
      {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "lt",
        right: { kind: "constant", value: "38000" },
        timeframe: "4h",
      },
    ] }));
    expect(await gridRuntime.startGrid("grid-sub")).toEqual({ ok: true });
    expect(watcher.register).toHaveBeenCalledWith("BTCUSDT", "price", "stateless");
    expect(watcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "stateless");
    expect(watcher.register).toHaveBeenCalledWith("BTCUSDT", "kline_1h", "stateless");

    expect(await gridRuntime.stopGrid("grid-sub", "manual")).toEqual({ ok: true });
    expect(watcher.unregister).toHaveBeenCalledWith("BTCUSDT", "price", "stateless");
    expect(watcher.unregister).toHaveBeenCalledWith("BTCUSDT", "kline_4h", "stateless");
    expect(watcher.unregister).toHaveBeenCalledWith("BTCUSDT", "kline_1h", "stateless");
    syncGridMarketSubscriptions(null);
  });
});
