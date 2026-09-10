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
 * The wire shape of a rule document — one strategy, per ADR-0012.
 *
 * These are *types only*. There is no zod schema here and no validation, because
 * the schema is defined once, in Rust, at `technicals-wasm/src/rule/`. A second
 * validator in TypeScript is exactly the divergence ADR-0012 exists to prevent:
 * two implementations of "is this rule valid" eventually disagree, and the place
 * they disagree is between what the trader tested and what the machine sent.
 *
 * So these interfaces describe what crosses the boundary; `ruleSchema.ts` asks
 * the core whether an instance is actually acceptable.
 *
 * Class A throughout (ADR-0001, ADR-0012 decision 6): a rule document is
 * strategy, and it stays on the device. Nothing here is sent to a server, to
 * telemetry, or to a debug log.
 */

/** Decimal values cross as strings so no precision is lost to `number`. */
export type DecimalString = string;

/** Canonical timeframe spelling: `<positive integer><m|h|d|w>`, e.g. `4h`. */
export type TimeframeString = string;

export type ConsequenceLevel = "notify" | "simulate" | "send";
export type CompareOp = "lt" | "lte" | "gt" | "gte" | "eq" | "neq";
export type CrossDirection = "above" | "below" | "any";
export type LogicOp = "all" | "any" | "none";
export type PriceField = "open" | "high" | "low" | "close" | "hl2" | "hlc3";
export type PositionSide = "long" | "short" | "either";
export type AccountFieldName =
  | "position_size"
  | "unrealised_pnl"
  | "unrealised_pnl_percent"
  | "exposure"
  | "available_balance";

/**
 * An indicator parameter: a whole count as a number, a multiplier as a decimal
 * string. There is no string-expression form anywhere in this file — ADR-0012
 * forbids evaluating a rule by executing supplied text, and the guarantee is
 * kept by leaving nowhere for text to sit.
 */
export type ParamValue = number | DecimalString;

export interface IndicatorRef {
  /** A registry identity such as `rsi` or `macd`. Never a free-text expression. */
  id: string;
  /** Every parameter the indicator takes; a rule never inherits panel settings. */
  params: Record<string, ParamValue>;
  /** Which output line to read. Defaults to `value` for single-line indicators. */
  output?: string;
}

export type Operand =
  | { kind: "price"; field: PriceField }
  | { kind: "indicator"; indicator: IndicatorRef }
  | { kind: "constant"; value: DecimalString };

export type Condition =
  | { kind: "compare"; left: Operand; op: CompareOp; right: Operand; timeframe: TimeframeString }
  | {
      kind: "cross";
      left: Operand;
      direction: CrossDirection;
      right: Operand;
      timeframe: TimeframeString;
    }
  | { kind: "position"; side: PositionSide; open: boolean }
  | { kind: "account"; field: AccountFieldName; op: CompareOp; value: DecimalString }
  | { kind: "group"; op: LogicOp; of: Condition[] }
  /**
   * A third-party aggregate. Legal inside `veto` and refused inside
   * `conditions`: ADR-0012 decision 7 lets such a feed suppress a trigger but
   * never be one, because a backtest over an unversioned feed cannot be honest.
   */
  | { kind: "external_feed"; feed: string; op: CompareOp; value: DecimalString };

export type SizeBasis =
  | "base_quantity"
  | "quote_notional"
  | "percent_of_equity"
  | "percent_risk";

export interface OrderIntent {
  side: "buy" | "sell";
  size_basis: SizeBasis;
  size: DecimalString;
  reduce_only?: boolean;
}

export interface RuleAction {
  consequence_level: ConsequenceLevel;
  /** Present exactly when the level submits something. */
  order?: OrderIntent;
}

export interface Provenance {
  source: "human" | "model";
  created_at_ms: number;
  /** Which model proposed it. Class A, like the rest of the document. */
  model?: string;
}

export interface RuleDocument {
  schema_version: number;
  id: string;
  name: string;
  symbol: string;
  /**
   * The evaluation anchor. The rule is checked once per close of this
   * timeframe, and each condition reads the last candle of its own timeframe
   * that had already closed at that instant.
   */
  trigger_timeframe: TimeframeString;
  conditions: Condition;
  veto?: Condition;
  action: RuleAction;
  enabled?: boolean;
  provenance: Provenance;
}

/** One reason a document was refused, naming the field responsible. */
export interface RuleRefusal {
  code: string;
  /** Dotted path to the offending field, e.g. `action.consequence_level`. */
  field: string;
  /** i18n key under `rules.refusal.*`. What a UI renders. */
  i18n_key: string;
  /** Developer-facing English for logs and tests. Never shown to a trader alone. */
  detail: string;
}

export interface Refused {
  refusals: RuleRefusal[];
}

/**
 * The market and account snapshot a document is evaluated against.
 *
 * `candles` is keyed by any spelling the core's `Timeframe::parse` accepts.
 * `indicators` names each series by its full `IndicatorRef` — never by a
 * hand-built key — so the evaluator's internal indexing stays a Rust-side
 * concern. `values` is index-aligned to `candles[timeframe]`; `null` where a
 * value was not available (not yet warmed up, or a gap), which the evaluator
 * reads as "no value" rather than a false condition.
 */
export interface EvaluationCandle {
  open_time_ms: number;
  open: DecimalString;
  high: DecimalString;
  low: DecimalString;
  close: DecimalString;
  volume?: DecimalString;
}

export interface EvaluationIndicatorSeries {
  indicator: IndicatorRef;
  timeframe: TimeframeString;
  values: (DecimalString | null)[];
}

export interface AccountSnapshot {
  /** Signed size in the base asset; negative when short, zero when flat. */
  position_size: DecimalString;
  unrealised_pnl: DecimalString;
  unrealised_pnl_percent: DecimalString;
  exposure: DecimalString;
  available_balance: DecimalString;
}

export interface EvaluationContext {
  candles: Record<TimeframeString, EvaluationCandle[]>;
  indicators?: EvaluationIndicatorSeries[];
  feeds?: Record<string, DecimalString>;
  account?: AccountSnapshot;
}

/** What an evaluation concluded. Mirrors `evaluate::Verdict`. */
export type Verdict =
  | { verdict: "fires" }
  | { verdict: "does_not_fire" }
  | { verdict: "suppressed" }
  | { verdict: "indeterminate"; reason: string };
