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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0704 — an action price was checked for shape only. `actionValidation.ts`
 * answers "is this a positive number", never "could the model have read it
 * from the context it was given". A rounded sub-cent price (0.0123456 → 0.01)
 * is a 19 % error and an invented level has no bound at all; both reached the
 * trade form after one confirmation click.
 *
 * This module answers the second question. It produces evidence for the
 * confirmation UI, not a gate: the user still decides, and correcting a value
 * automatically is explicitly out of scope. It stays pure and store-free so it
 * is testable on its own.
 */

import { toFiniteNumber } from "./actionValidation";

/**
 * How far a price may sit from a context value and still count as that value.
 * Relative, so it holds for BTC and for sub-cent assets alike. 0.1 % sits far
 * above rounding noise and far below a magnitude error: rounding 82209.4676 to
 * 82209.47 is 0.000003 %, while 0.0123456 → 0.01 is 19 %.
 */
export const PRICE_MATCH_TOLERANCE = 0.001;

/**
 * A level a trade could actually use sits within this factor of the live
 * price. It keeps percentages and scores in the context (RSI 44.5, a
 * confluence score of 2) from vouching for a price on a sub-dollar asset,
 * where the magnitudes collide.
 */
export const PRICE_BAND = 5;

/** Actions whose `value` is a price the trade form will use. */
const PRICE_ACTIONS: ReadonlySet<string> = new Set([
  "setEntryPrice",
  "setStopLoss",
  "setTakeProfit",
  "addTakeProfit",
]);

/** Context branches that can carry a price. Portfolio, news and stats cannot. */
const PRICE_BRANCHES = [
  "marketDetails",
  "technicals",
  "tradeSetup",
  "openPositions",
] as const;

/**
 * The part of `AiContext` this check reads. Declared structurally so the module
 * does not import the store; `AiContext` is assignable to it.
 */
export interface PriceCheckContext {
  REAL_TIME_PRICE?: string;
  marketDetails?: Record<string, unknown> | null;
  technicals?: Record<string, unknown> | null;
  tradeSetup?: Record<string, unknown>;
  openPositions?: Array<Record<string, unknown>>;
}

/** The part of an AI action this check reads. */
export interface PriceActionLike {
  action: string;
  value?: unknown;
  index?: number;
}

/** One price the confirmation UI should flag before the user applies it. */
export interface UnverifiedPrice {
  action: string;
  index?: number;
  value: string;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = toFiniteNumber(value);
  return parsed !== null && Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null;
}

/** Every price-like value the model could have cited from the context. */
function collectCandidates(
  context: PriceCheckContext | null | undefined,
): number[] {
  if (!context) return [];
  const found: number[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || node === null || node === undefined) return;
    const scalar = asPositiveNumber(node);
    if (scalar !== null) {
      found.push(scalar);
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, depth + 1);
      return;
    }
    if (typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) {
        visit(value, depth + 1);
      }
    }
  };
  visit(context.REAL_TIME_PRICE, 0);
  for (const branch of PRICE_BRANCHES) visit(context[branch], 0);
  return found;
}

function readLivePrice(
  context: PriceCheckContext | null | undefined,
): number | null {
  const direct = asPositiveNumber(context?.REAL_TIME_PRICE);
  if (direct !== null) return direct;
  return asPositiveNumber(context?.marketDetails?.currentPrice);
}

/**
 * The price actions that match no context level within
 * `PRICE_MATCH_TOLERANCE`. Empty when the context is missing or carries no
 * price at all: an unverifiable value is not evidence of a wrong one, and a
 * warning on every action would train the user to click past it.
 */
export function findUnverifiedPrices(
  actions: readonly PriceActionLike[],
  context: PriceCheckContext | null | undefined,
): UnverifiedPrice[] {
  if (!context) return [];
  const all = collectCandidates(context);
  if (all.length === 0) return [];

  const live = readLivePrice(context);
  // With a live price the band always keeps at least the live price itself.
  const candidates =
    live === null
      ? all
      : all.filter((price) => price >= live / PRICE_BAND && price <= live * PRICE_BAND);

  const unverified: UnverifiedPrice[] = [];
  for (const action of actions) {
    if (!PRICE_ACTIONS.has(action.action)) continue;
    const price = asPositiveNumber(action.value);
    // A percent-only take profit carries no price, and shape validation has
    // already dropped non-numbers, so there is nothing to check here.
    if (price === null) continue;

    const verified = candidates.some(
      (candidate) =>
        Math.abs(price - candidate) <=
        Math.abs(candidate) * PRICE_MATCH_TOLERANCE,
    );
    if (!verified) {
      unverified.push({
        action: action.action,
        ...(typeof action.index === "number" ? { index: action.index } : {}),
        value: String(action.value),
      });
    }
  }
  return unverified;
}
