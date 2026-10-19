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

import { AI_PRICE_ACTIONS } from "./actionPolicy";
import type { ValidatedAiAction } from "./actionValidation";
import type { AiContext } from "../../stores/ai.svelte";
import { parseAiValue } from "../../utils/utils";

/**
 * How far a price may sit from a context level and still count as that level.
 * Relative, so it holds for BTC and for sub-cent assets alike. 0.1 % sits far
 * above rounding noise and far below a magnitude error: rounding 82209.4676 to
 * 82209.47 is 0.000003 %, while 0.0123456 → 0.01 is 19 %.
 */
export const PRICE_MATCH_TOLERANCE = 0.001;

/**
 * How deep a context branch may nest. The shapes are fixed and shallow; the
 * bound only exists so a malformed or hostile context cannot recurse forever.
 */
const MAX_CONTEXT_DEPTH = 8;

/**
 * The only context leaves that are prices. Walking every number instead let
 * unrelated values vouch for a price — `volume24h` at 21622.5, an RSI of
 * 44.53, a confluence score of 50 or a take-profit percentage all sit within
 * an order of magnitude of a real level for some asset. A key that is not a
 * level must never answer "yes, the model read this".
 *
 * `*` matches one array element or one dynamic key. Keeping the list explicit
 * also means a new price-bearing context key shows up as a missing candidate
 * in a test rather than silently widening the pool.
 */
const PRICE_PATHS: ReadonlyArray<readonly string[]> = [
  ["REAL_TIME_PRICE"],
  ["marketDetails", "currentPrice"],
  ["marketDetails", "high24h"],
  ["marketDetails", "low24h"],
  ["marketDetails", "orderbook", "topBids", "*"],
  ["marketDetails", "orderbook", "topAsks", "*"],
  ["technicals", "movingAverages", "*", "value"],
  ["technicals", "pivots", "classic", "*"],
  ["technicals", "divergences", "*", "priceStart"],
  ["technicals", "divergences", "*", "priceEnd"],
  ["tradeSetup", "entry"],
  ["tradeSetup", "sl"],
  ["tradeSetup", "tp", "*", "price"],
  ["openPositions", "*", "entry"],
];

/** The part of `AiContext` this check reads. A type-only link, so a rename in
 * `AiContext` breaks the build instead of silently emptying the candidate
 * list (which would make the guard fail open). */
export type PriceCheckContext = Pick<
  AiContext,
  "REAL_TIME_PRICE" | "marketDetails" | "technicals" | "tradeSetup" | "openPositions"
>;

/** The part of an AI action this check reads. */
export type PriceActionLike = Pick<
  ValidatedAiAction,
  "action" | "value" | "index"
>;

/** One price the confirmation UI should flag before the user applies it. */
export interface UnverifiedPrice {
  action: string;
  index?: number;
  value: string;
}

/** Verdict for one batch of actions. */
export interface ActionPriceCheck {
  /** Price actions the context cannot vouch for. */
  unverified: UnverifiedPrice[];
  /**
   * False only when the batch carries a price but the context carries no
   * price at all (a gather timeout, a missing ticker). The UI says "could not
   * be checked" then — silence must not read as "verified".
   */
  checked: boolean;
}

/**
 * Parse exactly the way `executeAction` will. `validateAiAction` accepts a
 * `k`/`m` suffix, and `parseAiValue` scales it — checking with a different
 * parser would verify 81859.7 and execute 81859700.
 */
function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = parseAiValue(value);
  if (!parsed.isFinite() || parsed.lte(0)) return null;
  return parsed.toNumber();
}

function matchesPricePath(path: readonly string[]): boolean {
  return PRICE_PATHS.some(
    (pattern) =>
      pattern.length === path.length &&
      pattern.every((segment, index) => segment === "*" || segment === path[index]),
  );
}

/** Every price the model could have cited from the context. */
function collectCandidates(
  context: PriceCheckContext | null | undefined,
): number[] {
  if (!context) return [];
  const found: number[] = [];
  const visit = (node: unknown, path: string[], depth: number): void => {
    if (depth > MAX_CONTEXT_DEPTH) return;
    if (matchesPricePath(path)) {
      const price = asPositiveNumber(node);
      if (price !== null) found.push(price);
      return;
    }
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, [...path, "*"], depth + 1);
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        visit(value, [...path, key], depth + 1);
      }
    }
  };
  for (const [key, value] of Object.entries(context)) visit(value, [key], 0);
  return found;
}

/**
 * Which price actions match no context level within `PRICE_MATCH_TOLERANCE`.
 * A batch without a price is `checked: true` (nothing to check); a batch with
 * a price but no context level is `checked: false` (nothing to check against).
 */
export function checkActionPrices(
  actions: readonly PriceActionLike[],
  context: PriceCheckContext | null | undefined,
): ActionPriceCheck {
  const priceActions = actions.flatMap((action) => {
    if (!AI_PRICE_ACTIONS.includes(action.action)) return [];
    const price = asPositiveNumber(action.value);
    // A percent-only take profit carries no price, and shape validation has
    // already dropped non-numbers, so there is nothing to check here.
    return price === null ? [] : [{ action, price }];
  });
  if (priceActions.length === 0) return { unverified: [], checked: true };

  const candidates = collectCandidates(context);
  if (candidates.length === 0) return { unverified: [], checked: false };

  const unverified = priceActions
    .filter(
      ({ price }) =>
        !candidates.some(
          (candidate) =>
            Math.abs(price - candidate) <= candidate * PRICE_MATCH_TOLERANCE,
        ),
    )
    .map(({ action, price }) => ({
      action: action.action,
      ...(typeof action.index === "number" ? { index: action.index } : {}),
      // Keep the model's own spelling; it is what the table shows above.
      value: typeof action.value === "string" ? action.value : String(price),
    }));

  return { unverified, checked: true };
}
