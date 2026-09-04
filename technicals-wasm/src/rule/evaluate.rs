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

//! Deterministic evaluation of a rule document over closed candles.
//!
//! # The evaluation point
//!
//! ADR-0012 decision 3: the evaluation point is candle close on the timeframe the
//! rule names, and intrabar values do not decide. With more than one timeframe in
//! play that needs an anchor, so a document declares one `trigger_timeframe`:
//! the rule is evaluated once per close of that timeframe, and every condition
//! reads the last candle of its own timeframe that had **already closed** at that
//! instant. A 4h condition under a 1h trigger therefore holds the same value for
//! four consecutive evaluations, which is the honest answer — the 4h candle had
//! not closed yet.
//!
//! That "already closed" is the whole defence against lookahead bias. A backtest
//! that let the in-progress 4h candle answer would produce entries no live run
//! could ever have taken.
//!
//! # Why this module computes no indicators
//!
//! `lib.rs` already holds exactly one implementation of RSI, MACD and the rest.
//! A second one here would be the divergence ADR-0012 exists to prevent — two
//! engines disagreeing about whether RSI crossed 30 is a correctness bug, not a
//! porting detail. So the evaluator walks the *tree* and asks a [`MarketView`]
//! for indicator values. The price path, which is all FEAT-0027's alerts need, is
//! self-contained and needs no resolver at all.

use std::collections::BTreeMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::condition::{
    AccountField, Condition, CrossDirection, LogicOp, Operand, PositionSide, PriceField,
};
use super::document::RuleDocument;
use super::indicator::IndicatorRef;
use super::timeframe::Timeframe;

/// One closed candle. `open_time_ms` is the bucket start; the candle is
/// considered closed at `open_time_ms + timeframe`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Candle {
    pub open_time_ms: i64,
    pub open: Decimal,
    pub high: Decimal,
    pub low: Decimal,
    pub close: Decimal,
    #[serde(default)]
    pub volume: Decimal,
}

impl Candle {
    pub fn price(&self, field: PriceField) -> Decimal {
        match field {
            PriceField::Open => self.open,
            PriceField::High => self.high,
            PriceField::Low => self.low,
            PriceField::Close => self.close,
            // `checked_div` rather than `/`: this crate aborts on panic, and the
            // divisor is a constant here, but the habit is what keeps it true.
            PriceField::Hl2 => (self.high + self.low)
                .checked_div(Decimal::from(2))
                .unwrap_or(self.close),
            PriceField::Hlc3 => (self.high + self.low + self.close)
                .checked_div(Decimal::from(3))
                .unwrap_or(self.close),
        }
    }
}

/// Account state at the moment of evaluation. Read only at `simulate` and above.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct AccountSnapshot {
    /// Signed size in the base asset; negative when short, zero when flat.
    pub position_size: Decimal,
    pub unrealised_pnl: Decimal,
    pub unrealised_pnl_percent: Decimal,
    pub exposure: Decimal,
    pub available_balance: Decimal,
}

impl AccountSnapshot {
    fn field(&self, field: AccountField) -> Decimal {
        match field {
            AccountField::PositionSize => self.position_size,
            AccountField::UnrealisedPnl => self.unrealised_pnl,
            AccountField::UnrealisedPnlPercent => self.unrealised_pnl_percent,
            AccountField::Exposure => self.exposure,
            AccountField::AvailableBalance => self.available_balance,
        }
    }

    fn holds(&self, side: PositionSide, open: bool) -> bool {
        let matches = match side {
            PositionSide::Long => self.position_size > Decimal::ZERO,
            PositionSide::Short => self.position_size < Decimal::ZERO,
            PositionSide::Either => self.position_size != Decimal::ZERO,
        };
        matches == open
    }
}

/// What the evaluator can see.
///
/// Implemented by whatever holds market state — the live feed, a backtest's
/// replay cursor, a test fixture. Keeping it a trait is what lets one document
/// produce the same verdict in all three, which is the claim ADR-0012 is built
/// to make true.
pub trait MarketView {
    /// Closed candles for `timeframe`, oldest first. Never includes a candle
    /// still in progress — an implementation that leaked one would reintroduce
    /// exactly the lookahead this design removes.
    fn closed_candles(&self, timeframe: Timeframe) -> &[Candle];

    /// The value of `indicator` at the closed candle with index `index` in
    /// `closed_candles(timeframe)`. `None` means "not available", which becomes
    /// an indeterminate verdict rather than a false condition.
    fn indicator_at(
        &self,
        indicator: &IndicatorRef,
        timeframe: Timeframe,
        index: usize,
    ) -> Option<Decimal>;

    /// The current value of a third-party feed, for a veto. `None` means the
    /// feed is unavailable.
    fn feed_value(&self, _feed: &str) -> Option<Decimal> {
        None
    }
}

/// What an evaluation concluded.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "verdict", rename_all = "snake_case")]
pub enum Verdict {
    /// Conditions held and no veto suppressed them.
    Fires,
    /// Conditions did not hold.
    DoesNotFire,
    /// Conditions held, but a veto suppressed the trigger. Distinct from
    /// `DoesNotFire` because ADR-0012 decision 7 lets a feed suppress, and an
    /// audit needs to see that it did.
    Suppressed,
    /// Neither answer is available: not enough history, or a value the rule
    /// needs could not be read. Never collapsed into `DoesNotFire` — "the
    /// condition is false" and "I could not tell" are different claims, and
    /// FEAT-0027 already learned that a silently swallowed evaluation is a bug
    /// worth surfacing.
    Indeterminate { reason: String },
}

/// A market held in memory. Used by the backtest path and by tests.
#[derive(Default, Clone, Debug)]
pub struct InMemoryMarket {
    series: BTreeMap<Timeframe, Vec<Candle>>,
    indicators: BTreeMap<(String, u64, usize), Decimal>,
    feeds: BTreeMap<String, Decimal>,
}

impl InMemoryMarket {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_candles(mut self, timeframe: Timeframe, candles: Vec<Candle>) -> Self {
        self.series.insert(timeframe, candles);
        self
    }

    /// Pre-set an indicator value. Keyed by the indicator's canonical form so
    /// `rsi(14).value` and `rsi(21).value` cannot collide.
    pub fn with_indicator(
        mut self,
        indicator: &IndicatorRef,
        timeframe: Timeframe,
        index: usize,
        value: Decimal,
    ) -> Self {
        self.indicators.insert(
            (indicator_key(indicator), timeframe.seconds(), index),
            value,
        );
        self
    }

    pub fn with_feed(mut self, feed: &str, value: Decimal) -> Self {
        self.feeds.insert(feed.to_string(), value);
        self
    }
}

fn indicator_key(indicator: &IndicatorRef) -> String {
    // The params map is a BTreeMap, so this is stable across processes.
    format!(
        "{}|{:?}|{}",
        indicator.id, indicator.params, indicator.output
    )
}

impl MarketView for InMemoryMarket {
    fn closed_candles(&self, timeframe: Timeframe) -> &[Candle] {
        self.series
            .get(&timeframe)
            .map(|v| v.as_slice())
            .unwrap_or(&[])
    }

    fn indicator_at(
        &self,
        indicator: &IndicatorRef,
        timeframe: Timeframe,
        index: usize,
    ) -> Option<Decimal> {
        self.indicators
            .get(&(indicator_key(indicator), timeframe.seconds(), index))
            .copied()
    }

    fn feed_value(&self, feed: &str) -> Option<Decimal> {
        self.feeds.get(feed).copied()
    }
}

/// Evaluate `document` at the last closed candle of its trigger timeframe.
///
/// Pure: same document, same market, same account snapshot gives the same
/// verdict, every time and in any order. Nothing here reads a clock, a random
/// source or any mutable global — which is what makes "evaluating one document
/// twice over the same closed candles yields the same verdict" a property of the
/// design rather than a hope.
pub fn evaluate(
    document: &RuleDocument,
    market: &dyn MarketView,
    account: Option<&AccountSnapshot>,
) -> Verdict {
    let trigger = document.trigger_timeframe;
    let trigger_candles = market.closed_candles(trigger);

    let Some(anchor) = trigger_candles.last() else {
        return Verdict::Indeterminate {
            reason: format!("no closed {trigger} candle to evaluate on"),
        };
    };
    // The anchor's close instant: the bucket it opened plus one interval.
    let anchor_close_ms = anchor.open_time_ms + trigger.milliseconds();

    let ctx = Ctx {
        market,
        account,
        anchor_close_ms,
    };

    match eval(&document.conditions, &ctx) {
        Truth::Unknown(reason) => return Verdict::Indeterminate { reason },
        Truth::False => return Verdict::DoesNotFire,
        Truth::True => {}
    }

    if let Some(veto) = &document.veto {
        match eval(veto, &ctx) {
            // A veto that cannot be read must not silently let the trigger
            // through, and must not silently block it either. Say so.
            Truth::Unknown(reason) => {
                return Verdict::Indeterminate {
                    reason: format!("veto could not be evaluated: {reason}"),
                }
            }
            Truth::True => return Verdict::Suppressed,
            Truth::False => {}
        }
    }

    Verdict::Fires
}

struct Ctx<'a> {
    market: &'a dyn MarketView,
    account: Option<&'a AccountSnapshot>,
    anchor_close_ms: i64,
}

/// Three-valued, because "I could not tell" is not "no".
enum Truth {
    True,
    False,
    Unknown(String),
}

impl Ctx<'_> {
    /// Index of the last candle of `timeframe` that had already closed at the
    /// anchor instant. This is the lookahead guard.
    fn closed_index(&self, timeframe: Timeframe) -> Option<usize> {
        let candles = self.market.closed_candles(timeframe);
        let step = timeframe.milliseconds();
        candles
            .iter()
            .rposition(|c| c.open_time_ms + step <= self.anchor_close_ms)
    }

    fn operand_at(&self, operand: &Operand, timeframe: Timeframe, index: usize) -> Option<Decimal> {
        match operand {
            Operand::Constant { value } => Some(*value),
            Operand::Price { field } => self
                .market
                .closed_candles(timeframe)
                .get(index)
                .map(|c| c.price(*field)),
            Operand::Indicator { indicator } => {
                self.market.indicator_at(indicator, timeframe, index)
            }
        }
    }
}

fn eval(condition: &Condition, ctx: &Ctx) -> Truth {
    match condition {
        Condition::Compare {
            left,
            op,
            right,
            timeframe,
        } => {
            let Some(index) = ctx.closed_index(*timeframe) else {
                return Truth::Unknown(format!("no closed {timeframe} candle at the anchor"));
            };
            let (Some(l), Some(r)) = (
                ctx.operand_at(left, *timeframe, index),
                ctx.operand_at(right, *timeframe, index),
            ) else {
                return Truth::Unknown(format!("a {timeframe} operand had no value"));
            };
            truth(op.apply(l, r))
        }

        Condition::Cross {
            left,
            direction,
            right,
            timeframe,
        } => {
            let Some(index) = ctx.closed_index(*timeframe) else {
                return Truth::Unknown(format!("no closed {timeframe} candle at the anchor"));
            };
            let (Some(cur_l), Some(cur_r)) = (
                ctx.operand_at(left, *timeframe, index),
                ctx.operand_at(right, *timeframe, index),
            ) else {
                return Truth::Unknown(format!("a {timeframe} operand had no value"));
            };

            // No predecessor. FEAT-0027 fires `price_reached` on exact equality
            // in this case and never fires a directional cross; that behaviour is
            // reproduced rather than tidied, because the acceptance criterion is
            // that existing alerts keep firing exactly as they did.
            let Some(prev_index) = index.checked_sub(1) else {
                return match direction {
                    CrossDirection::Any => truth(cur_l == cur_r),
                    _ => Truth::False,
                };
            };
            let (Some(prev_l), Some(prev_r)) = (
                ctx.operand_at(left, *timeframe, prev_index),
                ctx.operand_at(right, *timeframe, prev_index),
            ) else {
                return Truth::Unknown(format!("a previous {timeframe} operand had no value"));
            };

            // Strict on the previous side, inclusive on the current side —
            // copied from alert_engine.rs so that a price sitting exactly on the
            // level does not re-fire, which is the behaviour shipped today.
            let up = prev_l < prev_r && cur_l >= cur_r;
            let down = prev_l > prev_r && cur_l <= cur_r;
            truth(match direction {
                CrossDirection::Above => up,
                CrossDirection::Below => down,
                CrossDirection::Any => up || down,
            })
        }

        Condition::Position { side, open } => match ctx.account {
            Some(account) => truth(account.holds(*side, *open)),
            None => Truth::Unknown("no account snapshot available".to_string()),
        },

        Condition::Account { field, op, value } => match ctx.account {
            Some(account) => truth(op.apply(account.field(*field), *value)),
            None => Truth::Unknown("no account snapshot available".to_string()),
        },

        Condition::ExternalFeed { feed, op, value } => match ctx.market.feed_value(feed) {
            Some(current) => truth(op.apply(current, *value)),
            None => Truth::Unknown(format!("feed `{feed}` has no value")),
        },

        Condition::Group { op, of } => eval_group(*op, of, ctx),
    }
}

/// Group evaluation short-circuits only where short-circuiting is sound.
///
/// `all` may stop at the first false and `any` at the first true, because no
/// later member can change that answer. Neither may stop at an unknown: an
/// `all` whose first member is unknown but whose second is false is false, and
/// reporting that as unknown would hide a decided answer behind a missing one.
fn eval_group(op: LogicOp, members: &[Condition], ctx: &Ctx) -> Truth {
    let mut unknown: Option<String> = None;
    let mut seen_true = false;

    for member in members {
        match eval(member, ctx) {
            Truth::True => {
                seen_true = true;
                if op == LogicOp::Any {
                    return Truth::True;
                }
                if op == LogicOp::None {
                    return Truth::False;
                }
            }
            Truth::False => {
                if op == LogicOp::All {
                    return Truth::False;
                }
            }
            Truth::Unknown(reason) => {
                unknown.get_or_insert(reason);
            }
        }
    }

    if let Some(reason) = unknown {
        return Truth::Unknown(reason);
    }
    match op {
        LogicOp::All => Truth::True,
        LogicOp::Any => truth(seen_true),
        LogicOp::None => Truth::True,
    }
}

fn truth(value: bool) -> Truth {
    if value {
        Truth::True
    } else {
        Truth::False
    }
}
