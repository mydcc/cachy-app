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
 * FEAT-0817 — the condition language, described for a model.
 *
 * ADR-0030 decision 4 lists exactly four things that may travel in an
 * authoring prompt. Three of them are the trader's (prose, symbol, trigger
 * timeframe); this file is the fourth, and it is the only one that is *not*
 * the trader's: operand names, operators, enum values and limits are Cachy's
 * schema. Nothing derived from a journal, a balance, a position or another
 * rule can enter here, because nothing in this module reads a store.
 *
 * ## Why it is derived rather than written out
 *
 * The indicator half comes from `INDICATOR_CATALOGUE`, which
 * `indicatorCatalogue.test.ts` already holds against the Rust registry. A
 * hand-written list here would be a third copy of the same facts and would
 * drift from the registry without any test noticing — and the way it would
 * fail is the worst available: the model would be told about an indicator the
 * core refuses, and the trader would read a refusal for a rule they described
 * correctly.
 *
 * The enum halves are written out, because a TypeScript union has no runtime
 * form to enumerate. They are held to the unions by `satisfies`, so deleting
 * a member of `CompareOp` fails the build here instead of leaving a value the
 * core no longer accepts.
 *
 * ## What it deliberately does not describe
 *
 * The stop, the order intent and every lifecycle field. ADR-0030 decision 5
 * gives the model conditions, veto and exits; a language description that
 * mentioned `stop` or `enabled` would invite it to propose one, and the
 * cheapest way not to receive a field is not to name it.
 */

import {
  INDICATOR_CATALOGUE,
  type CatalogueEntry,
} from "../../alerts/indicatorCatalogue";
import type {
  CandlePatternName,
  CompareOp,
  CrossDirection,
  LogicOp,
  PriceField,
  PriceSource,
  TimeframeString,
  WindowAgg,
} from "../../rules/types";

/** One indicator the model may name, with what the core will accept for it. */
export interface IndicatorDescription {
  id: string;
  /** Every parameter, with the conventional starting value. */
  params: ReadonlyArray<{ name: string; kind: string; default: number | string }>;
  /** Output lines, each with what its numbers are denominated in. */
  outputs: ReadonlyArray<{ name: string; dimension: string }>;
  /**
   * A running total whose level depends on how much history is loaded. The
   * core accepts it only against a window over itself, so the model is told
   * rather than left to produce a comparison that is refused.
   */
  cumulative?: true;
}

/** The whole description. Static but for the schema version. */
export interface ConditionLanguageDescription {
  /** The version the core authors and reads, so a draft names the same one. */
  schemaVersion: number;
  timeframes: readonly TimeframeString[];
  priceFields: readonly PriceField[];
  priceSources: readonly PriceSource[];
  compareOperators: readonly CompareOp[];
  crossDirections: readonly CrossDirection[];
  logicOperators: readonly LogicOp[];
  windowAggregates: readonly WindowAgg[];
  patterns: readonly CandlePatternName[];
  /** The operand kinds, each with the fields it carries. */
  operands: readonly string[];
  /** The condition kinds legal in `conditions`. */
  conditions: readonly string[];
  /** The condition kinds legal in `veto` but not in `conditions`. */
  vetoOnlyConditions: readonly string[];
  indicators: readonly IndicatorDescription[];
  limits: {
    /** `window.lookback` and `atr_percentile.lookback`. */
    lookbackMin: number;
    lookbackMax: number;
    /** `percent_change.lookback` must be at least this. */
    percentChangeLookbackMin: number;
    /** Characters a `name` may carry. */
    nameMaxChars: number;
  };
  /**
   * The refusals a model cannot discover from the shapes alone. Prose rather
   * than structure on purpose: each one is a rule about *combinations*, and a
   * model that is told them produces a draft the core accepts instead of one
   * the trader has to repair.
   */
  rules: readonly string[];
}

const TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "1w",
] as const satisfies readonly TimeframeString[];

const PRICE_FIELDS = [
  "open",
  "high",
  "low",
  "close",
  "hl2",
  "hlc3",
] as const satisfies readonly PriceField[];

const PRICE_SOURCES = ["last", "mark"] as const satisfies readonly PriceSource[];

const COMPARE_OPERATORS = [
  "lt",
  "lte",
  "gt",
  "gte",
  "eq",
  "neq",
] as const satisfies readonly CompareOp[];

const CROSS_DIRECTIONS = [
  "above",
  "below",
  "any",
] as const satisfies readonly CrossDirection[];

const LOGIC_OPERATORS = ["all", "any", "none"] as const satisfies readonly LogicOp[];

const WINDOW_AGGREGATES = ["min", "max"] as const satisfies readonly WindowAgg[];

const PATTERNS = [
  "hammer",
  "inverted_hammer",
  "shooting_star",
  "hanging_man",
  "bullish_engulfing",
  "bearish_engulfing",
  "piercing_line",
  "dark_cloud_cover",
  "bullish_harami",
  "bearish_harami",
  "morning_star",
  "evening_star",
  "three_white_soldiers",
  "three_black_crows",
] as const satisfies readonly CandlePatternName[];

/**
 * The operand shapes, as the wire carries them. Written as the JSON the core
 * parses rather than as prose: the model has to emit this, and a description
 * in English would be a second translation step for it to get wrong.
 */
const OPERANDS = [
  '{"kind":"price","field":<priceField>,"source":<priceSource, optional, default "last">}',
  '{"kind":"volume"}',
  '{"kind":"constant","value":"<decimal as string>"}',
  '{"kind":"indicator","indicator":{"id":"<indicatorId>","params":{...},"output":"<outputName, optional>","field":<priceField, optional>}}',
  '{"kind":"percent_change","field":<priceField>,"source":<priceSource, optional>,"lookback":<candles, >=1>}',
  '{"kind":"window","of":<operand, not itself a window>,"agg":<windowAgg>,"lookback":<2..500>}',
  '{"kind":"atr_percentile","period":<candles>,"lookback":<2..500>}',
] as const;

const CONDITIONS = [
  '{"kind":"compare","left":<operand>,"op":<compareOp>,"right":<operand>,"timeframe":<timeframe>}',
  '{"kind":"cross","left":<operand>,"direction":<crossDirection>,"right":<operand>,"timeframe":<timeframe>}',
  '{"kind":"pattern","pattern":<patternName>,"timeframe":<timeframe>}',
  '{"kind":"group","op":<logicOp>,"of":[<condition>, ...]}',
  '{"kind":"session","from":"HH:MM","to":"HH:MM","timezone":"UTC"}',
] as const;

const VETO_ONLY_CONDITIONS = [
  '{"kind":"external_feed","feed":"<feedId>","op":<compareOp>,"value":"<decimal as string>"}',
] as const;

/**
 * The combination rules, each one a refusal the core actually raises. Kept
 * next to the shapes so a model reads both in one pass.
 *
 * Every entry here mirrors a branch in `RuleDocument::validate` or
 * `Condition::validate`. They are the refusals a trader would otherwise meet
 * after pressing arm, which is the moment a correct description is worth most.
 */
const LANGUAGE_RULES = [
  "Both sides of a compare must share a dimension. The core refuses price against percent, price against volume, and percent against volume. An indicator's dimension is the dimension of the output line you read.",
  "A strict comparison against a window can never be true, because the window includes the value being compared. Use gte or lte, not gt or lt.",
  "window.of must not itself be a window.",
  "A cumulative indicator (see the cumulative flag) is accepted only against a window over itself, never against a constant: its level depends on how much history is loaded.",
  "external_feed is legal inside veto and refused inside conditions: a third-party aggregate may suppress a trigger but never be one.",
  "account and position conditions are refused at this level entirely — they read a book an alert does not hold. Do not emit them.",
  "A session window needs timezone UTC, from must differ from to, and from > to wraps midnight.",
  "Exits read the position the bot owns. Their condition language is the same, minus external_feed.",
  "Do not emit a stop, an order, a size, a consequence level, an id, a name for the trader's account, or any enabled flag. Those are the trader's and are rejected.",
] as const;

function describeIndicator(entry: CatalogueEntry): IndicatorDescription {
  const described: IndicatorDescription = {
    id: entry.id,
    params: entry.params.map((param) => ({
      name: param.name,
      kind: param.kind,
      default: param.default,
    })),
    outputs: entry.outputs.map((output) => ({
      name: output.name,
      dimension: output.dimension,
    })),
  };
  // Spread-free so the optional flag is present exactly when the catalogue
  // carries it: `cumulative: undefined` would serialise differently and is a
  // field the model would have to interpret.
  return entry.cumulative ? { ...described, cumulative: true } : described;
}

/**
 * The description, for a core at `schemaVersion`.
 *
 * The version is an argument rather than a `ruleSchema.schemaVersion()` call
 * so this module stays pure: it is the one part of the payload a test must be
 * able to build without loading WASM, because the payload boundary is what
 * the egress test checks.
 */
export function buildConditionLanguageDescription(
  schemaVersion: number,
): ConditionLanguageDescription {
  return {
    schemaVersion,
    timeframes: TIMEFRAMES,
    priceFields: PRICE_FIELDS,
    priceSources: PRICE_SOURCES,
    compareOperators: COMPARE_OPERATORS,
    crossDirections: CROSS_DIRECTIONS,
    logicOperators: LOGIC_OPERATORS,
    windowAggregates: WINDOW_AGGREGATES,
    patterns: PATTERNS,
    operands: OPERANDS,
    conditions: CONDITIONS,
    vetoOnlyConditions: VETO_ONLY_CONDITIONS,
    indicators: INDICATOR_CATALOGUE.map(describeIndicator),
    limits: {
      lookbackMin: 2,
      lookbackMax: 500,
      percentChangeLookbackMin: 1,
      nameMaxChars: 80,
    },
    rules: LANGUAGE_RULES,
  };
}
