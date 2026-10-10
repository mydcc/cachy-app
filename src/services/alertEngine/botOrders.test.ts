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

import type {
  BotAnchorSnapshot,
  EvaluationContext,
  RuleDocument,
  SizeBasis,
  Verdict,
} from "../../lib/rules/types";
import { RuleEvaluationGate, type BotAnchorPersistence } from "../../lib/rules/ruleEvaluationGate";
import {
  quantityFor,
  riskPercentageFor,
  stopPriceFor,
  submitBotOrder,
  withBotOrders,
  type BotOrderEnvironment,
} from "./botOrders";
import type { RuleFiring } from "./ruleEvaluationLoop";
import { BOT_PAPER_ONLY_MESSAGE_KEY } from "../orderGate";

// BUG-0491: the composition below drives the real gate, so the real core
// must stay out of it — the verdicts are the test's, not the market's.
vi.mock("../../lib/rules/ruleSchema", () => ({
  ruleSchema: {
    warmupCandles: () => 1,
    evaluate: () => ({ verdict: "fires" }),
  },
}));

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

/**
 * Let a submission settle all the way through — including FEAT-0488's in-flight
 * guard releasing its slot in `finally`.
 *
 * The release is the last link in the promise chain, so a firing issued in the
 * same tick as the previous one is refused as concurrent even though the
 * previous submission is long done. Real firings arrive a whole trigger
 * timeframe apart. A test that fires back to back has to say which of the two
 * things it means, and this says "settled".
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    livePrice: () => new Decimal("50000"),
    hasOpenPosition: () => false,
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

  it("submits nothing while a position in that direction is already open", async () => {
    const { env, place } = environment({ hasOpenPosition: () => true });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("position-already-open");
    expect(place).not.toHaveBeenCalled();
  });

  it("asks the position book about the direction the intent names", async () => {
    // `Position.side` and `PaperPosition.side` are long/short; `OrderIntent.side`
    // is buy/sell. This pins the mapping — a bot that asked about "buy" would
    // pass a check the book can never answer, and the guard would be inert.
    const hasOpenPosition = vi.fn(() => false);
    const short = botDocument();
    short.action.order!.side = "sell";
    const { env, place } = environment({ hasOpenPosition });

    expect(await submitBotOrder(firingOf(short), env)).toBeNull();

    expect(hasOpenPosition).toHaveBeenCalledWith("BTCUSDT", "short");
    expect(place).toHaveBeenCalledTimes(1);
  });

  it("names the gate over the position the trader can fix by editing", async () => {
    // Both are true here. The refusal ladder reports shape before state: a bot
    // with paper trading switched off did not act because of the switch, and
    // saying "your position is already open" sends the trader to the wrong
    // control.
    const { env, place } = environment({ paperEnabled: () => false, hasOpenPosition: () => true });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("paper-trading-off");
    expect(place).not.toHaveBeenCalled();
  });

  it("submits nothing for a reduce-only intent, and says that is the reason", async () => {
    // The hazard the reason exists to close: `EntryPlan` carries no reduce
    // flag, so an intent that says "close exposure" would open some. The core
    // refuses a reduce-only intent that also carries a stop, so this document
    // has none — which means the assertion worth making is that the refusal
    // reads `reduce-only-unsupported` and not `no-stop`. Both stop the order;
    // only one of them survives a future that relaxes the stop requirement.
    const closing = botDocument("percent_of_equity", "1", null);
    closing.action.order!.reduce_only = true;
    const { env, place } = environment();

    expect(await submitBotOrder(firingOf(closing), env)).toBe("reduce-only-unsupported");
    expect(place).not.toHaveBeenCalled();
  });

  it("submits nothing for a bot whose action carries no intent at all", async () => {
    // `isBot` keys off the consequence level alone, so this document is a bot
    // with nothing to place. It names its own reason rather than borrowing the
    // stop's.
    const empty = botDocument();
    empty.action = { consequence_level: "simulate" };
    const { env, place } = environment();

    expect(await submitBotOrder(firingOf(empty), env)).toBe("no-order");
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

  it("reports paper-trading-off when the stamped order was refused downstream — BUG-0494", async () => {
    // The flip case: paper was on at the pre-check and off when the gate or
    // the transport saw the stamped order. `placeEntryGroup` reports that
    // refusal as a result rather than throwing, so without this mapping the
    // trader's toast would never fire.
    const place = vi.fn(async () => ({
      entryPlaced: false,
      stopLoss: "none" as const,
      takeProfit: "none" as const,
      unprotected: false,
      errorKey: BOT_PAPER_ONLY_MESSAGE_KEY,
      refusal: {
        field: "mode",
        reason: "unsupported",
        messageKey: BOT_PAPER_ONLY_MESSAGE_KEY,
        values: {},
      },
    }));
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("paper-trading-off");
    expect(place).toHaveBeenCalledTimes(1);
    // BUG-0494 — the stamp is what the downstream refusal keys off. Without
    // this assertion the `origin: "bot"` line could be deleted and every
    // test would stay green.
    expect(place.mock.calls[0][0]).toMatchObject({ origin: "bot" });
  });

  it("does not mistake any other failed placement for a paper refusal", async () => {
    const place = vi.fn(async () => ({
      entryPlaced: false,
      stopLoss: "none" as const,
      takeProfit: "none" as const,
      unprotected: false,
      errorKey: "orderEntry.errors.entryRejected",
    }));
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);

    // Any other failure keeps today's behaviour: no invented cause.
    expect(await submitBotOrder(firingOf(botDocument()), env)).toBeNull();
  });
});

describe("live-price sizing — BUG-0489", () => {
  // percent_risk carries the entry price twice (quantity and stop distance),
  // so it is the basis that drifts the most when sized from a stale close.
  function percentRiskBot(): RuleDocument {
    return botDocument("percent_risk", "1", { basis: "percent_of_entry", distance: "2" });
  }

  it("sizes quantity, stop and declared risk from the live price, not the anchor close", async () => {
    // Anchor close 50000, live 50200 (0.4% — inside the staleness tripwire).
    const { env, place } = environment({ livePrice: () => new Decimal("50200") });

    expect(await submitBotOrder(firingOf(percentRiskBot()), env)).toBeNull();

    const live = new Decimal("50200");
    const equity = new Decimal("10000");
    const stop = stopPriceFor(live, "buy", { basis: "percent_of_entry", distance: "2" });
    const qty = quantityFor(
      { side: "buy", size_basis: "percent_risk", size: "1" },
      equity,
      live,
      stop,
    );
    expect(place).toHaveBeenCalledTimes(1);
    const plan = place.mock.calls[0][0];
    expect(plan.entryPrice.toString()).toBe("50200");
    expect(plan.stopLossPrice.toString()).toBe(stop.toString());
    expect(plan.qty.toString()).toBe(qty.toString());
    // The gate re-derives an `open`'s size from this number (FEAT-0011), so it
    // must agree with the quantity actually submitted.
    expect(plan.riskPercentage.toString()).toBe(
      riskPercentageFor(qty, equity, live, stop).toString(),
    );
  });

  it("refuses rather than falling back to the stale close when no live price is held", async () => {
    const { env, place } = environment({ livePrice: () => null });

    expect(await submitBotOrder(firingOf(percentRiskBot()), env)).toBe("no-live-price");
    expect(place).not.toHaveBeenCalled();
  });

  it("withholds the order when the market ran away from the fired candle", async () => {
    // 51000 against an anchor of 50000 is 2% — past the 1% tripwire. A fill
    // there is not the trade the document describes.
    const { env, place } = environment({ livePrice: () => new Decimal("51000") });

    expect(await submitBotOrder(firingOf(percentRiskBot()), env)).toBe("stale-anchor-price");
    expect(place).not.toHaveBeenCalled();
  });

  it("still refuses a firing whose candle is no longer held", async () => {
    const { env, place } = environment({ closeAt: () => null });

    expect(await submitBotOrder(firingOf(botDocument()), env)).toBe("no-entry-price");
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
    //
    // Settled between firings, because a back-to-back second firing is refused
    // for a *different* reason — FEAT-0488's in-flight guard — and this case is
    // about the dedup of one reason, not about which reason a burst produces.
    sink(firing);
    await settle();
    sink(firing);
    await settle();
    sink(firing);
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(onRefusal).toHaveBeenCalledTimes(1);
  });

  it("refuses a send-level rule loudly instead of dropping its order intent — BUG-0487", async () => {
    // A `send` document is fully formed by the time it reaches this gate, but
    // there is no `send` path until FEAT-0035. The old code took the silent
    // `return` branch, indistinguishable from an alert that never meant to
    // trade. `isBot` stays the Automation-tab predicate; the submission gate
    // asks its own question.
    const send = botDocument();
    send.action = {
      consequence_level: "send",
      order: { side: "buy", size_basis: "base_quantity", size: "0.01" },
    };
    const { env, place } = environment();
    const inner = vi.fn();
    const onRefusal = vi.fn();

    withBotOrders(inner, env, onRefusal)(firingOf(send));
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(inner).toHaveBeenCalledTimes(1);
    expect(onRefusal.mock.calls[0][1]).toBe("level-not-supported");
    expect(place).not.toHaveBeenCalled();
  });

  it("reports the send-level refusal once per rule, not once per candle", async () => {
    const send = botDocument();
    send.action = {
      consequence_level: "send",
      order: { side: "buy", size_basis: "base_quantity", size: "0.01" },
    };
    const { env } = environment();
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);
    const firing = firingOf(send);

    sink(firing);
    sink(firing);
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(onRefusal).toHaveBeenCalledTimes(1);
  });

  it("never lets a level that does not submit reach the position book", async () => {
    // AC: the reader is reachable only from the `simulate` path. A `notify` rule
    // returns above it and a `send` rule returns on its own refusal, so a spy
    // that throws on call is the assertion — it cannot fail quietly the way an
    // ordinary call-count can.
    const hasOpenPosition = vi.fn(() => {
      throw new Error("the position book must not be read for a rule that does not submit");
    });
    const { env, place } = environment({ hasOpenPosition });
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);

    // A `notify` rule produces no refusal of any kind, so there is nothing to
    // wait for here — flushing the chain is the whole sequence.
    const alert = botDocument();
    alert.action = { consequence_level: "notify" };
    sink(firingOf(alert));
    await settle();
    expect(onRefusal).not.toHaveBeenCalled();

    const send = botDocument();
    send.action = {
      consequence_level: "send",
      order: { side: "buy", size_basis: "base_quantity", size: "0.01" },
    };
    sink(firingOf(send));
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalledTimes(1));

    expect(onRefusal.mock.calls[0][1]).toBe("level-not-supported");
    expect(hasOpenPosition).not.toHaveBeenCalled();
    expect(place).not.toHaveBeenCalled();
  });
});

describe("one submission in flight per rule — FEAT-0488", () => {
  /**
   * A `place` that stays pending until the test releases it, one gate per call.
   *
   * Two submissions in flight against the same rule is the case this guards;
   * a `place` that resolves immediately can never produce it, so the control
   * case below is what proves the guard is doing the work rather than the
   * timing.
   */
  function pendingPlace() {
    const gates: Array<() => void> = [];
    const place = vi.fn(async () => {
      await new Promise<void>((resolve) => gates.push(resolve));
      return {
        entryPlaced: true,
        stopLoss: "attached" as const,
        takeProfit: "none" as const,
        unprotected: false,
      };
    });
    return { place, release: (i: number) => gates[i]?.() };
  }

  it("places one order when two firings arrive before the first settles", async () => {
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);

    sink(firingOf(botDocument()));
    sink(firingOf(botDocument()));

    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());
    expect(place).toHaveBeenCalledTimes(1);
    expect(onRefusal.mock.calls[0][1]).toBe("submission-in-flight");

    release(0);
  });

  it("still announces the firing it refused", async () => {
    // A refusal that swallowed the announcement would leave a trader watching
    // a bot that says nothing at all.
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const inner = vi.fn();
    const sink = withBotOrders(inner, env, () => {});

    sink(firingOf(botDocument()));
    sink(firingOf(botDocument()));
    await Promise.resolve();

    expect(inner).toHaveBeenCalledTimes(2);

    release(0);
  });

  it("admits a later firing once the previous one has settled", async () => {
    // The guard bounds concurrency, not the rule: a settled submission must
    // leave no trace, or a rule would fire exactly once per session.
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const sink = withBotOrders(vi.fn(), env, () => {});

    sink(firingOf(botDocument()));
    sink(firingOf(botDocument()));
    await Promise.resolve();
    release(0);
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    await settle();

    sink(firingOf(botDocument()));
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));

    release(1);
  });

  it("releases the guard when a submission rejects rather than returning", async () => {
    // `.finally`, not `.then`. A throw that leaked the slot would silence the
    // rule for the rest of the session, and a rule that never submits again
    // looks exactly like a strategy that stopped finding setups.
    let attempt = 0;
    const place = vi.fn(async () => {
      if (attempt++ === 0) throw new Error("venue refused");
      return {
        entryPlaced: true,
        stopLoss: "attached" as const,
        takeProfit: "none" as const,
        unprotected: false,
      };
    });
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);

    sink(firingOf(botDocument()));
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    await settle();

    sink(firingOf(botDocument()));
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));

    // No in-flight refusal: a throw that never released the guard would show
    // up here as one, and the log line is not what this test is about.
    expect(onRefusal).not.toHaveBeenCalled();
  });

  it("bounds a rule's entries by what is open, not by what it opened itself", async () => {
    // The count the exposure check exists to bound, driven over consecutive
    // trigger closes. `hasOpenPosition` flips the way a real book does: after
    // the first entry settles, the symbol carries that direction.
    let open = false;
    const placed: string[] = [];
    const place = vi.fn(async (plan: { tradeType: string }) => {
      placed.push(plan.tradeType);
      open = true;
      return {
        entryPlaced: true,
        stopLoss: "attached" as const,
        takeProfit: "none" as const,
        unprotected: false,
      };
    });
    const { env } = environment({
      place,
      hasOpenPosition: () => open,
    } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);

    for (let i = 0; i < 8; i++) {
      const rule = botDocument();
      rule.frequency = "every_time";
      sink(firingOf(rule));
      // Let the whole chain settle, so the next firing races against nothing.
      await settle();
    }

    expect(placed).toEqual(["long"]);
    expect(onRefusal.mock.calls.at(-1)?.[1]).toBe("position-already-open");
  });

  it("refuses a bot that would stack onto a position it did not open", async () => {
    // The case a per-rule memory cannot see: the position was already there
    // when this rule first fired. Every other guard in this file would still
    // pass it, which is exactly why this one exists.
    const { env, place } = environment({ hasOpenPosition: () => true });
    const onRefusal = vi.fn();

    withBotOrders(vi.fn(), env, onRefusal)(firingOf(botDocument()));
    await vi.waitFor(() => expect(onRefusal).toHaveBeenCalled());

    expect(place).not.toHaveBeenCalled();
    expect(onRefusal.mock.calls[0][1]).toBe("position-already-open");
  });
});

describe("no second order on the same candle after a reload — BUG-0491", () => {
  const STEP_MS = 3_600_000;

  function candleContext(n: number): { ctx: EvaluationContext; anchorMs: number } {
    const candles = Array.from({ length: n }, (_, i) => ({
      open_time_ms: ANCHOR_MS + i * STEP_MS,
      open: "50000",
      high: "50000",
      low: "50000",
      close: "50000",
      volume: "1",
    }));
    return { ctx: { candles: { "1h": candles } }, anchorMs: ANCHOR_MS + (n - 1) * STEP_MS };
  }

  function persistentAnchors() {
    const stored = new Map<string, BotAnchorSnapshot>();
    const persistence: BotAnchorPersistence = {
      isBotRule: (doc) => doc.action?.consequence_level === "simulate",
      load: (ruleId) => {
        const snapshot = stored.get(ruleId);
        return snapshot ? { ...snapshot } : undefined;
      },
      save: (ruleId, snapshot) => {
        stored.set(ruleId, { ...snapshot });
      },
      clear: (ruleId) => {
        stored.delete(ruleId);
      },
    };
    return persistence;
  }

  function expectFiring(verdict: unknown): asserts verdict is Verdict {
    expect(verdict).toEqual({ verdict: "fires" });
    if (!verdict || typeof verdict !== "object" || !("verdict" in verdict)) {
      throw new Error("test setup: expected the bot to fire");
    }
  }

  it("places exactly one entry across a gate rebuild on the same candle", async () => {
    const persistence = persistentAnchors();
    const rule: RuleDocument = { ...botDocument(), frequency: "every_time" };
    const { env, place } = environment();
    const sink = withBotOrders(vi.fn(), env);
    const { ctx, anchorMs } = candleContext(5);

    // Pre-reload session: the bot fires on the candle and orders once.
    const verdict = new RuleEvaluationGate(persistence).evaluate(rule, ctx, anchorMs);
    expectFiring(verdict);
    sink({ rule, verdict, anchorMs });
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    // FEAT-0488 — let that submission *settle*, not merely be called. The
    // in-flight guard holds its slot until the promise chain drains, so a later
    // firing issued in the same tick would be refused as concurrent. Real
    // firings are a whole trigger timeframe apart; without this tick the test
    // would be asserting the guard's timing rather than the anchor gate, and
    // deleting the line would make it fail for a reason it never mentions.
    await settle();

    // Reload: a fresh gate, the same rule still armed, the same candle still
    // newest. The gate withholds it, so the sink never runs and no second
    // entry is placed — the paper balance keeps exactly one position.
    const rebuilt = new RuleEvaluationGate(persistence);
    expect(rebuilt.evaluate(rule, ctx, anchorMs)).toBeUndefined();
    expect(place).toHaveBeenCalledTimes(1);

    // A later candle still fires: `every_time` kept its meaning across
    // candles, so this is dedupe, not one-shot.
    const next = candleContext(6);
    const later = rebuilt.evaluate(rule, next.ctx, next.anchorMs);
    expectFiring(later);
    sink({ rule, verdict: later, anchorMs: next.anchorMs });
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));
  });
});
