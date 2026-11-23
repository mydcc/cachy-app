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
import type { FiringSink, RuleFiring } from "./ruleEvaluationLoop";
import { BOT_PAPER_ONLY_MESSAGE_KEY } from "../orderGate";
import { isSpentAfterFiring } from "../../stores/alerts.svelte";

// BUG-0491: the composition below drives the real gate, so the real core
// must stay out of it — the verdicts are the test's, not the market's.
vi.mock("../../lib/rules/ruleSchema", () => ({
  ruleSchema: {
    warmupCandles: () => 1,
    evaluate: () => ({ verdict: "fires" }),
    // FEAT-0806: the plan's strategy hash comes from the same module the
    // engine trusts. The fake lands here BEFORE the implementation, so a
    // RED fails on the missing plan fields rather than a mock crash.
    contentHash: () => "c0ffee".padEnd(64, "0"),
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

function firingOf(rule: RuleDocument, anchorMs = ANCHOR_MS): RuleFiring {
  return { rule, verdict: { verdict: "fires" } as Verdict, anchorMs };
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
    // FEAT-0822 — the guard ports, defaulted to "nothing on record": a
    // test that does not seed them asserts the defaults, not the guards.
    entryActivityOf: () => ({ total: 0, day: "", today: 0 }),
    recordEntry: vi.fn(),
    ownedPositionsOf: () => [],
    restingOrders: () => [],
    recordGuard: () => {},
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

  it("stamps the bot's attribution on the plan (FEAT-0806)", async () => {
    const doc = botDocument();
    const { env, place } = environment();

    expect(await submitBotOrder(firingOf(doc), env)).toBeNull();

    // Identity travels in origin's lane (BUG-0494), as one shape. Today a
    // bot is its rule (botStore), so botId and ruleId carry the same id
    // under the name the overview will group by and the name the store
    // looks up; they split apart only when a bot becomes an entity of its
    // own (ADR-0026's lifecycle).
    const plan = place.mock.calls[0][0];
    expect(plan).toMatchObject({
      origin: "bot",
      attribution: {
        botId: doc.id,
        ruleId: doc.id,
        strategyHash: "c0ffee".padEnd(64, "0"),
      },
    });
    // The book's contract for a strategy hash is 64 lowercase hex (the core
    // pins the real one); the fake honors it, so the plan-level shape is
    // asserted here too.
    expect(plan.attribution.strategyHash).toMatch(/^[0-9a-f]{64}$/);
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
    // trade. `isBot` stays the bots-surface predicate; the submission gate
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
    // trigger closes — a new anchor each time, which is what a 1m bot on a
    // busy series actually produces. `hasOpenPosition` flips the way a real
    // book does: after the first entry settles, the symbol carries that
    // direction.
    const STEP_MS = 3_600_000;
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
      sink(firingOf(rule, ANCHOR_MS + i * STEP_MS));
      // Let the whole chain settle, so the next firing races against nothing.
      await settle();
    }

    expect(placed).toEqual(["long"]);
    // One refusal, not eight: `reported` keeps each reason to one message per
    // rule, and a bot refusing eight times needs to say it once.
    expect(onRefusal).toHaveBeenCalledTimes(1);
    expect(onRefusal.mock.calls[0][1]).toBe("position-already-open");
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

  it("admits two independent rules at the same time", async () => {
    // The in-flight guard is a `Set` keyed by rule id, and that is the whole
    // reason it is a Set: two bots are two slots. A future "simplification" to
    // a single busy flag would serialise independent bots against each other —
    // and every other case in this file would stay green, because they all use
    // one rule. Verified by replacing the Set with a boolean: 34 passed.
    //
    // FEAT-0822 gives "independent" a sharper meaning: two bots on the same
    // (symbol, side) slot are NOT independent — one of them loses the
    // reservation, in its own test below. Independence here means different
    // slots, which is the only shape a fleet of bots actually fans out into.
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal);

    const first = botDocument();
    first.id = "bot-a";
    const second = botDocument();
    second.id = "bot-b";
    second.symbol = "ETHUSDT";

    sink(firingOf(first));
    sink(firingOf(second));

    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));
    expect(onRefusal).not.toHaveBeenCalled();

    release(0);
    release(1);
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

/**
 * FEAT-0805 — "the current conditional market order keeps working unchanged".
 *
 * A stage-2 bot as it was written before the epic: no `exits`, no
 * `firing_policy`, no limits, no `entry_mode`, and the default `once`
 * frequency. Driven through the real gate and the real sink, it must still
 * place one market entry with its fixed stop and no target, and then be
 * finished. The key set is pinned so a stage-3 field leaking onto this plan
 * (a reduce flag, a take profit, an exit lane) fails here by name.
 */
describe("the stage-2 conditional market order is unchanged — FEAT-0805", () => {
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

  it("places one market entry with its fixed stop, then is finished", async () => {
    const rule = botDocument();
    // Arrange: nothing the epic added is on the document.
    for (const field of [
      "exits",
      "firing_policy",
      "max_positions",
      "max_entries_per_day",
      "max_risk_per_position",
      "budget_cap",
      "entry_mode",
      "frequency",
    ]) {
      expect(rule, `pre-epic document carries ${field}`).not.toHaveProperty(field);
    }
    const { env, place } = environment();
    const announce = vi.fn();
    const sink = withBotOrders(announce, env);
    const gate = new RuleEvaluationGate();

    // Act: the first closed candle fires.
    const first = candleContext(5);
    const verdict = gate.evaluate(rule, first.ctx, first.anchorMs);
    expect(verdict).toEqual({ verdict: "fires" });
    sink({ rule, verdict: verdict as Verdict, anchorMs: first.anchorMs });
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    await settle();

    // Assert: announced, and exactly the stage-2 plan.
    expect(announce).toHaveBeenCalledTimes(1);
    const plan = place.mock.calls[0][0];
    expect(Object.keys(plan).sort()).toEqual(
      [
        "accountSize",
        "attribution",
        "entryPrice",
        "entryType",
        "exchange",
        "origin",
        "qty",
        "riskPercentage",
        "stopLossPrice",
        "symbol",
        "takeProfits",
        "tradeType",
      ].sort(),
    );
    expect(plan).toMatchObject({
      origin: "bot",
      tradeType: "long",
      entryType: "market",
      takeProfits: [],
    });
    expect(plan.qty.toString()).toBe("0.002");
    expect(plan.stopLossPrice.toString()).toBe("49000");

    // Under the default `once` frequency the bot is finished. The gate does
    // not own that — the announcing sink this one wraps disarms the rule
    // (`notifyingRuleSink`, pinned in `alerts_firingSink.test.ts`) — so what
    // is asserted here is that the pre-epic document still reads as spent.
    expect(isSpentAfterFiring(rule)).toBe(true);
    // And the order lane adds no second gate of its own: a later firing that
    // did reach the sink would order again. Stage 3 changed nothing about
    // who ends a stage-2 bot.
    const second = candleContext(6);
    const again = gate.evaluate(rule, second.ctx, second.anchorMs);
    expect(again).toEqual({ verdict: "fires" });
    sink({ rule, verdict: again as Verdict, anchorMs: second.anchorMs });
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));
  });
});

describe("FEAT-0822 — the firing policy, the limits, and the slot reservation", () => {
  function pendingPlace() {
    // The gates-array shape from the FEAT-0488 suite above: a stable
    // `release(i)`, because rebinding a captured `release` inside the
    // promise executor never reaches a caller that destructured it.
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

  function guardedRule(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return { ...botDocument(), ...overrides };
  }

  it("refuses the second bot on a (symbol, side) slot, naming the race", async () => {
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const guardLog = vi.fn();
    const sink = withBotOrders(vi.fn(), { ...env, recordGuard: guardLog }, onRefusal);

    // Same symbol, same direction, same close: the netting window
    // `hasOpenPosition`'s own documentation names. The reservation is the
    // one thing that closes it synchronously.
    const first = guardedRule({ id: "bot-a" });
    const second = guardedRule({ id: "bot-b" });

    sink(firingOf(first));
    sink(firingOf(second));

    expect(place).toHaveBeenCalledTimes(1);
    expect(onRefusal).toHaveBeenCalledWith(expect.objectContaining({ rule: second }), "slot-reserved");
    // The loser's suppression lands in the guard log with its anchor.
    expect(guardLog).toHaveBeenCalledWith("bot-b", "slot-reserved", ANCHOR_MS);

    release(0);
    await settle();
  });

  it("releases the reservation when the submission settles, so the next close may re-take the slot", async () => {
    const { place, release } = pendingPlace();
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onRefusal = vi.fn();
    const onInFlight = vi.fn();
    const sink = withBotOrders(vi.fn(), env, onRefusal, onInFlight);

    sink(firingOf(guardedRule({ id: "bot-a" })));
    sink(firingOf(guardedRule({ id: "bot-b" })));
    expect(place).toHaveBeenCalledTimes(1);

    release(0);
    await settle();
    // The in-flight observer fires at sink creation, when the slot is
    // taken, and when the chain settles — its count here says the
    // `finally` ran at all.
    expect(onInFlight).toHaveBeenCalledTimes(3);

    // The winner settled (entry landed, then the book guard owns the next
    // close); the loser's next firing may take the slot it lost.
    sink(firingOf(guardedRule({ id: "bot-b" })));
    await vi.waitFor(() => expect(place).toHaveBeenCalledTimes(2));
    release(1);
    await settle();
  });

  it("expires a once bot after the first landed entry, never after a refused attempt", async () => {
    const entries = vi.fn(() => ({ total: 0, day: "", today: 0 }));
    const { env, place } = environment({
      entryActivityOf: entries as unknown as BotOrderEnvironment["entryActivityOf"],
    });

    const once = guardedRule({ firing_policy: "once" });
    await new Promise<void>((resolve) => {
      const inner: FiringSink = () => resolve();
      withBotOrders(inner, env, vi.fn())(firingOf(once));
    });
    await settle();
    expect(place).toHaveBeenCalledTimes(1);
    // The entry landed, so the counter counted it — the call, not the
    // fixture's existence, is the fact under test.
    expect(env.recordEntry).toHaveBeenCalledWith(once.id);

    // Total 1: the same document refuses from here on.
    const refused = await submitBotOrder(firingOf(guardedRule({ firing_policy: "once" })), {
      ...env,
      entryActivityOf: () => ({ total: 1, day: "", today: 1 }),
    });
    expect(refused).toBe("policy-once");

    // A firing that never landed (total 0) may still try.
    const again = await submitBotOrder(firingOf(guardedRule({ firing_policy: "once" })), {
      ...env,
      entryActivityOf: () => ({ total: 0, day: "", today: 0 }),
    });
    expect(again).toBeNull();
  });

  it("refuses at the day cap the document states, in account words", async () => {
    const { env } = environment();
    const atCap = await submitBotOrder(
      firingOf(guardedRule({ max_entries_per_day: 3 })),
      { ...env, entryActivityOf: () => ({ total: 9, day: "2026-11-19", today: 3 }) },
    );
    expect(atCap).toBe("limit-entries-day");

    const belowCap = await submitBotOrder(
      firingOf(guardedRule({ max_entries_per_day: 3 })),
      { ...env, entryActivityOf: () => ({ total: 9, day: "2026-11-19", today: 2 }) },
    );
    expect(belowCap).toBeNull();
  });

  it("refuses at an explicit position cap before the book's own open guard", async () => {
    const { env } = environment();
    const row = { positionId: "p-1", symbol: "BTCUSDT", side: "long" as const, amount: "1", entryPrice: "50000" };

    const atCap = await submitBotOrder(firingOf(guardedRule({ max_positions: 2 })), {
      ...env,
      ownedPositionsOf: () => [row, row],
    });
    expect(atCap).toBe("limit-positions");

    // One row under a cap of two: the limit binds nothing, and the next
    // guard in line (here: none, the book reads closed) decides.
    const belowCap = await submitBotOrder(firingOf(guardedRule({ max_positions: 2 })), {
      ...env,
      ownedPositionsOf: () => [row],
    });
    expect(belowCap).toBeNull();
  });

  it("prices the risk ceiling against the entry being submitted", async () => {
    const { env } = environment();
    // Defaults: entry 50 000, stop 2 % below (49 000), 1 % of 10 000 equity
    // = 0.002 BTC, so the entry risks 0.002 × 1 000 = 2.
    const over = await submitBotOrder(firingOf(guardedRule({ max_risk_per_position: "1" })), env);
    expect(over).toBe("limit-risk");

    const atTheCeiling = await submitBotOrder(
      firingOf(guardedRule({ max_risk_per_position: "2" })),
      env,
    );
    expect(atTheCeiling).toBeNull();
  });

  it("prices the budget against the rows held plus the entry pending", async () => {
    const { env } = environment();
    const heldRow = {
      positionId: "p-1",
      symbol: "BTCUSDT",
      side: "long" as const,
      amount: "1",
      entryPrice: "50000",
    };
    const heldStop = { orderId: "o-1", symbol: "BTCUSDT", planType: "SL", triggerPrice: "49000", reduceOnly: true, positionId: "p-1" };

    // Held risk: 1 BTC entered at 50 000 with its stop resting at 49 000
    // still carries 1 000 of risk. The pending entry adds 2 (0.002 BTC over
    // the same 1 000 distance). A budget of 1 001 refuses the sum; 1 002
    // admits it.
    const over = await submitBotOrder(firingOf(guardedRule({ budget_cap: "1001" })), {
      ...env,
      ownedPositionsOf: () => [heldRow],
      restingOrders: () => [heldStop],
    });
    expect(over).toBe("limit-budget");

    const fits = await submitBotOrder(firingOf(guardedRule({ budget_cap: "1002" })), {
      ...env,
      ownedPositionsOf: () => [heldRow],
      restingOrders: () => [heldStop],
    });
    expect(fits).toBeNull();
  });

  it("refuses an entry against a budget it cannot measure, never prices it free", async () => {
    const { env } = environment();
    const heldRow = {
      positionId: "p-1",
      symbol: "BTCUSDT",
      side: "long" as const,
      amount: "1",
      entryPrice: "50000",
    };

    // The row's stop no longer rests (it filled, or was cancelled): its
    // risk is unknown, and a budget with an unknown component has no
    // provable room. Unknown was never zero — zero here admitted an entry
    // against a cap nobody could check.
    const unmeasured = await submitBotOrder(
      firingOf(guardedRule({ budget_cap: "1000000" })),
      {
        ...env,
        ownedPositionsOf: () => [heldRow],
        restingOrders: () => [],
      },
    );
    expect(unmeasured).toBe("limit-budget");

    // The same unknown with no budget stated binds nothing: the pure
    // function refuses only limits the document actually set.
    const unbound = await submitBotOrder(firingOf(guardedRule()), {
      ...env,
      ownedPositionsOf: () => [heldRow],
      restingOrders: () => [],
    });
    expect(unbound).toBeNull();
  });

  it("refuses outright when the book it would cap against is unreadable", async () => {
    const { env } = environment();

    // `null` is the degraded read — not "no owned rows", which would unbind
    // the position and budget caps exactly when the trader cannot check
    // them. Fail-closed, before any market read or limit arithmetic runs.
    const refused = await submitBotOrder(firingOf(guardedRule()), {
      ...env,
      ownedPositionsOf: () => null,
    });
    expect(refused).toBe("book-unreadable");
  });

  it("counts a landed entry once, and never counts an attempt that refused", async () => {
    const recordEntry = vi.fn();
    const { env, place } = environment({ recordEntry });
    const sink = withBotOrders(vi.fn(), env, vi.fn());

    sink(firingOf(guardedRule()));
    await settle();
    expect(recordEntry).toHaveBeenCalledTimes(1);
    expect(place).toHaveBeenCalledTimes(1);

    // A refused attempt (the day cap is the cheapest to bind) counts
    // nothing: `fired_count` counts attempts, the policy counts entries.
    const refused = await submitBotOrder(firingOf(guardedRule({ max_entries_per_day: 1 })), {
      ...env,
      entryActivityOf: () => ({ total: 1, day: "2026-11-19", today: 1 }),
    });
    expect(refused).toBe("limit-entries-day");
    expect(recordEntry).toHaveBeenCalledTimes(1);
  });
});

describe("FEAT-0807 — the in-flight observer", () => {
  function placementResult() {
    return {
      entryPlaced: true,
      stopLoss: "attached" as const,
      takeProfit: "none" as const,
      unprotected: false,
    };
  }

  it("notifies with the empty set at sink creation, so a re-init resets the projection", () => {
    const inner: FiringSink = vi.fn();
    const onInFlight = vi.fn();
    withBotOrders(inner, environment().env, vi.fn(), onInFlight);

    expect(onInFlight).toHaveBeenCalledTimes(1);
    expect(onInFlight.mock.calls[0][0]).toEqual(new Set());
  });

  it("notifies with the rule id while the submission travels, and again when it settles", async () => {
    const result = placementResult();
    let release: () => void = () => {};
    const place = vi.fn(
      () =>
        new Promise<typeof result>((resolve) => {
          release = () => resolve(result);
        }),
    );
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onInFlight = vi.fn();
    const sink = withBotOrders(vi.fn() as unknown as FiringSink, env, vi.fn(), onInFlight);

    sink(firingOf(botDocument()));
    expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set(["bot-1"]));

    release();
    await settle();
    expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set());
  });

  it("releases the slot — and notifies — even when the order path throws", async () => {
    const place = vi.fn(async () => {
      throw new Error("gate refused");
    });
    const { env } = environment({ place } as Partial<BotOrderEnvironment>);
    const onInFlight = vi.fn();
    const sink = withBotOrders(vi.fn() as unknown as FiringSink, env, vi.fn(), onInFlight);

    sink(firingOf(botDocument()));
    await settle();

    // A throw that leaked the slot would leave a phantom "submitting" in
    // the projection for the rest of the session — FEAT-0488's failure
    // direction, now observed instead of assumed.
    expect(onInFlight.mock.calls.at(-1)?.[0]).toEqual(new Set());
  });
});
