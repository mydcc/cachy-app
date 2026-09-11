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

/**
 * Which price series a candle is read from.
 *
 * On a perpetual the last traded price and the mark price differ, and the gap is
 * widest exactly when it matters. `last` is the default and is omitted from a
 * serialised operand, so every document written before this field existed keeps
 * its content hash — which is why FEAT-0390 needed no schema migration.
 */
export type PriceSource = "last" | "mark";
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

/** Which end of a window an `Operand` of kind `window` reads. */
export type WindowAgg = "min" | "max";

export type Operand =
  | { kind: "price"; field: PriceField; source?: PriceSource }
  /**
   * Traded volume of the closed candle.
   *
   * Deliberately not a seventh `PriceField`. Every `PriceField` value is
   * denominated in quote currency, which is what makes it comparable against a
   * price threshold; volume is denominated in size. As its own operand it
   * carries its own dimension, and the core refuses `volume` against a price
   * rather than comparing two unrelated scales.
   *
   * No `source`: a mark price is a derived quote with no volume of its own, so
   * volume is always read from the last-traded series.
   */
  | { kind: "volume" }
  | { kind: "indicator"; indicator: IndicatorRef }
  | { kind: "constant"; value: DecimalString }
  /**
   * How far the price has moved, in percent, from a candle `lookback` closes
   * earlier: `(now - then) / then * 100`.
   *
   * The reference is a closed candle rather than the price at arming time, so
   * "5% over three 4h closes" means the same thing on every market and can be
   * carried into a template. Positive for a rise and negative for a fall, so a
   * fall is this operand against a negative threshold rather than a second
   * variant. `lookback` must be at least 1; the core refuses 0.
   */
  | {
      kind: "percent_change";
      field: PriceField;
      source?: PriceSource;
      lookback: number;
    }
  /**
   * The lowest or highest value another operand took over the last `lookback`
   * closes, the current one included.
   *
   * What makes "at a 20-candle high" and Bollinger's actual Squeeze — the
   * lowest bandwidth over a long window, not a fixed threshold — expressible.
   * An operand rather than a condition shape, so it inherits the dimensional
   * guard: a window over a volume is still a volume. See ADR-0016.
   *
   * `of` must not itself be a window, and `lookback` is 2..=500; the core
   * refuses both. A *strict* comparison against a window can never be true,
   * because the window includes the value being compared — "breaks above its
   * 20-candle high" is `gte`, not `gt`.
   */
  | { kind: "window"; of: Operand; agg: WindowAgg; lookback: number };

/**
 * The candlestick patterns the rule core can detect, spelled exactly as the
 * Rust `CandlePattern` enum serialises them (`technicals-wasm/src/rule/pattern.rs`).
 *
 * A name the core does not know is refused at parse rather than ignored, so a
 * typo here surfaces as a refusal and never as an alarm that quietly never
 * fires.
 *
 * Engulfing and Harami carry their direction in the name. They are two
 * patterns each, not one: a bullish and a bearish engulfing point opposite
 * ways, and a direction-less "engulfing" alert would send a trader the wrong
 * way half the time.
 */
export type CandlePatternName =
  // One candle. These four are two shapes read against the preceding trend:
  // the same lower-pin candle is a hammer after a fall and a hanging man after
  // a rise, which is why the core needs trend context for them and not for the
  // rest.
  | "hammer"
  | "inverted_hammer"
  | "shooting_star"
  | "hanging_man"
  // Two candles.
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "piercing_line"
  | "dark_cloud_cover"
  | "bullish_harami"
  | "bearish_harami"
  // Three candles.
  | "morning_star"
  | "evening_star"
  | "three_white_soldiers"
  | "three_black_crows";

export type Condition =
  | { kind: "compare"; left: Operand; op: CompareOp; right: Operand; timeframe: TimeframeString }
  | {
      kind: "cross";
      left: Operand;
      direction: CrossDirection;
      right: Operand;
      timeframe: TimeframeString;
    }
  /**
   * A candlestick pattern printing on the last closed candle of `timeframe`
   * (FEAT-0394).
   *
   * Detection lives in Rust, next to the evaluator -- there is exactly one
   * implementation and this is not it. `src/services/candlestickPatterns.ts`
   * is Academy teaching material that shares these ids so the illustrations
   * and translations can be reused; no logic crosses between them.
   */
  | { kind: "pattern"; pattern: CandlePatternName; timeframe: TimeframeString }
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

  /*
   * FEAT-0393 lifecycle. None of these change the content hash: two rules that
   * differ only in how loudly they announce themselves are the same strategy,
   * and a journal entry naming one must keep matching the other.
   */
  /**
   * Which channels announce a trigger. Absent or empty means the notification
   * service's own default policy — what every rule authored before this field
   * had.
   */
  trigger_methods?: TriggerMethod[];
  /** How often it may announce. Absent means `once`. */
  frequency?: TriggerFrequency;
  /** Epoch ms after which the rule expires *without* firing. */
  valid_until_ms?: number;
  /** Why this rule was armed, in the author's words. Class A — never leaves the device. */
  note?: string;
}

/** One reason a document was refused, naming the field responsible. */
/** How often an armed rule may announce itself. Mirrors `lifecycle::TriggerFrequency`. */
export type TriggerFrequency = "once" | "every_time" | "once_per_candle_close";

/**
 * A channel a trigger is announced on. Mirrors `lifecycle::TriggerMethod`.
 *
 * External channels are deliberately absent: FEAT-0397 has unresolved
 * constraints, and a type invented for a shape that may not ship is a migration
 * owed for nothing.
 */
export type TriggerMethod = "in_app" | "browser" | "sound";

/** The longest a note may be, in characters. Mirrors `lifecycle::NOTE_MAX_CHARS`. */
export const NOTE_MAX_CHARS = 280;

/**
 * What a rule has already done. Mirrors `lifecycle::RuleState`.
 *
 * Supplied by whoever owns the rule store, so that evaluation stays a pure
 * function of its inputs. Omitting it means "never fired", which keeps a caller
 * that does not track state firing alerts rather than silently muting them.
 */
export interface RuleState {
  fired_count?: number;
  /** Close instant of the trigger candle the last announcement was anchored on. */
  last_fired_anchor_ms?: number | null;
}

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
  /**
   * The mark-price series, keyed the same way. Supplied only for the timeframes
   * a rule actually reads from the mark series. A rule that names the mark price
   * without one evaluates to `indeterminate` — the core never answers it from
   * `candles` instead, because a mark-price alarm answered with the last price
   * is a wrong alarm that looks like a right one.
   */
  mark_candles?: Record<TimeframeString, EvaluationCandle[]>;
  indicators?: EvaluationIndicatorSeries[];
  feeds?: Record<string, DecimalString>;
  account?: AccountSnapshot;
  /**
   * What the rule has already done, for the frequency and validity checks.
   *
   * Omit it and the rule is treated as never-fired: a caller that does not
   * track state keeps the pre-FEAT-0393 behaviour rather than being silently
   * muted.
   */
  state?: RuleState;
}

/** What an evaluation concluded. Mirrors `evaluate::Verdict`. */
export type Verdict =
  | { verdict: "fires" }
  | { verdict: "does_not_fire" }
  | { verdict: "suppressed" }
  | { verdict: "indeterminate"; reason: string }
  /** Past its validity period. Lapsed *without* firing — Manage shows expired, not fired. */
  | { verdict: "expired" }
  /** Conditions held, but the frequency was already spent on this candle or for good. */
  | { verdict: "already_fired" };
