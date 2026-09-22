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
 * FEAT-0396 — what happens when a bot's conditions hold.
 *
 * ## No second path
 *
 * ADR-0012 decision 5: "every automated order enters through the gate a human
 * click enters. No privileged path, no latency exception." So this builds the
 * same `EntryPlan` the calculator's Place Order panel builds and hands it to
 * the same `orderPlacementService.placeEntryGroup`. From there the route is
 * identical — `tradeService.placeOrder` → `gatedRequest` → `OrderGate` — and
 * FEAT-0013's risk limits apply to a bot's order because they sit inside that
 * gate, not because anything here re-implements them.
 *
 * `paperExchange` sits *behind* `tradeService.signedRequest`, so "goes to the
 * paper account" is a property of the transport rather than of a separate
 * route. That is why nothing in this file mentions the simulator.
 *
 * ## A decorator, not a sink
 *
 * `withBotOrders` wraps whichever sink the caller already chose, passes every
 * firing through unchanged, and only then looks at whether this one submits.
 * Announcing and acting are different consequences of one event, and a sink
 * that swallowed the announcement in order to place an order would be the
 * second dialect ADR-0012 decision 2 forbids.
 *
 * ## Two switches, both the trader's
 *
 * A bot submits only when the trader armed it *and* paper trading is on. The
 * second is not a safety net bolted on here — it is what this item's scope
 * means: a bot proposes an order into paper, and live sending is FEAT-0035.
 * A bot that cannot submit says so once, rather than sitting armed and silent.
 *
 * Class A (ADR-0001): the rule, the sizes and the simulated balance all stay
 * on the device. Nothing here logs a condition.
 */

import { Decimal } from "decimal.js";

import type { OrderIntent, StopDistance } from "../../lib/rules/types";
import { logger } from "../logger";
import { BOT_PAPER_ONLY_MESSAGE_KEY } from "../orderGate";
import type { orderPlacementService } from "../orderPlacementService";
import { isBot } from "./botStore";
import type { FiringSink, RuleFiring } from "./ruleEvaluationLoop";
import { readClosedCandles, readFormingCandles } from "./ruleLoopWiring";

/**
 * Where the stop sits, given the entry the order is about to take.
 *
 * Long stops sit below the entry and short stops above it — the side decides
 * the direction, so a document never has to carry one and cannot carry a
 * contradictory one.
 */
export function stopPriceFor(
  entryPrice: Decimal,
  side: OrderIntent["side"],
  stop: StopDistance,
): Decimal {
  const fraction = new Decimal(stop.distance).div(100);
  return side === "buy"
    ? entryPrice.times(new Decimal(1).minus(fraction))
    : entryPrice.times(new Decimal(1).plus(fraction));
}

/**
 * How large the position is, in the base asset.
 *
 * Each basis is its own formula on purpose. "2" is meaningless without saying
 * whether it is two contracts, two percent of equity or two percent of risk,
 * and this is the one place that turns the answer into a quantity — the core
 * deliberately carries no price, so it cannot do this itself.
 *
 * `percent_risk` divides by the distance to the stop, which is why the core
 * refuses that basis without one: the denominator would be zero and the
 * position unbounded.
 */
export function quantityFor(
  order: OrderIntent,
  equity: Decimal,
  entryPrice: Decimal,
  stopPrice: Decimal,
): Decimal {
  const size = new Decimal(order.size);

  switch (order.size_basis) {
    case "base_quantity":
      return size;
    case "quote_notional":
      return size.div(entryPrice);
    case "percent_of_equity":
      return equity.times(size).div(100).div(entryPrice);
    case "percent_risk":
      return equity.times(size).div(100).div(entryPrice.minus(stopPrice).abs());
  }
}

/**
 * What share of equity this position puts at risk, as a percentage.
 *
 * The gate re-derives an `open`'s size from exactly this number and refuses a
 * payload that disagrees (FEAT-0011), so it is computed from the quantity that
 * will actually be sent rather than from the intent that produced it. For
 * `percent_risk` the two coincide, which is the arithmetic checking itself.
 */
export function riskPercentageFor(
  quantity: Decimal,
  equity: Decimal,
  entryPrice: Decimal,
  stopPrice: Decimal,
): Decimal {
  return quantity.times(entryPrice.minus(stopPrice).abs()).div(equity).times(100);
}

/** Why a bot that fired did not submit. Developer-facing English. */
export type BotOrderRefusal =
  | "paper-trading-off"
  | "no-order"
  | "reduce-only-unsupported"
  | "no-stop"
  | "no-entry-price"
  | "no-equity"
  | "size-not-positive";

/**
 * The store reads this module needs, as ports rather than imports.
 *
 * Required, not defaulted: a service may not import a store
 * (`eslint.architecture.boundaries.js`), and the boundary is worth more than
 * the convenience — the store layer owns state, so the store layer is where the
 * real environment is assembled. `alerts.svelte.ts` builds it.
 *
 * The same discipline `RuleEvaluationLoop` uses for its candle readers, and it
 * buys the same thing: the arithmetic above is the part worth testing
 * exhaustively, and testing it should not require a paper account to exist.
 */
export interface BotOrderEnvironment {
  paperEnabled: () => boolean;
  equity: () => Decimal;
  exchange: () => string;
  /** The close of the candle the rule fired on, or null when it is not held. */
  closeAt: (symbol: string, timeframe: string, anchorMs: number) => Decimal | null;
  place: typeof orderPlacementService.placeEntryGroup;
}

/**
 * The candle the verdict was computed on, by open time.
 *
 * Looked up by `anchorMs` rather than taken as "the last one": a firing is
 * handled after the store has already applied it, and on a busy series the
 * newest candle may no longer be the one that fired. The closed series answers
 * ordinary rules and the forming series answers `intrabar` ones, which is the
 * same split the loop itself makes.
 */
export function closeAtAnchor(symbol: string, timeframe: string, anchorMs: number): Decimal | null {
  for (const read of [readClosedCandles, readFormingCandles]) {
    const candle = read(symbol, timeframe).find((c) => c.open_time_ms === anchorMs);
    if (candle) return new Decimal(candle.close);
  }
  return null;
}

/**
 * Turns one firing into an order, or says why it could not.
 *
 * Returns the refusal rather than throwing it: the caller is a sink on the
 * market hot path, and a bot whose size cannot be computed must not cost every
 * other rule its evaluation.
 */
export async function submitBotOrder(
  firing: RuleFiring,
  env: BotOrderEnvironment,
): Promise<BotOrderRefusal | null> {
  const order = firing.rule.action.order;
  // `isBot` keys off `consequence_level` alone, so a document whose level says
  // it submits but whose intent is missing reaches this line. `RuleAction`
  // refuses that combination, so this should be unreachable through the core —
  // which is exactly why it gets its own reason instead of borrowing another
  // one. A refusal that names the wrong cause is worse than no refusal: it
  // sends whoever reads the log looking for a stop that was never the problem.
  if (!order) return "no-order";

  if (!env.paperEnabled()) return "paper-trading-off";

  // Refused here rather than caught by the stop check below.
  //
  // `EntryPlan` carries no reduce flag and `orderPlacementService` knows none,
  // so a `reduce_only` intent submitted through this path would open exposure
  // instead of closing it — the precise opposite of what the document says.
  // The core keeps a `reduce_only` intent from carrying a stop
  // (`RefusalCode::StopNotHonoured`), so today such a bot would fall into
  // `no-stop` and stop there. That is an accident of two unrelated rules
  // lining up, not a decision: relax the stop requirement — an ATR basis, a
  // closing order that needs none — and the accident stops protecting anyone.
  // Closing an open position from a rule is FEAT-0035's scope, so until then
  // this says so in one line that cannot drift.
  if (order.reduce_only) return "reduce-only-unsupported";

  if (!order.stop) return "no-stop";

  const entryPrice = env.closeAt(firing.rule.symbol, firing.rule.trigger_timeframe, firing.anchorMs);
  if (!entryPrice || entryPrice.lte(0)) return "no-entry-price";

  const equity = env.equity();
  if (equity.lte(0)) return "no-equity";

  const stopPrice = stopPriceFor(entryPrice, order.side, order.stop);
  const quantity = quantityFor(order, equity, entryPrice, stopPrice);
  if (!quantity.isFinite() || quantity.lte(0)) return "size-not-positive";

  const result = await env.place({
    exchange: env.exchange(),
    symbol: firing.rule.symbol,
    // BUG-0494 — the provenance travels with the order. The pre-check above
    // reads mutable global state and the transport reads it again after an
    // `await` plus a module fetch; a switch flipped in between used to send
    // this to the real venue. Stamped `bot`, the gate and the transport
    // refuse it while paper trading is off instead of falling through.
    origin: "bot",
    tradeType: order.side === "buy" ? "long" : "short",
    entryType: "market",
    qty: quantity,
    entryPrice,
    stopLossPrice: stopPrice,
    // A rule says where to get out at a loss, never where to take profit:
    // there is no field for one, and inventing a target the trader did not
    // write is the opposite of what a checkable strategy is for.
    takeProfits: [],
    accountSize: equity,
    riskPercentage: riskPercentageFor(quantity, equity, entryPrice, stopPrice),
  });

  // BUG-0494 — the flip case lands here, not in the pre-check above: paper
  // was on when this ran and off when the gate or transport saw the stamped
  // order. `placeEntryGroup` reports a refusal as a result rather than
  // throwing, so without this the trader's toast would never fire. Only the
  // provenance refusal maps — anything else keeps today's behaviour, and a
  // refusal that names the wrong cause is worse than a silent one.
  if (!result.entryPlaced && result.refusal?.messageKey === BOT_PAPER_ONLY_MESSAGE_KEY) {
    return "paper-trading-off";
  }

  return null;
}

/**
 * Wraps a sink so that a fired bot also submits.
 *
 * Every firing reaches `inner` first and unchanged, including a bot's:
 * announcing and acting are two consequences of one event, and a trader who
 * armed a bot still wants to know it fired.
 *
 * `reported` keeps each reason to one message per rule. A bot firing on a 1m
 * series with paper trading switched off would otherwise produce a toast a
 * minute, and a warning that arrives that often is one a trader learns to
 * dismiss without reading.
 */
export function withBotOrders(
  inner: FiringSink,
  env: BotOrderEnvironment,
  onRefusal: (firing: RuleFiring, refusal: BotOrderRefusal) => void = logRefusal,
): FiringSink {
  const reported = new Set<string>();

  return (firing) => {
    inner(firing);
    if (!isBot(firing.rule)) return;

    void submitBotOrder(firing, env)
      .then((refusal) => {
        if (!refusal) return;
        const seen = `${firing.rule.id}:${refusal}`;
        if (reported.has(seen)) return;
        reported.add(seen);
        onRefusal(firing, refusal);
      })
      .catch((e: unknown) => {
        // The order path throws for reasons a bot cannot fix — a refused gate,
        // a venue that rejected the entry. `placeEntryGroup` already reports
        // those through its result; what must not happen is an unhandled
        // rejection taking the tab down from a background candle close.
        logger.error(
          "alerts",
          `bot ${firing.rule.id} could not submit: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
  };
}

/** The default report: say it in the log, once per rule and reason. */
export const logRefusal = (firing: RuleFiring, refusal: BotOrderRefusal): void => {
  logger.warn("alerts", `bot ${firing.rule.id} fired but submitted nothing: ${refusal}`);
};
