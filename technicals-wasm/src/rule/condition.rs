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

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::indicator::IndicatorRef;
use super::refusal::{RefusalCode, RuleRefusal};
use super::timeframe::Timeframe;

/// How deep a condition tree may nest.
///
/// The evaluator walks the tree recursively and the crate builds with
/// `panic = "abort"`, so an unbounded document is a stack overflow that takes
/// the whole panel down rather than an error anybody can catch. Eight is far
/// past any rule a human writes and far short of any stack this runs on.
pub const MAX_CONDITION_DEPTH: usize = 8;

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
    },
    Indicator {
        indicator: IndicatorRef,
    },
    /// A fixed threshold. Decimal, carried as a string: it is compared against a
    /// price, so `f64` is forbidden here as everywhere else in this app.
    Constant {
        value: Decimal,
    },
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
    /// A third-party aggregate. Legal in `veto`, refused in `conditions`.
    ExternalFeed {
        /// Opaque feed identifier — a screener, a funding rate, a heatmap.
        feed: String,
        op: CompareOp,
        value: Decimal,
    },
}

/// Where in the document a condition sits, which decides what it may be.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConditionSite {
    /// The firing condition. No external feeds here.
    Trigger,
    /// The suppression condition. External feeds are the point here.
    Veto,
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
                if feed.trim().is_empty() {
                    out.push(RuleRefusal::new(
                        RefusalCode::UnknownField,
                        format!("{field}.feed"),
                        "external feed has no identifier",
                    ));
                }
            }
        }
    }

    fn check_timeframe(tf: Timeframe, trigger: Timeframe, field: &str, out: &mut Vec<RuleRefusal>) {
        if let Err(e) = tf.check_against_trigger(trigger, &format!("{field}.timeframe")) {
            out.push(e);
        }
    }

    /// Every timeframe this subtree reads, for the evaluator to pre-load.
    pub fn timeframes(&self, into: &mut Vec<Timeframe>) {
        match self {
            Self::Compare { timeframe, .. } | Self::Cross { timeframe, .. } => {
                if !into.contains(timeframe) {
                    into.push(*timeframe);
                }
            }
            Self::Group { of, .. } => of.iter().for_each(|c| c.timeframes(into)),
            Self::Position { .. } | Self::Account { .. } | Self::ExternalFeed { .. } => {}
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
            _ => 0,
        }
    }
}

impl Operand {
    pub fn validate(&self, field: &str, out: &mut Vec<RuleRefusal>) {
        match self {
            Self::Indicator { indicator } => indicator.validate(&format!("{field}.indicator"), out),
            Self::Price { .. } | Self::Constant { .. } => {}
        }
    }

    pub fn warmup_candles(&self) -> u32 {
        match self {
            Self::Indicator { indicator } => indicator.warmup_candles(),
            // A crossing still needs the previous closed candle.
            Self::Price { .. } => 2,
            Self::Constant { .. } => 0,
        }
    }
}
