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
  /**
   * The price the indicator is computed over, for the indicators whose settings
   * card offers one (`defaultFieldOf`). Left off for that default: the core
   * drops a field naming it, so a rule keeps its content hash (FEAT-0454).
   */
  field?: PriceField;
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
  | { kind: "window"; of: Operand; agg: WindowAgg; lookback: number }
  /**
   * FEAT-0815 — the volatility regime: the percentile rank (0..=100) of the
   * current ATR(`period`) among its last `lookback` values, the current one
   * included (the share at or below it, times 100). A percentage; `lookback`
   * is 2..=500 and the warmup is `period + lookback`.
   */
  | { kind: "atr_percentile"; period: number; lookback: number };

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
  | { kind: "external_feed"; feed: string; op: CompareOp; value: DecimalString }
  /**
   * FEAT-0815 — true while the anchor candle's close falls inside a daily UTC
   * window, `from` inclusive and `to` exclusive (`HH:MM`). `from > to` wraps
   * midnight; `from == to` and any timezone but `UTC` are refused.
   */
  | { kind: "session"; from: string; to: string; timezone: "UTC" };

export type SizeBasis =
  | "base_quantity"
  | "quote_notional"
  | "percent_of_equity"
  | "percent_risk";

/**
 * How far a bot's protective stop sits from the entry it opens.
 *
 * A distance, never a price, mirroring `StopDistance` in
 * `technicals-wasm/src/rule/consequence.rs`: a level written into a document is
 * true only for the bar it was written on, and the rule fires later.
 *
 * Tagged by `basis` so the next one — a multiple of ATR — is an added member
 * rather than a schema break for documents already stored.
 */
export type StopDistance = {
  basis: "percent_of_entry";
  /** Percent of the entry price. `"2"` is a stop two percent away. */
  distance: DecimalString;
};

export interface OrderIntent {
  side: "buy" | "sell";
  size_basis: SizeBasis;
  size: DecimalString;
  reduce_only?: boolean;
  /**
   * Absent on documents written before the field existed, which is why it is
   * optional here rather than required. `percent_risk` has no value without it
   * and the core refuses that combination; the submission path refuses an
   * opening order that carries no stop.
   */
  stop?: StopDistance;
}

export interface RuleAction {
  consequence_level: ConsequenceLevel;
  /** Present exactly when the level submits something. */
  order?: OrderIntent;
}

/**
 * How much of the owned position one exit closes. Mirrors `ExitClose` in
 * `technicals-wasm/src/rule/document.rs`.
 */
export type ExitClose = "all" | "partial";

/**
 * One way this bot leaves the position it owns — FEAT-0809.
 *
 * `when` is the same condition language the trigger speaks; inside it,
 * account state is legal from `simulate` up (the exit reads the position the
 * bot owns — ADR-0026 decisions 2 and 5) and `external_feed` is refused:
 * an exit is an action, and a backtest cannot replay a closing decision
 * made on an unversioned feed.
 */
export interface ExitRule {
  when: Condition;
  close: ExitClose;
  /** Required for `partial`, refused for `all`: `0 < fraction <= 1`. */
  fraction?: DecimalString;
}

/** Mirrors `evaluate::ExitKind`. */
export type ExitKind = "exit" | "take_profit";

/**
 * How often a bot may open a position — FEAT-0822. Mirrors `FiringPolicy`
 * in `technicals-wasm/src/rule/document.rs`.
 *
 * `once` expires after the first entry that lands; `once_per_candle` is the
 * absent default (the engine's `(rule, anchor)` guard, now named); `multi`
 * allows deliberate re-entries up to the document's own limits.
 */
export type FiringPolicy = "once" | "once_per_candle" | "multi";

/**
 * FEAT-0823. How an entry is released after the conditions fire. Mirrors
 * `EntryTrigger` in `technicals-wasm/src/rule/document.rs`, which is where
 * the meaning (and the wait's owner — the engine, not the core) lives.
 */
export type EntryTriggerMode = "immediate" | "confirmation";

/**
 * One exit's verdict at one anchor. Mirrors `evaluate::ExitOutcome`.
 *
 * Three-valued for the same reason `Verdict` is: an exit whose operands
 * cannot be read must neither act nor silently veto the exits that could.
 */
export type ExitOutcome =
  | { result: "fires"; close: ExitClose; fraction: DecimalString | null }
  | { result: "does_not_fire" }
  | { result: "unknown"; reason: string };

/** One owned position's answers at one anchor. Mirrors `evaluate::ExitAnswer`. */
export interface ExitAnswer {
  kind: ExitKind;
  /** The exit's position in `exits`; `null` on the take-profit answer. */
  index: number | null;
  outcome: ExitOutcome;
}

/**
 * The position an exit evaluates against — FEAT-0810, mirroring
 * `evaluate::OwnedPositionContext`.
 *
 * The trade's own entry price and facing, as the position book states them:
 * a distance resolves from the price the bot actually paid, never from a
 * stored target. `either` is deliberately absent — it is a condition's
 * question, not a facing a position has, and the core refuses it at the
 * boundary.
 */
export interface OwnedPositionContext {
  entry_price: DecimalString;
  side: "long" | "short";
}

export interface Provenance {
  source: "human" | "model";
  created_at_ms: number;
  /** Which model proposed it. Class A, like the rest of the document. */
  model?: string;
  /**
   * Content hash of the document this one was derived from — a promotion
   * (FEAT-0396) or a duplicate (FEAT-0746).
   *
   * For a duplicate the value equals the document's own content hash: a copy is
   * the same strategy under a new identity, so the id, not the hash, tells the
   * two apart. Exactly 64 lowercase hex characters, or the core refuses the
   * document. Excluded from the content hash like the rest of `provenance`, so
   * nothing may gate a decision on it: two documents with the same hash must
   * authorise identically. It records lineage and confers no permission.
   */
  derived_from_hash?: string;
}

/**
 * When inside the trigger timeframe a rule is read — FEAT-0477.
 *
 * `close` decides once, when the trigger candle closes; `intrabar` decides on
 * the candle still forming, at most once per candle. The value an intrabar rule
 * reads is provisional — the same candle can move back through the level before
 * it closes — which is why this is opt-in per rule rather than a setting.
 *
 * Mirrors `EvaluationMode` in `technicals-wasm/src/rule/document.rs`, which is
 * where the meaning lives (ADR-0012).
 */
export type EvaluationMode = "close" | "intrabar";

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
  /**
   * Whether the trigger candle is read at its close or while it forms.
   *
   * Hashed in the core, unlike the lifecycle fields further down: the timeframe
   * above is hashed because it says at which instant a condition is read, and
   * this is that same axis at finer grain. Absent means `close`, which is what
   * every rule written before this field meant — and the core omits the default
   * from the serialised document, so those rules keep the content hash they
   * were recorded under.
   */
  evaluation_mode?: EvaluationMode;
  conditions: Condition;
  veto?: Condition;
  action: RuleAction;
  /**
   * FEAT-0809. Ways this bot leaves the position it owns, evaluated by the
   * same core while the position is open. Hashed — an exit is part of what
   * the strategy means, and a journal entry must not keep pointing at a rule
   * whose exits were edited. Absent means the resting stop is the whole exit
   * story, exactly as it was for every rule before this field.
   */
  exits?: ExitRule[];
  /**
   * FEAT-0809. A profit target, resolved against the actual entry like
   * `OrderIntent.stop` and never a stored price, so it cannot go stale.
   * Hashed, for the same reason the stop is.
   */
  take_profit?: StopDistance;
  /**
   * FEAT-0822. How often this bot may open a position. Hashed — cadence is
   * part of what the strategy means. Absent means `once_per_candle`, the
   * engine's `(rule, anchor)` guard, which is what every rule before this
   * field already did. Not the announce cadence — that is `frequency`, which
   * is not hashed.
   */
  firing_policy?: FiringPolicy;
  /**
   * FEAT-0822. The most rows this bot may own at once. Hashed. Absent means
   * one — the bound FEAT-0488 already enforced.
   */
  max_positions?: number;
  /** FEAT-0822. The most entries this bot may land per calendar day. Hashed. */
  max_entries_per_day?: number;
  /**
   * FEAT-0822. The most one entry may risk, in the account currency,
   * resolved against the entry and its stop. Hashed.
   */
  max_risk_per_position?: DecimalString;
  /**
   * FEAT-0822. The total open risk this bot's rows may hold, in the account
   * currency. Hashed.
   */
  budget_cap?: DecimalString;
  /**
   * FEAT-0823. How an entry is released after the conditions fire:
   * immediately, or once the next closed candle confirms the direction.
   * Hashed — waiting is part of what the strategy means. Absent means
   * `immediate`, the only behaviour the engine had before this field.
   */
  entry_trigger?: EntryTriggerMode;
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
/**
 * FEAT-0819 — a grid bot's document (ADR-0027).
 *
 * Its own kind, not a `RuleDocument` variant: a grid has no trigger condition.
 * The core (`technicals-wasm/src/rule/grid.rs`) is the only validator; these
 * types describe what it accepts.
 */
export type GridSide = "long" | "short";
export type GridSpacing = "arithmetic" | "geometric";
/** `percent_risk` exists only so the core can refuse it by name. */
export type GridSizeBasis = "quote_budget" | "percent_risk";

export interface GridSizing {
  basis: GridSizeBasis;
  /** Total budget in the quote currency. */
  amount: DecimalString;
}

export interface GridDocument {
  kind: "grid";
  schema_version: number;
  id: string;
  name: string;
  symbol: string;
  side: GridSide;
  /** The cadence the trend filter and the stop-out are read at. */
  evaluation_timeframe: TimeframeString;
  lower_price: DecimalString;
  upper_price: DecimalString;
  level_count: number;
  spacing: GridSpacing;
  sizing: GridSizing;
  /** While false, the grid withdraws its resting opening orders. */
  trend_filter?: Condition;
  /** Required and non-empty: any one holding stops the grid. */
  stop_out: Condition[];
  /** `simulate` is the only level the core accepts for a grid. */
  consequence_level: ConsequenceLevel;
  enabled: boolean;
  provenance: Provenance;
}

export type TriggerFrequency = "once" | "every_time" | "once_per_candle_close";

/**
 * A channel a trigger is announced on. Mirrors `lifecycle::TriggerMethod`.
 *
 * The external three are selectable per rule (FEAT-0748) but remain bounded by
 * the policy: a rule can only narrow delivery to a channel the trader has
 * configured and switched on. Whether a channel is usable is a property of the
 * device, not of the document, so this union stays about *intent*.
 */
export type TriggerMethod =
  | "in_app"
  | "browser"
  | "sound"
  | "email"
  | "discord"
  | "telegram";

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
  /**
   * FEAT-0822 — the entries that landed, TS-side only.
   *
   * `fired_count` counts firings, including ones that submitted nothing; the
   * firing policy and the day cap count ENTRIES — attempts that actually
   * opened a row. Kept beside `fired_count` in this ledger, sparse and
   * tolerant of the writers below, which carry the field exactly.
   */
  bot_entries?: {
    /** Entries that landed, ever — what `firing_policy: "once"` expires against. */
    total: number;
    /** The local day `today` counts, as `YYYY-MM-DD`. */
    day: string;
    /** Entries that landed on that local day. */
    today: number;
  };
  /**
   * BUG-0491 — the gate's durable record for bots, TS-side only.
   *
   * The Rust `RuleState` knows two fields and the wire stays exactly that:
   * whoever hands a state to the core strips these first (see
   * `RuleEvaluationLoop.stateFor`), so an unknown-field guard on that side
   * can never trip on them. All three are absent on entries written before
   * this fix — absent reads as "never evaluated", which errs towards
   * evaluating: the loud direction.
   */
  /** Last close anchor this rule was evaluated on, whatever the verdict was. */
  last_evaluated_anchor_ms?: number | null;
  /** Open time of the forming candle last seen on the intrabar path. */
  last_intrabar_anchor_ms?: number | null;
  /** Open time of the forming candle last announced on the intrabar path. */
  last_intrabar_fired_anchor_ms?: number | null;
  /**
   * FEAT-0810 — the exit action ledger, TS-side only like the anchors above.
   *
   * One entry per owned position: the last close anchor at which this rule's
   * exit acted on it. The idempotency the exit window needs across a reload
   * — "two evaluations of the same (ruleId, anchor, positionId) produce one
   * close" — lives here, keyed by positionId because a rule may own several
   * positions over its life and each is its own exit story.
   */
  last_exit_action_anchors?: Record<string, number>;
}

/**
 * BUG-0491 — one bot's durable gate anchors, as the persistence port carries
 * them. `null` is "no record", never "anchor zero": the gate seeds only the
 * maps a non-null value names.
 */
export interface BotAnchorSnapshot {
  evaluatedAnchorMs: number | null;
  intrabarAnchorMs: number | null;
  intrabarFiredAnchorMs: number | null;
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
