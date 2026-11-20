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

//! Conditions, and how they compose.
//!
//! Four shapes, no more:
//!
//! - `compare` — two operands and a comparison, read at one closed candle.
//! - `cross` — one operand crossing another between the previous closed candle
//!   and this one. This is what FEAT-0027's price alerts are.
//! - `account` — position and exposure state. Refused below `simulate`, because
//!   an alert engine has no position book to check it against.
//! - `group` — all/any/none over sub-conditions, so FEAT-0030's combined alerts
//!   have something to build on rather than beside.
//!
//! And one shape that exists only to be refused in the wrong place:
//! `external_feed`. ADR-0012 decision 7 permits a third-party aggregate to veto
//! or annotate a trigger and forbids it from being one. A schema with no way to
//! *say* "funding rate" cannot distinguish those two cases — it can only reject
//! the whole idea, which pushes the feature into some other format later. So the
//! variant exists, validates inside a `veto`, and is refused inside `conditions`
//! with a reason that cites the decision.

use std::fmt;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::indicator::{is_cumulative, IndicatorRef};
use super::pattern::CandlePattern;
use super::refusal::{RefusalCode, RuleRefusal};
use super::timeframe::Timeframe;

/// How deep a condition tree may nest.
///
/// The evaluator walks the tree recursively and the crate builds with
/// `panic = "abort"`, so an unbounded document is a stack overflow that takes
/// the whole panel down rather than an error anybody can catch. Eight is far
/// past any rule a human writes and far short of any stack this runs on.
pub const MAX_CONDITION_DEPTH: usize = 8;

/// The longest span an [`Operand::Window`] may aggregate over.
///
/// A per-operand sanity filter, not the bound that decides whether a rule can
/// ever fire — that is [`MAX_RULE_WARMUP_CANDLES`], which counts the *total*
/// including the inner operand's own warmup. The two share a number and do
/// different jobs: `window(min, 500, ema(50))` passes this one and is refused
/// by the other at 550.
pub const MAX_WINDOW_LOOKBACK: u32 = 500;

/// The most closed candles a document may need before it can produce a verdict.
///
/// ADR-0016 decided the figure. It exists because the alternative to refusing
/// an over-deep rule is not a slower rule, it is a *silent* one:
/// `ruleEvaluationGate` withholds a verdict while the series is shorter than
/// `warmup_candles()` and has no separate state for "and it always will be", so
/// an unmeetable requirement is indistinguishable from a rule still warming up.
///
/// 500 admits Bollinger's 120-candle Squeeze over a 20-period band at 140 and a
/// 200-candle window at 220, and refuses the depths where ADR-0009's paging —
/// Bitunix serves 200 rows per response — turns arming an alert into a
/// download. It is a chosen figure, not a measured one; raising it is a change
/// to this constant and a note in ADR-0016, never a per-rule override.
pub const MAX_RULE_WARMUP_CANDLES: u32 = 500;

/// Which OHLC value of the closed candle to read.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PriceField {
    Open,
    High,
    Low,
    Close,
    /// (high + low) / 2
    Hl2,
    /// (high + low + close) / 3
    Hlc3,
}

/// What a number *means*, so that two of them can be refused rather than
/// silently compared.
///
/// Derived metadata, never part of a document: it carries no `Serialize`, so
/// adding it changes no canonical form and breaks no content hash.
///
/// It exists because the operand list stopped being homogeneous. While every
/// operand was a price or a percentage of one, "compare the two sides" needed
/// no qualification. `Volume` is the first operand denominated in something
/// else entirely — traded size, not quote currency — and a schema in which
/// `volume > 65000` can mean "volume above the BTC price" is a schema that
/// fires alerts on arithmetic nobody wrote. Validation is the last point where
/// that mistake is still free.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Dimension {
    /// Quote currency: a price, a band, a moving average of one.
    Price,
    /// Percent. `PercentChange`, and the oscillators bounded to 0..100.
    Percent,
    /// Traded size, in contracts or base units.
    Volume,
    /// A ratio or an index whose scale is its own — `percent_b`, a histogram
    /// of price differences.
    Unitless,
}

impl Dimension {
    /// Whether two known dimensions may sit on opposite sides of a comparison.
    ///
    /// Deliberately identity and nothing cleverer. There is no partial order
    /// here worth encoding: a price is not "almost" a volume, and any pair that
    /// wants an exception wants a written-down conversion instead.
    pub fn compatible_with(self, other: Self) -> bool {
        self == other
    }
}

impl fmt::Display for Dimension {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Price => "price",
            Self::Percent => "percent",
            Self::Volume => "volume",
            Self::Unitless => "unitless",
        })
    }
}

/// Which price series a candle is read from.
///
/// On a perpetual the last traded price and the mark price differ, and the gap
/// is widest exactly when it matters — a wick that liquidates on one and not on
/// the other. A stop that should key off the mark price but keys off the last is
/// a wrong alarm at the worst moment, so the series is part of the rule rather
/// than a display preference.
///
/// `Last` is the default and is never serialised (see `is_last`), so every
/// document written before this variant existed keeps its exact canonical form
/// — and therefore its content hash. That is what makes this addition free of a
/// schema version bump and of a migration.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PriceSource {
    /// The last traded price. What a spot chart shows.
    #[default]
    Last,
    /// The venue's mark price, which drives liquidation and unrealised PnL.
    Mark,
}

impl PriceSource {
    /// Whether this is the default, for `skip_serializing_if`.
    ///
    /// Takes a reference because that is the shape serde's attribute calls.
    pub fn is_last(&self) -> bool {
        matches!(self, Self::Last)
    }
}

impl fmt::Display for PriceSource {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Last => "last-price",
            Self::Mark => "mark-price",
        })
    }
}

/// The comparisons a condition may make.
///
/// A closed set, so "validation rejects unknown operators" is true by
/// construction rather than by a lookup table someone forgets to update.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CompareOp {
    Lt,
    Lte,
    Gt,
    Gte,
    Eq,
    Neq,
}

impl CompareOp {
    pub fn apply(self, left: Decimal, right: Decimal) -> bool {
        match self {
            Self::Lt => left < right,
            Self::Lte => left <= right,
            Self::Gt => left > right,
            Self::Gte => left >= right,
            Self::Eq => left == right,
            Self::Neq => left != right,
        }
    }
}

/// Which way a crossing counts.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CrossDirection {
    /// Was at or below, is now above.
    Above,
    /// Was at or above, is now below.
    Below,
    /// Either direction. This is FEAT-0027's `price_reached`.
    Any,
}

/// How sub-conditions of a group combine.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum LogicOp {
    All,
    Any,
    /// True when none of the members is true. Spelled `none` rather than `not`
    /// because it takes a list, and a `not` that quietly ignored its second
    /// member would be a rule meaning something other than it reads.
    None,
}

/// One side of a comparison.
///
/// There is no expression variant and no string variant, by construction:
/// ADR-0012 decision 1 forbids evaluating a rule by executing supplied text, and
/// the cheapest guarantee is to leave nowhere for text to sit.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operand {
    Price {
        field: PriceField,
        #[serde(default, skip_serializing_if = "PriceSource::is_last")]
        source: PriceSource,
    },
    /// Traded volume of the closed candle.
    ///
    /// Deliberately *not* a `PriceField`. That enum names which OHLC value to
    /// read, and all of its values are denominated in quote currency — which is
    /// exactly what makes them comparable against a price threshold. Volume is
    /// denominated in size. Folding it in would have cost one enum variant and
    /// would have made `volume > 65000` a legal document; as its own operand
    /// with its own `Dimension`, that pair is refused by `Condition::validate`.
    ///
    /// No `source`: `PriceSource` separates the last-traded series from the mark
    /// series, and a mark price is a derived quote with no volume of its own.
    /// Volume is read from the last-traded series, which is also the series
    /// every indicator in this crate is computed over.
    Volume {},
    Indicator {
        indicator: IndicatorRef,
    },
    /// A fixed threshold. Decimal, carried as a string: it is compared against a
    /// price, so `f64` is forbidden here as everywhere else in this app.
    Constant {
        value: Decimal,
    },
    /// How far the price has moved, in percent, from a candle `lookback` closes
    /// earlier: `(now - then) / then * 100`.
    ///
    /// The reference is a *closed candle*, not the price at the moment the rule
    /// was armed. That is the difference between a rule and a bookmark: a
    /// threshold baked in at arming time is tied to one symbol at one instant
    /// and cannot be carried into a template or proposed by a model, whereas
    /// "5% over three 4h closes" means the same thing on every market. It is
    /// also the only form a backtest and a live run can agree on, which is what
    /// ADR-0012 exists to guarantee.
    ///
    /// Positive for a rise, negative for a fall, so "fell 5%" is
    /// `PercentChange <= -5` and needs no second variant.
    PercentChange {
        field: PriceField,
        #[serde(default, skip_serializing_if = "PriceSource::is_last")]
        source: PriceSource,
        /// How many closes back the reference candle sits. At least 1.
        lookback: u32,
    },
    /// The lowest or highest value another operand took over the last
    /// `lookback` closes, the current one included.
    ///
    /// This is what makes "at a 20-candle high" and John Bollinger's actual
    /// Squeeze — the *lowest* bandwidth over a long window, not a fixed
    /// threshold — expressible. It is an operand and not a fifth `Condition`
    /// shape on purpose: the claim being made is about a *value*, so it belongs
    /// where values live, and it then inherits `dimension()`, `timeframes()`
    /// and the whole dimensional guard instead of needing its own copy of each.
    /// ADR-0016 is the decision and carries the reasoning.
    ///
    /// A minimum over a window is not a swing pivot, and a rule built from two
    /// of these is not textbook divergence. Identifying a pivot needs a
    /// pivot-strength parameter whose honest value depends on how much *future*
    /// the detector may see, which is exactly the class ADR-0012 decision 3
    /// excluded VWAP for: a value a backtest and a live run disagree about is
    /// not a rule input. The window shape costs the textbook picture and keeps
    /// the agreement.
    Window {
        /// The operand aggregated over the window. Must not itself be a
        /// `Window` — see `RefusalCode::NestedWindow`.
        of: Box<Operand>,
        agg: WindowAgg,
        /// How many closes the window spans, the current one included, so
        /// `lookback: 1` would be the operand itself and is refused.
        lookback: u32,
    },
    /// FEAT-0815 — the volatility regime: the percentile rank (0..=100) of the
    /// current ATR(`period`) among its last `lookback` values, the current one
    /// included. The share of those values at or below the current one, times
    /// 100 — so the highest ATR of the window reads 100, and a tie can never
    /// make the answer depend on the order of equal values.
    ///
    /// An operand over the ATR the alert path already computes, not a new
    /// indicator: it exposes where volatility sits, in percent.
    AtrPercentile { period: u32, lookback: u32 },
}

/// The ATR series an `AtrPercentile` ranks. Built the way a document spells a
/// bare ATR reference, so the series the alert path computes for it is found
/// under the same key.
pub fn atr_ref(period: u32) -> IndicatorRef {
    let mut params = std::collections::BTreeMap::new();
    params.insert("period".to_string(), super::indicator::ParamValue::Count(period));
    IndicatorRef {
        id: "atr".to_string(),
        params,
        output: "value".to_string(),
        field: None,
    }
}

/// Which end of a window a `Operand::Window` reads.
///
/// `Min` and `Max` only. No `Mean`: `sma`, `ema` and `volume_ma` already
/// average over a period, and a second way to write the same number is a second
/// thing to keep consistent with the first.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum WindowAgg {
    Min,
    Max,
}

/// Account state a rule may read at `simulate` and above.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AccountField {
    /// Signed size of the open position in the base asset; negative when short.
    PositionSize,
    /// Unrealised profit or loss in the quote asset.
    UnrealisedPnl,
    /// Unrealised profit or loss as a percentage of the position's margin.
    UnrealisedPnlPercent,
    /// Notional exposure across all open positions, in the quote asset.
    Exposure,
    /// Free collateral in the quote asset.
    AvailableBalance,
}

/// Which side an open position must be on.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PositionSide {
    Long,
    Short,
    /// Either direction — "in a position at all".
    Either,
}

/// The condition tree.
///
/// Internally tagged on `kind`, so a document reads as prose and an unknown
/// `kind` is a parse refusal rather than a variant silently matching something
/// close by. `deny_unknown_fields` does the same for stray keys inside a variant.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Condition {
    /// `left op right`, both read at the last close of `timeframe`.
    Compare {
        left: Operand,
        op: CompareOp,
        right: Operand,
        timeframe: Timeframe,
    },
    /// `left` crossing `right` between the previous close of `timeframe` and
    /// this one.
    Cross {
        left: Operand,
        direction: CrossDirection,
        right: Operand,
        timeframe: Timeframe,
    },
    /// An open position on a given side, or the absence of one.
    Position { side: PositionSide, open: bool },
    /// A numeric account value against a threshold.
    Account {
        field: AccountField,
        op: CompareOp,
        value: Decimal,
    },
    /// all / any / none over members.
    Group { op: LogicOp, of: Vec<Condition> },
    /// A candlestick pattern printing on the last closed candle of `timeframe`.
    ///
    /// Carries no operator: a pattern either printed or it did not, and the
    /// shapes that would need a threshold (how long is a "long" shadow) are
    /// settled once in `pattern.rs` rather than per rule, so two traders' hammers
    /// are the same hammer.
    Pattern {
        pattern: CandlePattern,
        timeframe: Timeframe,
    },
    /// A third-party aggregate. Legal in `veto`, refused in `conditions`.
    ExternalFeed {
        /// Opaque feed identifier — a screener, a funding rate, a heatmap.
        feed: String,
        op: CompareOp,
        value: Decimal,
    },
    /// FEAT-0815 — true when the anchor instant falls inside a daily UTC
    /// window: `from` inclusive, `to` exclusive, both `HH:MM`. A window whose
    /// `from` is later than its `to` wraps midnight (`22:00`–`02:00`). The
    /// instant is the anchor candle's close, the moment the verdict is made.
    /// Stored as text with the timezone spelled out, so the document says what
    /// it means without a named session or a DST rule anywhere in it.
    Session {
        from: String,
        to: String,
        timezone: String,
    },
}

/// Minutes after midnight for an `HH:MM` time, or `None` when it is not one.
/// Exactly two digits each side: `9:00` and `24:00` are refused, not guessed.
pub fn session_minute(time: &str) -> Option<u32> {
    let (h, m) = time.split_once(':')?;
    if h.len() != 2 || m.len() != 2 || !h.bytes().chain(m.bytes()).all(|b| b.is_ascii_digit()) {
        return None;
    }
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Whether `minute` (after midnight) is inside `[from, to)`, wrapping midnight
/// when `from > to`. `from == to` is refused by `validate` and is never true here.
pub fn in_session(minute: u32, from: u32, to: u32) -> bool {
    if from < to {
        minute >= from && minute < to
    } else if from > to {
        minute >= from || minute < to
    } else {
        false
    }
}

/// Where in the document a condition sits, which decides what it may be.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConditionSite {
    /// The firing condition. No external feeds here.
    Trigger,
    /// The suppression condition. External feeds are the point here.
    Veto,
    /// An exit's `when` clause — FEAT-0809. Evaluated against the position
    /// the owning bot holds, so account state is as legal here as in the
    /// trigger; external feeds are as illegal, for the same honesty reason
    /// the trigger refuses them (an exit is an action, and a backtest cannot
    /// replay a closing decision made on an unversioned feed).
    Exit,
}

impl Condition {
    /// Validate this subtree against its site, the document's trigger timeframe,
    /// and the consequence level the document declares.
    ///
    /// Collects every refusal rather than the first, so one pass tells a caller
    /// everything that has to change.
    pub fn validate(
        &self,
        field: &str,
        site: ConditionSite,
        trigger: Timeframe,
        may_read_account: bool,
        depth: usize,
        out: &mut Vec<RuleRefusal>,
    ) {
        if depth > MAX_CONDITION_DEPTH {
            out.push(RuleRefusal::new(
                RefusalCode::ConditionTreeTooDeep,
                field,
                format!("condition tree nests deeper than {MAX_CONDITION_DEPTH}"),
            ));
            return;
        }

        match self {
            Self::Compare {
                left,
                right,
                timeframe,
                ..
            } => {
                Self::check_timeframe(*timeframe, trigger, field, out);
                left.validate(&format!("{field}.left"), out);
                right.validate(&format!("{field}.right"), out);
                Self::check_dimensions(left, right, field, out);
                Self::check_cumulative(left, right, field, out);
            }
            Self::Cross {
                left,
                right,
                timeframe,
                ..
            } => {
                Self::check_timeframe(*timeframe, trigger, field, out);
                left.validate(&format!("{field}.left"), out);
                right.validate(&format!("{field}.right"), out);
                Self::check_dimensions(left, right, field, out);
                Self::check_cumulative(left, right, field, out);
            }
            Self::Pattern { timeframe, .. } => {
                Self::check_timeframe(*timeframe, trigger, field, out);
            }
            Self::Position { .. } | Self::Account { .. } => {
                if !may_read_account {
                    out.push(RuleRefusal::new(
                        RefusalCode::FieldNotHonouredAtLevel,
                        field,
                        "a `notify` rule cannot read account state: the alert engine \
                         evaluates against a price feed and holds no position book, so \
                         this condition would never be checked. Author the rule at \
                         `simulate` or above.",
                    ));
                }
            }
            Self::Group { of, .. } => {
                if of.is_empty() {
                    out.push(RuleRefusal::new(
                        RefusalCode::EmptyConditionTree,
                        format!("{field}.of"),
                        "a group with no members has no truth value",
                    ));
                }
                for (i, member) in of.iter().enumerate() {
                    member.validate(
                        &format!("{field}.of[{i}]"),
                        site,
                        trigger,
                        may_read_account,
                        depth + 1,
                        out,
                    );
                }
            }
            Self::ExternalFeed { feed, .. } => {
                if site == ConditionSite::Trigger {
                    out.push(RuleRefusal::new(
                        RefusalCode::ExternalFeedTrigger,
                        field,
                        format!(
                            "`{feed}` is a third-party aggregate. Per ADR-0012 decision 7 \
                             such a feed may veto or annotate a trigger but never be one, \
                             because a backtest over an unversioned feed cannot be honest. \
                             Move it to `veto`."
                        ),
                    ));
                }
                if site == ConditionSite::Exit {
                    out.push(RuleRefusal::new(
                        RefusalCode::ExternalFeedExit,
                        field,
                        format!(
                            "`{feed}` is a third-party aggregate, and an exit is an action: \
                             a backtest cannot replay a closing decision made on an \
                             unversioned feed. Per ADR-0012 decision 7 the feed may veto a \
                             trigger; move it there, or author the exit on market or account \
                             state."
                        ),
                    ));
                }
                if feed.trim().is_empty() {
                    out.push(RuleRefusal::new(
                        RefusalCode::UnknownField,
                        format!("{field}.feed"),
                        "external feed has no identifier",
                    ));
                }
            }
            Self::Session { from, to, timezone } => {
                if timezone != "UTC" {
                    out.push(RuleRefusal::new(
                        RefusalCode::InvalidSessionWindow,
                        format!("{field}.timezone"),
                        format!(
                            "`{timezone}` is not a timezone this schema evaluates in; a session \
                             window is stored in UTC so it means the same instant everywhere \
                             and never shifts with a daylight-saving rule"
                        ),
                    ));
                }
                let mut bounds = [None, None];
                for (slot, (name, time)) in [("from", from), ("to", to)].into_iter().enumerate() {
                    bounds[slot] = session_minute(time);
                    if bounds[slot].is_none() {
                        out.push(RuleRefusal::new(
                            RefusalCode::InvalidSessionWindow,
                            format!("{field}.{name}"),
                            format!("`{time}` is not a time of day as HH:MM, 00:00 to 23:59"),
                        ));
                    }
                }
                if let [Some(f), Some(t)] = bounds {
                    if f == t {
                        out.push(RuleRefusal::new(
                            RefusalCode::InvalidSessionWindow,
                            field,
                            "a session that starts where it ends is either empty or the whole \
                             day, and the document cannot say which; give it a length",
                        ));
                    }
                }
            }
        }
    }

    /// Refuse a comparison whose two sides are denominated in different things.
    ///
    /// Scoped to pairs involving `Volume`, the dimension this schema just
    /// gained. The check generalises — `Dimension` knows a price and a
    /// percentage are no more comparable than a price and a volume — but
    /// switching it on for pairs that were legal yesterday would refuse rules
    /// traders already have in `localStorage`, and a saved alert that stops
    /// validating is a worse failure than the one being prevented. Widening it
    /// is its own change, with its own migration story.
    fn check_dimensions(left: &Operand, right: &Operand, field: &str, out: &mut Vec<RuleRefusal>) {
        let (Some(l), Some(r)) = (left.dimension(), right.dimension()) else {
            return;
        };
        if l.compatible_with(r) {
            return;
        }
        if l != Dimension::Volume && r != Dimension::Volume {
            return;
        }
        out.push(RuleRefusal::new(
            RefusalCode::OperandDimensionMismatch,
            field,
            format!(
                "the two sides are denominated differently: {l} against {r}. Traded \
                 volume is not the same kind of number as another dimension, so this condition \
                 would fire on arithmetic rather than on a market event. Compare volume \
                 against a volume average (`volume_ma`) or against a plain threshold."
            ),
        ));
    }

    /// Refuse a cumulative indicator compared against anything but a window
    /// over the same indicator.
    ///
    /// OBV's level is a running total from the first candle it is handed, and
    /// the alert path reads a rolling buffer, so a constant shift appears with
    /// every candle trimmed from the front. The shift cancels only between the
    /// indicator and an extreme of its own recent values — "OBV at its 20-candle
    /// high" — so that is the one pairing accepted. A window against a window
    /// cancels too, but is not a claim anyone makes, and is refused with the rest.
    ///
    /// New, so no stored rule relied on it: before FEAT-0446 group 4 the alert
    /// path computed no OBV, and every OBV rule was already unevaluable.
    ///
    /// Stays out of a pair with an indicator the registry does not know, as
    /// `check_dimensions` does: `IndicatorRef::validate` has already refused it
    /// precisely, and one bad document gets one refusal.
    fn check_cumulative(left: &Operand, right: &Operand, field: &str, out: &mut Vec<RuleRefusal>) {
        if left.reads_unregistered_indicator() || right.reads_unregistered_indicator() {
            return;
        }
        let (l, r) = (left.cumulative_reading(), right.cumulative_reading());
        if l.is_none() && r.is_none() {
            return;
        }
        if let (Some((l_ref, l_windowed)), Some((r_ref, r_windowed))) = (l, r) {
            if l_ref == r_ref && l_windowed != r_windowed {
                return;
            }
        }
        out.push(RuleRefusal::new(
            RefusalCode::CumulativeNeedsOwnWindow,
            field,
            "a cumulative indicator's level depends on how much history is loaded, so it \
             can only be compared with a window over itself: `obv >= window(max, N, obv)` \
             for a new N-candle high, `obv <= window(min, N, obv)` for a new low",
        ));
    }

    fn check_timeframe(tf: Timeframe, trigger: Timeframe, field: &str, out: &mut Vec<RuleRefusal>) {
        if let Err(e) = tf.check_against_trigger(trigger, &format!("{field}.timeframe")) {
            out.push(e);
        }
    }

    /// Every timeframe this subtree reads, for the evaluator to pre-load.
    pub fn timeframes(&self, into: &mut Vec<Timeframe>) {
        match self {
            Self::Compare { timeframe, .. }
            | Self::Cross { timeframe, .. }
            | Self::Pattern { timeframe, .. } => {
                if !into.contains(timeframe) {
                    into.push(*timeframe);
                }
            }
            Self::Group { of, .. } => of.iter().for_each(|c| c.timeframes(into)),
            Self::Position { .. }
            | Self::Account { .. }
            | Self::ExternalFeed { .. }
            | Self::Session { .. } => {}
        }
    }

    /// Every timeframe this subtree reads from the **mark-price** series.
    ///
    /// Separate from [`timeframes`](Self::timeframes) so a caller can fetch a
    /// mark series only where a rule actually asks for one. Mark candles are a
    /// second request per symbol and timeframe, and not every venue serves
    /// them at all, so subscribing to one no condition reads would be a cost
    /// paid for nothing.
    pub fn mark_timeframes(&self, into: &mut Vec<Timeframe>) {
        match self {
            Self::Compare {
                left,
                right,
                timeframe,
                ..
            }
            | Self::Cross {
                left,
                right,
                timeframe,
                ..
            } => {
                let reads_mark = [left, right]
                    .iter()
                    .any(|o| o.price_source() == Some(PriceSource::Mark));
                if reads_mark && !into.contains(timeframe) {
                    into.push(*timeframe);
                }
            }
            Self::Group { of, .. } => of.iter().for_each(|c| c.mark_timeframes(into)),
            Self::Pattern { .. }
            | Self::Position { .. }
            | Self::Account { .. }
            | Self::ExternalFeed { .. }
            | Self::Session { .. } => {}
        }
    }

    /// The most candles any indicator in this subtree needs before it has a
    /// value, per timeframe-agnostic count.
    pub fn warmup_candles(&self) -> u32 {
        match self {
            Self::Compare { left, right, .. } | Self::Cross { left, right, .. } => {
                left.warmup_candles().max(right.warmup_candles())
            }
            Self::Group { of, .. } => of.iter().map(|c| c.warmup_candles()).max().unwrap_or(0),
            Self::Pattern { pattern, .. } => pattern.warmup_candles(),
            _ => 0,
        }
    }
}

impl Operand {
    /// The cumulative indicator this operand reads, and whether through a
    /// window, or `None` when it reads none. See `Condition::check_cumulative`.
    fn cumulative_reading(&self) -> Option<(&IndicatorRef, bool)> {
        match self {
            Self::Indicator { indicator } if is_cumulative(&indicator.id) => Some((indicator, false)),
            Self::Window { of, .. } => match of.as_ref() {
                Self::Indicator { indicator } if is_cumulative(&indicator.id) => Some((indicator, true)),
                _ => None,
            },
            _ => None,
        }
    }

    /// Whether this operand reads an indicator id or output the registry does
    /// not know, bare or through a window. `IndicatorRef::output_dimension` is
    /// `None` exactly then, since every registered output carries a dimension.
    fn reads_unregistered_indicator(&self) -> bool {
        match self {
            Self::Indicator { indicator } => indicator.output_dimension().is_none(),
            Self::Window { of, .. } => of.reads_unregistered_indicator(),
            _ => false,
        }
    }

    pub fn validate(&self, field: &str, out: &mut Vec<RuleRefusal>) {
        match self {
            Self::Indicator { indicator } => indicator.validate(&format!("{field}.indicator"), out),
            Self::PercentChange { lookback, .. } => {
                if *lookback == 0 {
                    out.push(RuleRefusal::new(
                        RefusalCode::InvalidLookback,
                        format!("{field}.lookback"),
                        "a percentage move needs an earlier candle to measure from; \
                         a lookback of 0 compares a candle with itself and is always \
                         zero percent",
                    ));
                }
            }
            Self::Window { of, lookback, .. } => {
                if matches!(**of, Self::Window { .. }) {
                    out.push(RuleRefusal::new(
                        RefusalCode::NestedWindow,
                        format!("{field}.of"),
                        "a window over a window is not a claim anyone makes on purpose, \
                         and it would let the history requirement compound out of sight. \
                         Aggregate over a plain operand instead.",
                    ));
                }
                if *lookback < 2 {
                    out.push(RuleRefusal::new(
                        RefusalCode::InvalidWindowLookback,
                        format!("{field}.lookback"),
                        "a window of fewer than two closes is the operand itself, so \
                         both `min` and `max` return the value being compared against; \
                         the condition could never discriminate",
                    ));
                }
                if *lookback > MAX_WINDOW_LOOKBACK {
                    out.push(RuleRefusal::new(
                        RefusalCode::InvalidWindowLookback,
                        format!("{field}.lookback"),
                        format!(
                            "a window may span at most {MAX_WINDOW_LOOKBACK} closes; \
                             deeper history is paged in 200-row requests and an alert \
                             that cannot warm up stays quiet rather than failing"
                        ),
                    ));
                }
                of.validate(&format!("{field}.of"), out);
            }
            Self::AtrPercentile { period, lookback } => {
                atr_ref(*period).validate(field, out);
                if *lookback < 2 || *lookback > MAX_WINDOW_LOOKBACK {
                    out.push(RuleRefusal::new(
                        RefusalCode::InvalidWindowLookback,
                        format!("{field}.lookback"),
                        format!(
                            "a volatility rank needs between 2 and {MAX_WINDOW_LOOKBACK} ATR \
                             values to rank against; one value is always its own top"
                        ),
                    ));
                }
            }
            Self::Price { .. } | Self::Constant { .. } | Self::Volume {} => {}
        }
    }

    /// What this operand's value means, when that is knowable.
    ///
    /// `None` is not ignorance waiting to be fixed — it is the correct answer
    /// for an operand that is legitimately comparable against anything:
    ///
    /// - `Constant` carries no unit by design. `price > 65000`,
    ///   `percent_change <= -5` and `rsi > 70` are each a constant against a
    ///   different dimension, so giving it one would break all three.
    /// - An indicator whose id or output the registry does not know has already
    ///   been refused by `IndicatorRef::validate`. Guessing here would add a
    ///   second, vaguer refusal for a document that already has a precise one.
    pub fn dimension(&self) -> Option<Dimension> {
        match self {
            Self::Price { .. } => Some(Dimension::Price),
            Self::Volume {} => Some(Dimension::Volume),
            Self::PercentChange { .. } => Some(Dimension::Percent),
            Self::Constant { .. } => None,
            Self::Indicator { indicator } => indicator.output_dimension(),
            // A minimum of a percentage is a percentage. Aggregating over a
            // window picks one of the values the inner operand already
            // produced, so it cannot change what the number is denominated in
            // — which is why this is an operand and not a condition shape:
            // the dimensional guard is inherited rather than re-implemented.
            Self::Window { of, .. } => of.dimension(),
            Self::AtrPercentile { .. } => Some(Dimension::Percent),
        }
    }

    pub fn warmup_candles(&self) -> u32 {
        match self {
            Self::Indicator { indicator } => indicator.warmup_candles(),
            // A crossing still needs the previous closed candle.
            Self::Price { .. } | Self::Volume {} => 2,
            // The reference candle plus the one being measured. `saturating_add`
            // because a document arrives from outside and `lookback` is only
            // bounded by its type until `validate` has run.
            Self::PercentChange { lookback, .. } => lookback.saturating_add(1),
            Self::Constant { .. } => 0,
            // The inner operand's own warmup plus the window, minus the candle
            // the two share: the window includes the current close, which is
            // the same close the inner operand's warmup already counts.
            // Saturating in both directions because a document arrives from
            // outside and `lookback` is only bounded by its type until
            // `validate` has run.
            Self::Window { of, lookback, .. } => of
                .warmup_candles()
                .saturating_add(*lookback)
                .saturating_sub(1),
            // The ATR's own warmup (period + 1) plus the ranked window, less
            // the close they share: `period + lookback`.
            Self::AtrPercentile { period, lookback } => atr_ref(*period)
                .warmup_candles()
                .saturating_add(*lookback)
                .saturating_sub(1),
        }
    }

    /// Which price series this operand reads, if it reads one at all.
    ///
    /// The evaluator uses this to decide whether a rule needs a mark-price
    /// series before it can produce a verdict, and the loop uses it to avoid
    /// subscribing to one no armed rule asks for.
    pub fn price_source(&self) -> Option<PriceSource> {
        match self {
            Self::Price { source, .. } | Self::PercentChange { source, .. } => Some(*source),
            // A window over a mark price still reads the mark series, so this
            // has to delegate: `Condition::mark_timeframes` asks the operands
            // whether a mark subscription is needed, and answering `None` here
            // would leave the rule waiting for a series nobody fetched.
            Self::Window { of, .. } => of.price_source(),
            Self::Indicator { .. }
            | Self::Constant { .. }
            | Self::Volume {}
            | Self::AtrPercentile { .. } => None,
        }
    }
}

#[cfg(test)]
mod feat_0815_tests {
    use super::*;

    fn session(from: &str, to: &str, timezone: &str) -> Condition {
        Condition::Session {
            from: from.to_string(),
            to: to.to_string(),
            timezone: timezone.to_string(),
        }
    }

    fn refusals(condition: &Condition) -> Vec<RuleRefusal> {
        let mut out = Vec::new();
        condition.validate(
            "conditions",
            ConditionSite::Trigger,
            Timeframe::parse("1h").expect("1h parses"),
            false,
            0,
            &mut out,
        );
        out
    }

    #[test]
    fn a_session_time_is_two_digits_each_side_and_inside_the_day() {
        assert_eq!(session_minute("00:00"), Some(0));
        assert_eq!(session_minute("08:30"), Some(510));
        assert_eq!(session_minute("23:59"), Some(1439));
        for bad in ["24:00", "9:00", "08:60", "0800", "08:0a", "", "-1:00"] {
            assert_eq!(session_minute(bad), None, "{bad} must not parse");
        }
    }

    #[test]
    fn a_window_includes_its_start_and_excludes_its_end() {
        let (from, to) = (8 * 60, 16 * 60);
        assert!(in_session(from, from, to));
        assert!(in_session(to - 1, from, to));
        assert!(!in_session(to, from, to));
        assert!(!in_session(from - 1, from, to));
    }

    #[test]
    fn a_window_across_midnight_wraps() {
        let (from, to) = (22 * 60, 2 * 60);
        assert!(in_session(23 * 60, from, to));
        assert!(in_session(0, from, to));
        assert!(in_session(to - 1, from, to));
        assert!(!in_session(to, from, to));
        assert!(!in_session(12 * 60, from, to));
        assert!(in_session(from, from, to));
    }

    #[test]
    fn an_empty_or_full_day_window_is_refused() {
        let out = refusals(&session("08:00", "08:00", "UTC"));
        assert!(out
            .iter()
            .any(|r| r.code == RefusalCode::InvalidSessionWindow && r.field == "conditions"));
    }

    #[test]
    fn a_malformed_time_is_refused_with_its_field_path() {
        let out = refusals(&session("8:00", "16:00", "UTC"));
        assert!(out.iter().any(|r| r.field == "conditions.from"));
        let out = refusals(&session("08:00", "25:00", "UTC"));
        assert!(out.iter().any(|r| r.field == "conditions.to"));
    }

    #[test]
    fn a_timezone_other_than_utc_is_refused() {
        let out = refusals(&session("08:00", "16:00", "Europe/Berlin"));
        assert!(out.iter().any(|r| r.field == "conditions.timezone"));
        assert!(refusals(&session("08:00", "16:00", "UTC")).is_empty());
    }

    #[test]
    fn the_atr_rank_needs_period_plus_lookback_candles() {
        let operand = Operand::AtrPercentile {
            period: 14,
            lookback: 100,
        };
        assert_eq!(operand.warmup_candles(), 114);
        assert_eq!(operand.dimension(), Some(Dimension::Percent));
    }

    #[test]
    fn the_atr_rank_refuses_a_window_outside_two_to_the_ceiling() {
        for lookback in [0, 1, MAX_WINDOW_LOOKBACK + 1] {
            let mut out = Vec::new();
            Operand::AtrPercentile { period: 14, lookback }.validate("x", &mut out);
            assert!(
                out.iter().any(|r| r.code == RefusalCode::InvalidWindowLookback && r.field == "x.lookback"),
                "lookback {lookback} must be refused"
            );
        }
        let mut out = Vec::new();
        Operand::AtrPercentile { period: 14, lookback: 2 }.validate("x", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn both_spell_themselves_on_the_wire_as_the_document_does() {
        let operand: Operand =
            serde_json::from_str(r#"{"kind":"atr_percentile","period":14,"lookback":100}"#).unwrap();
        assert_eq!(operand, Operand::AtrPercentile { period: 14, lookback: 100 });
        let condition: Condition =
            serde_json::from_str(r#"{"kind":"session","from":"22:00","to":"02:00","timezone":"UTC"}"#)
                .unwrap();
        assert_eq!(condition, session("22:00", "02:00", "UTC"));
    }
}
