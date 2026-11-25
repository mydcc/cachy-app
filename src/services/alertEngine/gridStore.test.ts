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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true, dev: true }));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ruleSchema } from "../../lib/rules/ruleSchema";
import type { GridDocument } from "../../lib/rules/types";
import {
  clearGridState,
  deleteGrid,
  getGrid,
  GRID_STATE_STORAGE_KEY,
  GRIDS_STORAGE_KEY,
  GridStoreUnreadableError,
  patchGridState,
  readGrids,
  readGridState,
  readGridStates,
  saveGrid,
  subscribeGridStore,
  writeGridState,
} from "./gridStore";

const WASM_JS = pathToFileURL(resolve(process.cwd(), "static/wasm/technicals_wasm.js")).href;
const WASM_BINARY = resolve(process.cwd(), "static/wasm/technicals_wasm_bg.wasm");

function makeGrid(overrides: Partial<GridDocument> = {}): GridDocument {
  return {
    kind: "grid",
    schema_version: 1,
    id: "grid-1",
    name: "BTC Long Grid",
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
    provenance: { source: "human", created_at_ms: 1700000000000 },
    ...overrides,
  };
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
});

describe("gridStore (FEAT-0819 stage 4)", () => {
  it("validates and stores canonical grid documents separately from cachy_rules_v1", () => {
    const saved = saveGrid(
      makeGrid({
        symbol: " btcusdt ",
        lower_price: "40000.00",
        sizing: { basis: "quote_budget", amount: "1000.0" },
      }),
    );

    expect(saved).toHaveLength(1);
    expect(localStorage.getItem("cachy_rules_v1")).toBeNull();
    const loaded = getGrid("grid-1");
    expect(loaded?.symbol).toBe("BTCUSDT");
    expect(loaded?.lower_price).toBe("40000");
    expect(loaded?.sizing.amount).toBe("1000");
  });

  it("upserts existing grids by id rather than creating duplicates", () => {
    saveGrid(makeGrid({ name: "First" }));
    saveGrid(makeGrid({ name: "Updated", level_count: 6 }));

    const all = readGrids();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("Updated");
    expect(all[0].level_count).toBe(6);
  });

  it("fails closed on corrupt JSON or non-array storage without overwriting", () => {
    localStorage.setItem(GRIDS_STORAGE_KEY, "{not valid json");
    expect(() => readGrids()).toThrow(GridStoreUnreadableError);
    expect(() => saveGrid(makeGrid({ id: "grid-2" }))).toThrow(GridStoreUnreadableError);
    expect(localStorage.getItem(GRIDS_STORAGE_KEY)).toBe("{not valid json");

    localStorage.setItem(GRIDS_STORAGE_KEY, JSON.stringify({ id: "not-an-array" }));
    expect(() => readGrids()).toThrow(GridStoreUnreadableError);
    expect(() => deleteGrid("grid-2")).toThrow(GridStoreUnreadableError);

    localStorage.setItem(GRID_STATE_STORAGE_KEY, "{not valid json");
    expect(() => readGridStates()).toThrow(GridStoreUnreadableError);
    expect(() => patchGridState("grid-1", { status: "active" })).toThrow(GridStoreUnreadableError);
    expect(localStorage.getItem(GRID_STATE_STORAGE_KEY)).toBe("{not valid json");

    localStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(["not-an-object"]));
    expect(() => readGridStates()).toThrow(GridStoreUnreadableError);
  });

  it("persists and normalizes runtime state entries including startedAfterFillId", () => {
    writeGridState("grid-1", {
      status: "active",
      startedAt: 1700000001000,
      startedAfterFillId: "paper-fill-12",
      lastEvaluatedAnchorMs: 1700003600000,
      lastTrendFilter: true,
      openSlots: [3, 1, 1, -1, 0],
    });
    patchGridState("grid-1", { status: "stopping", stopReason: "stop_out" });

    expect(readGridState("grid-1")).toEqual({
      status: "stopping",
      startedAt: 1700000001000,
      startedAfterFillId: "paper-fill-12",
      lastEvaluatedAnchorMs: 1700003600000,
      lastTrendFilter: true,
      stopReason: "stop_out",
      openSlots: [0, 1, 3],
    });

    // Corrupt entries are dropped gracefully when reading states.
    const raw = JSON.parse(localStorage.getItem(GRID_STATE_STORAGE_KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    raw["bad-entry"] = { status: "unknown-state" };
    localStorage.setItem(GRID_STATE_STORAGE_KEY, JSON.stringify(raw));

    const allStates = readGridStates();
    expect(allStates["grid-1"]?.status).toBe("stopping");
    expect(allStates["bad-entry"]).toBeUndefined();

    clearGridState("grid-1");
    expect(readGridState("grid-1")).toBeUndefined();
  });

  it("deletes both document and runtime state and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeGridStore(listener);

    saveGrid(makeGrid());
    writeGridState("grid-1", { status: "active", startedAt: 123 });
    expect(listener).toHaveBeenCalledTimes(2);

    expect(deleteGrid("missing")).toBe(false);
    expect(deleteGrid("grid-1")).toBe(true);
    expect(readGrids()).toEqual([]);
    expect(readGridState("grid-1")).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});
