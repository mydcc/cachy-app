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

/**
 * FEAT-0028 — the seam between the loop and the evaluator.
 *
 * The core does not compute indicators; it reads the series the caller sends.
 * Before this slice the loop sent none, so every indicator condition came back
 * `indeterminate` and no indicator alert could ever fire. These tests pin the
 * seam itself: what reaches the gate, and what happens when it cannot be built.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { RuleEvaluationLoop } from "./ruleEvaluationLoop";
import type {
  EvaluationCandle,
  EvaluationContext,
  RuleDocument,
  Verdict,
} from "../../lib/rules/types";

const loggerError = vi.fn();
vi.mock("../logger", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

const gateEvaluate = vi.fn<() => Verdict | undefined>();
vi.mock("../../lib/rules/ruleEvaluationGate", () => ({
  ruleEvaluationGate: {
    evaluate: (...args: unknown[]) => gateEvaluate(...(args as [])),
  },
}));

const QUIET: Verdict = { verdict: "does_not_fire" };

function series(length: number): EvaluationCandle[] {
  return Array.from({ length }, (_, i) => ({
    open_time_ms: i * 60_000,
    open: "100",
    high: "101",
    low: "99",
    close: String(100 + i),
    volume: "5",
  }));
}

function ruleReading(id: string, params: Record<string, number>): RuleDocument {
  return {
    id: "r1",
    name: "My RSI alert",
    symbol: "BTCUSDT",
    trigger_timeframe: "1m",
    conditions: {
      kind: "compare",
      left: { kind: "indicator", indicator: { id, params } },
      op: "gt",
      right: { kind: "constant", value: "70" },
      timeframe: "1m",
    },
  } as unknown as RuleDocument;
}

function loopFor(rule: RuleDocument) {
  return new RuleEvaluationLoop({
    readCandles: () => series(40),
    readRules: () => [rule],
    onFiring: vi.fn(),
  });
}

/** Drive one genuine close: the second observation closes the first candle. */
function closeOnce(loop: RuleEvaluationLoop): void {
  loop.observeCandles("BTCUSDT", "1m", [{ time: 1_000 }]);
  loop.observeCandles("BTCUSDT", "1m", [{ time: 61_000 }]);
}

function contextPassedToGate(): EvaluationContext {
  return gateEvaluate.mock.calls[0][1] as unknown as EvaluationContext;
}

describe("indicator series reaching the evaluator", () => {
  beforeEach(() => {
    gateEvaluate.mockReset();
    gateEvaluate.mockReturnValue(QUIET);
    loggerError.mockReset();
  });

  it("sends the series a rule reads, index-aligned to the candles", () => {
    closeOnce(loopFor(ruleReading("rsi", { period: 14 })));

    const ctx = contextPassedToGate();
    expect(ctx.indicators).toHaveLength(1);
    expect(ctx.indicators?.[0].indicator.id).toBe("rsi");
    expect(ctx.indicators?.[0].timeframe).toBe("1m");
    expect(ctx.indicators?.[0].values).toHaveLength(ctx.candles["1m"].length);
  });

  it("omits the key entirely for a rule that reads no indicator", () => {
    const priceOnly = {
      id: "r1",
      symbol: "BTCUSDT",
      trigger_timeframe: "1m",
      conditions: {
        kind: "compare",
        left: { kind: "price", field: "close" },
        op: "gt",
        right: { kind: "constant", value: "100" },
        timeframe: "1m",
      },
    } as unknown as RuleDocument;

    closeOnce(loopFor(priceOnly));

    expect(contextPassedToGate().indicators).toBeUndefined();
  });

  it("refuses out loud rather than letting an uncomputable rule look indeterminate", () => {
    closeOnce(loopFor(ruleReading("ichimoku", { conversion_period: 9 })));

    expect(gateEvaluate).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledTimes(1);
    const [category, message] = loggerError.mock.calls[0];
    expect(category).toBe("alerts");
    expect(message).toContain("never fire");
    expect(message).toContain("ichimoku");
  });

  it("says so once, not on every candle close", () => {
    const loop = loopFor(ruleReading("ichimoku", { conversion_period: 9 }));
    closeOnce(loop);
    loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);
    loop.observeCandles("BTCUSDT", "1m", [{ time: 181_000 }]);

    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("does not log the rule's conditions, which are Class A strategy", () => {
    closeOnce(loopFor(ruleReading("ichimoku", { conversion_period: 9 })));

    const logged = JSON.stringify(loggerError.mock.calls[0]);
    expect(logged).not.toContain("conditions");
    expect(logged).not.toContain("constant");
  });
});

describe("the record of an inert rule", () => {
  beforeEach(() => {
    gateEvaluate.mockReset();
    gateEvaluate.mockReturnValue(QUIET);
    loggerError.mockReset();
  });

  it("is kept as data, not only as a log line", () => {
    const loop = loopFor(ruleReading("ichimoku", { conversion_period: 9 }));
    closeOnce(loop);

    expect(loop.unevaluableRules()).toEqual([
      {
        ruleId: "r1",
        name: "My RSI alert",
        symbol: "BTCUSDT",
        reason: expect.stringContaining("ichimoku"),
      },
    ]);
  });

  it("hands the record to an injected sink instead of logging, when one is given", () => {
    const onUnevaluable = vi.fn();
    const loop = new RuleEvaluationLoop({
      readCandles: () => series(40),
      readRules: () => [ruleReading("ichimoku", { conversion_period: 9 })],
      onUnevaluable,
    });

    closeOnce(loop);
    loop.observeCandles("BTCUSDT", "1m", [{ time: 121_000 }]);

    expect(onUnevaluable).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("keeps evaluating when the sink throws, because the record is what matters", () => {
    const loop = new RuleEvaluationLoop({
      readCandles: () => series(40),
      readRules: () => [ruleReading("ichimoku", { conversion_period: 9 })],
      onUnevaluable: () => {
        throw new Error("toast exploded");
      },
    });

    expect(() => closeOnce(loop)).not.toThrow();
    expect(loop.unevaluableRules()).toHaveLength(1);
    expect(loggerError).toHaveBeenCalledTimes(1);
  });

  it("is forgotten on reset, so a fresh session reports again", () => {
    const loop = loopFor(ruleReading("ichimoku", { conversion_period: 9 }));
    closeOnce(loop);
    loop.reset();

    expect(loop.unevaluableRules()).toEqual([]);
  });
});
