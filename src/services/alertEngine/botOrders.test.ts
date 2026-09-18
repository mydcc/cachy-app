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
 * FEAT-0396 criteria 7 and 8 — a fired bot produces a simulated order, and
 * nothing else.
 *
 * The environment is injected, so these run without a paper account, a market
 * store or a DOM. That is the point of the port: the arithmetic below decides
 * how much money a position is worth, and it deserves exhaustive cases rather
 * than one integration test that happens to exercise one basis.
 *
 * Criterion 8 — "existing risk limits apply" — is not asserted by re-testing
 * the limits. It holds because the plan goes to `orderPlacementService`, whose
 * only route out is `tradeService.placeOrder → gatedRequest → OrderGate`, where
 * FEAT-0013's seam lives. What *is* asserted here is that this module hands the
 * gate a plan it can check: a stop, an entry, an account size and a risk
 * percentage that agrees with the quantity.
 */

import { Decimal } from "decimal.js";
import { describe, expect, it, vi } from "vitest";

import type { RuleDocument, SizeBasis, Verdict } from "../../lib/rules/types";
import {
  quantityFor,
  riskPercentageFor,
  stopPriceFor,
  submitBotOrder,
  withBotOrders,
  type BotOrderEnvironment,
} from "./botOrders";
import type { RuleFiring } from "./ruleEvaluationLoop";

const ANCHOR_MS = 1_757_030_400_000;

function botDocument(
  size_basis: SizeBasis = "percent_of_equity",
  size = "1",
  // `null`, not `undefined`: a default parameter cannot express "explicitly
  // absent", and passing `undefined` would silently give the bot a stop.
  stop: { basis: "percent_of_entry"; distance: string } | null = {
    basis: "percent_of_entry",
    distance: "2",
  },
): RuleDocument {
  return {
    schema_version: 2,
    id: "bot-1",
    name: "a bot",
    symbol: "BTCUSDT",
    trigger_timeframe: "1h",
    conditions: {
      kind: "compare",
      left: { kind: "price", field: "close" },
      op: "gte",
      right: { kind: "constant", value: "50000" },
      timeframe: "1h",
    },
    action: {
      consequence_level: "simulate",
      order: { side: "buy", size_basis, size, ...(stop ? { stop } : {}) },
    },
    enabled: true,
    provenance: { source: "human", created_at_ms: 0 },
  };
}

function firingOf(rule: RuleDocument): RuleFiring {
  return { rule, verdict: { verdict: "fires" } as Verdict, anchorMs: ANCHOR_MS };
}

function environment(overrides: Partial<BotOrderEnvironment> = {}) {
  const place = vi.fn(async () => ({
    entryPlaced: true,
    stopLoss: "attached" as const,
    takeProfit: "none" as const,
    unprotected: false,
  }));
  const env: BotOrderEnvironment = {
    paperEnabled: () => true,
    equity: () => new Decimal("10000"),
    exchange: () => "bitunix",
    closeAt: () => new Decimal("50000"),
    place,
    ...overrides,
  };
  return { env, place };
}

describe("sizing a bot's position", () => {
  it("puts a long's stop below the entry and a short's above it", () => {
    const stop = { basis: "percent_of_entry" as const, distance: "2" };

    expect(stopPriceFor(new Decimal("50000"), "buy", stop).toString()).toBe("49000");
    expect(stopPriceFor(new Decimal("50000"), "sell", stop).toString()).toBe("51000");
  });

  it("turns each basis into a quantity in the base asset", () => {
    const equity = new Decimal("10000");
    const entry = new Decimal("50000");
    const stop = new Decimal("49000");
    const q = (basis: SizeBasis, size: string) =>
      quantityFor(
        { side: "buy", size_basis: basis, size },
        equity,
        entry,
        stop,
      ).toString();

    expect(q("base_quantity", "0.5")).toBe("0.5");
    // 500 USDT at 50 000 is 0.01 BTC.
    expect(q("quote_notional", "500")).toBe("0.01");
    // 1% of 10 000 is 100 USDT, which is 0.002 BTC.
    expect(q("percent_of_equity", "1")).toBe("0.002");
    // 1% of 10 000 is 100 USDT of risk over a 1 000 stop distance: 0.1 BTC.
    expect(q("percent_risk", "1")).toBe("0.1");
  });

  it("reports the risk the quantity actually carries", () => {
    const equity = new Decimal("10000");
    const entry = new Decimal("50000");
    const stop = new Decimal("49000");

    // The arithmetic checking itself: sizing by percent of risk and then
    // re-deriving the risk has to return the number the rule asked for, because
    // that is the pair the gate compares (FEAT-0011).
    const order = { side: "buy" as const, size_basis: "percent_risk" as const, size: "1" };
    const qty = quantityFor(order, equity, entry, stop);

    expect(riskPercentageFor(qty, equity, entry, stop).toString()).toBe("1");
  });
});

describe("what a fired bot submits", () => {
  it("hands the placement service a plan the gate can check", async () => {
    const { env, place } = environment();

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBeNull();

    expect(place).toHaveBeenCalledTimes(1);
    const plan = place.mock.calls[0][0];
    expect(plan).toMatchObject({
      exchange: "bitunix",
      symbol: "BTCUSDT",
      tradeType: "long",
      entryType: "market",
      takeProfits: [],
    });
    expect(plan.qty.toString()).toBe("0.002");
    expect(plan.entryPrice.toString()).toBe("50000");
    expect(plan.stopLossPrice.toString()).toBe("49000");
    expect(plan.accountSize.toString()).toBe("10000");
    // 0.002 BTC over a 1 000 stop distance is 2 USDT of 10 000 — 0.02%.
    expect(plan.riskPercentage.toString()).toBe("0.02");
  });

  it("takes the side from the intent", async () => {
    const short = botDocument();
    short.action.order!.side = "sell";
    const { env, place } = environment();

    await submitBotOrder(firingOf(short), env);

    expect(place.mock.calls[0][0].tradeType).toBe("short");
    expect(place.mock.calls[0][0].stopLossPrice.toString()).toBe("51000");
  });

  it("submits nothing while paper trading is off", async () => {
    const { env, place } = environment({ paperEnabled: () => false });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("paper-trading-off");
    expect(place).not.toHaveBeenCalled();
  });

  it("submits nothing for a bot with no stop", async () => {
    const { env, place } = environment();

    expect(await submitBotOrder(firingOf(botDocument("percent_of_equity", "1", null)), env)).toBe(
      "no-stop",
    );
    expect(place).not.toHaveBeenCalled();
  });

  it("submits nothing when the candle it fired on is no longer held", async () => {
    const { env, place } = environment({ closeAt: () => null });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("no-entry-price");
    expect(place).not.toHaveBeenCalled();
  });

  it("submits nothing on an empty account rather than a zero-size order", async () => {
    const { env, place } = environment({ equity: () => new Decimal(0) });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("no-equity");
    expect(place).not.toHaveBeenCalled();
  });
});

describe("the sink that wraps a firing", () => {
  it("announces first and submits second, so a bot's firing is still heard", async () => {
    const { env, place } = environment();
    const inner = vi.fn();

    withBotOrders(inner, env)(firingOf(botDocument()));
    await vi.waitFor(() => expect(place).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("leaves an alert alone", async () => {
    const { env, place } = environment();
    const alert = botDocument();
    alert.action = { consequence_level: "notify" };
    const inner = vi.fn();

    withBotOrders(inner, env)(firingOf(alert));
    await Promise.resolve();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(place).not.toHaveBeenCalled();
  });

  it("announces even when the order is refused", async () => {
    const { env } = environment({ paperEnabled: () => false });
    const inner = vi.fn();
    const onRefusal = vi.fn();

    withBotOrders(inner, env, onRefusal)(firingOf(botDocument()));
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledTimes(1);
    expect(onRefusal.mock.calls[0][1]).toBe("paper-trading-off");
  });

  it("says why once per rule, not once per candle", async () => {
    const { env } = environment({ paperEnabled: () => false });
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);
    const firing = firingOf(botDocument());

    // A 1m bot with paper trading off would otherwise produce a warning a
    // minute, which is a warning a trader learns to dismiss unread.
    sink(firing);
    sink(firing);
    sink(firing);
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(onRefusal).toHaveBeenCalledTimes(1);
  });
});
