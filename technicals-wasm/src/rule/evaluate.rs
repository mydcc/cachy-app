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
    PriceSource,
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

    /// Closed candles for `timeframe` on a specific price series.
    ///
    /// `None` means the series is genuinely unavailable — the venue does not
    /// serve it, or it has not been fetched yet — and produces an indeterminate
    /// verdict. It must never fall back to the last-price series: a rule that
    /// says "mark price" and is answered with the last price is a wrong alarm
    /// that looks like a right one, which is the failure mode FEAT-0390 exists
    /// to remove.
    ///
    /// The default implementation serves `Last` from
    /// [`closed_candles`](Self::closed_candles) and has no mark series, so an
    /// existing implementor keeps working and simply cannot answer mark-price
    /// rules.
    fn closed_candles_from(&self, timeframe: Timeframe, source: PriceSource) -> Option<&[Candle]> {
        match source {
            PriceSource::Last => Some(self.closed_candles(timeframe)),
            PriceSource::Mark => None,
        }
    }

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
    mark_series: BTreeMap<Timeframe, Vec<Candle>>,
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

    /// The mark-price series for `timeframe`. Absent unless set: a market that
    /// was never given one answers "unavailable" rather than quietly serving
    /// last-price candles.
    pub fn with_mark_candles(mut self, timeframe: Timeframe, candles: Vec<Candle>) -> Self {
        self.mark_series.insert(timeframe, candles);
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

    fn closed_candles_from(&self, timeframe: Timeframe, source: PriceSource) -> Option<&[Candle]> {
        match source {
            PriceSource::Last => Some(self.closed_candles(timeframe)),
            PriceSource::Mark => self.mark_series.get(&timeframe).map(|v| v.as_slice()),
        }
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

/// Why an operand could not be read.
///
/// Three cases rather than one string, because `Cross` has to tell them apart:
/// "the series does not reach back one more candle" is the ordinary state at the
/// start of a history and must reproduce FEAT-0027's behaviour, whereas "the
/// series is missing entirely" is a genuine gap that has to surface as an
/// indeterminate verdict.
enum Missing {
    /// The price series itself is unavailable.
    Series(String),
    /// The series exists but does not reach that far back.
    NotEnoughHistory(String),
    /// A value inside the series was absent — an indicator not yet warmed up.
    NoValue(String),
}

impl Missing {
    fn reason(self) -> String {
        match self {
            Self::Series(r) | Self::NotEnoughHistory(r) | Self::NoValue(r) => r,
        }
    }
}

impl Ctx<'_> {
    /// Index of the last candle of `timeframe` that had already closed at the
    /// anchor instant. This is the lookahead guard.
    fn closed_index(&self, timeframe: Timeframe) -> Option<usize> {
        self.closed_index_in(self.market.closed_candles(timeframe), timeframe)
    }

    /// The same guard, against an arbitrary series.
    ///
    /// Applied per series rather than once per condition: the mark-price series
    /// and the last-price series are fetched separately and need not have the
    /// same length, so an index computed in one of them addresses a different
    /// candle in the other. Sharing one index across both is how a mark-price
    /// rule would silently read the wrong bar.
    fn closed_index_in(&self, candles: &[Candle], timeframe: Timeframe) -> Option<usize> {
        let step = timeframe.milliseconds();
        candles
            .iter()
            .rposition(|c| c.open_time_ms + step <= self.anchor_close_ms)
    }

    fn series(&self, timeframe: Timeframe, source: PriceSource) -> Result<&[Candle], Missing> {
        self.market
            .closed_candles_from(timeframe, source)
            .ok_or_else(|| Missing::Series(format!("no {source} candles for {timeframe}")))
    }

    /// The index `back` closes before the anchor, within `candles`.
    fn index_back(
        &self,
        candles: &[Candle],
        timeframe: Timeframe,
        back: usize,
        source: PriceSource,
    ) -> Result<usize, Missing> {
        self.closed_index_in(candles, timeframe)
            .and_then(|i| i.checked_sub(back))
            .ok_or_else(|| {
                Missing::NotEnoughHistory(format!(
                    "no {source} {timeframe} candle {back} closes before the anchor"
                ))
            })
    }

    /// An operand's value `back` closes before the anchor. `back` is 0 for the
    /// candle the rule is evaluating on and 1 for its predecessor.
    fn operand_at(
        &self,
        operand: &Operand,
        timeframe: Timeframe,
        back: usize,
    ) -> Result<Decimal, Missing> {
        match operand {
            Operand::Constant { value } => Ok(*value),

            Operand::Price { field, source } => {
                let candles = self.series(timeframe, *source)?;
                let index = self.index_back(candles, timeframe, back, *source)?;
                candles.get(index).map(|c| c.price(*field)).ok_or_else(|| {
                    Missing::NoValue(format!("{source} {timeframe} candle has no price"))
                })
            }

            Operand::PercentChange {
                field,
                source,
                lookback,
            } => {
                let candles = self.series(timeframe, *source)?;
                let index = self.index_back(candles, timeframe, back, *source)?;
                let reference = index.checked_sub(*lookback as usize).ok_or_else(|| {
                    Missing::NotEnoughHistory(format!(
                        "a {lookback}-close percentage move needs {} {source} {timeframe} \
                         candles before the anchor, and only {} are available",
                        lookback + 1,
                        index + 1
                    ))
                })?;
                let (Some(now), Some(then)) = (
                    candles.get(index).map(|c| c.price(*field)),
                    candles.get(reference).map(|c| c.price(*field)),
                ) else {
                    return Err(Missing::NoValue(format!(
                        "{source} {timeframe} candle has no price"
                    )));
                };
                if then.is_zero() {
                    // A zero reference makes the move infinite, not 100%. Say so
                    // rather than dividing.
                    return Err(Missing::NoValue(format!(
                        "the reference {source} {timeframe} price is zero, so a \
                         percentage move from it is undefined"
                    )));
                }
                (now - then)
                    .checked_div(then)
                    .and_then(|ratio| ratio.checked_mul(Decimal::ONE_HUNDRED))
                    .ok_or_else(|| {
                        Missing::NoValue(format!(
                            "the {source} {timeframe} percentage move overflowed"
                        ))
                    })
            }

            // Indicator values are indexed against the last-price series, which
            // is the series every indicator in this crate is computed over.
            Operand::Indicator { indicator } => {
                let index = self
                    .closed_index(timeframe)
                    .and_then(|i| i.checked_sub(back))
                    .ok_or_else(|| {
                        Missing::NotEnoughHistory(format!(
                            "no {timeframe} candle {back} closes before the anchor"
                        ))
                    })?;
                self.market
                    .indicator_at(indicator, timeframe, index)
                    .ok_or_else(|| {
                        Missing::NoValue(format!("an indicator had no {timeframe} value"))
                    })
            }
        }
    }

    /// Both sides of a condition at the same offset.
    fn pair_at(
        &self,
        left: &Operand,
        right: &Operand,
        timeframe: Timeframe,
        back: usize,
    ) -> Result<(Decimal, Decimal), Missing> {
        Ok((
            self.operand_at(left, timeframe, back)?,
            self.operand_at(right, timeframe, back)?,
        ))
    }
}

fn eval(condition: &Condition, ctx: &Ctx) -> Truth {
    match condition {
        Condition::Compare {
            left,
            op,
            right,
            timeframe,
        } => match ctx.pair_at(left, right, *timeframe, 0) {
            Ok((l, r)) => truth(op.apply(l, r)),
            Err(missing) => Truth::Unknown(missing.reason()),
        },

        Condition::Cross {
            left,
            direction,
            right,
            timeframe,
        } => {
            let (cur_l, cur_r) = match ctx.pair_at(left, right, *timeframe, 0) {
                Ok(pair) => pair,
                Err(missing) => return Truth::Unknown(missing.reason()),
            };

            let (prev_l, prev_r) = match ctx.pair_at(left, right, *timeframe, 1) {
                Ok(pair) => pair,
                // No predecessor. FEAT-0027 fires `price_reached` on exact
                // equality in this case and never fires a directional cross;
                // that behaviour is reproduced rather than tidied, because the
                // acceptance criterion is that existing alerts keep firing
                // exactly as they did.
                Err(Missing::NotEnoughHistory(_)) => {
                    return match direction {
                        CrossDirection::Any => truth(cur_l == cur_r),
                        _ => Truth::False,
                    }
                }
                // A missing series or an unreadable value is a real gap, not the
                // start of a history, and must not be reported as "did not cross".
                Err(missing) => return Truth::Unknown(missing.reason()),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rule::condition::CompareOp;
    use crate::rule::consequence::{ConsequenceLevel, RuleAction};
    use crate::rule::document::{AuthoringSource, Provenance};
    use crate::rule::indicator::ParamValue;
    use crate::rule::version::SchemaVersion;
    use std::str::FromStr;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    fn tf(s: &str) -> Timeframe {
        Timeframe::parse(s).unwrap()
    }

    fn rsi(period: u32) -> IndicatorRef {
        let mut params = BTreeMap::new();
        params.insert("period".to_string(), ParamValue::Count(period));
        IndicatorRef {
            id: "rsi".to_string(),
            params,
            output: "value".to_string(),
        }
    }

    fn candles(closes: &[&str]) -> Vec<Candle> {
        closes
            .iter()
            .enumerate()
            .map(|(i, c)| Candle {
                open_time_ms: i as i64 * 14_400_000,
                open: d(c),
                high: d(c),
                low: d(c),
                close: d(c),
                volume: Decimal::ZERO,
            })
            .collect()
    }

    /// "RSI below 30 on the 4h close, only while flat" — a document that touches
    /// an indicator, an account condition and a veto in one evaluation, so a
    /// determinism test here exercises the whole `eval` dispatch, not just the
    /// price path FEAT-0027 already covers via `legacy.rs`.
    fn rsi_dip_while_flat() -> RuleDocument {
        RuleDocument {
            schema_version: SchemaVersion::CURRENT,
            id: "rule-det".to_string(),
            name: "RSI dip while flat".to_string(),
            symbol: "BTCUSDT".to_string(),
            trigger_timeframe: tf("4h"),
            conditions: Condition::Group {
                op: LogicOp::All,
                of: vec![
                    Condition::Compare {
                        left: Operand::Indicator { indicator: rsi(14) },
                        op: CompareOp::Lt,
                        right: Operand::Constant { value: d("30") },
                        timeframe: tf("4h"),
                    },
                    Condition::Position {
                        side: PositionSide::Either,
                        open: false,
                    },
                ],
            },
            veto: Some(Condition::ExternalFeed {
                feed: "liquidation_heatmap".to_string(),
                op: CompareOp::Gt,
                value: d("0.9"),
            }),
            action: RuleAction {
                consequence_level: ConsequenceLevel::Simulate,
                order: None,
            },
            enabled: true,
            provenance: Provenance {
                source: AuthoringSource::Human,
                created_at_ms: 0,
                model: None,
            },
        }
    }

    // ---- FEAT-0390: price source and percentage moves ----------------------

    /// Candles whose bucket index starts at `first`, so two series of different
    /// lengths can still carry the *same* timestamps for the candles they share.
    fn candles_from(first: usize, closes: &[&str]) -> Vec<Candle> {
        closes
            .iter()
            .enumerate()
            .map(|(i, c)| Candle {
                open_time_ms: (first + i) as i64 * 14_400_000,
                open: d(c),
                high: d(c),
                low: d(c),
                close: d(c),
                volume: Decimal::ZERO,
            })
            .collect()
    }

    fn notify_doc(conditions: Condition) -> RuleDocument {
        RuleDocument {
            schema_version: SchemaVersion::CURRENT,
            id: "rule-price".to_string(),
            name: "price rule".to_string(),
            symbol: "BTCUSDT".to_string(),
            trigger_timeframe: tf("4h"),
            conditions,
            veto: None,
            action: RuleAction {
                consequence_level: ConsequenceLevel::Notify,
                order: None,
            },
            enabled: true,
            provenance: Provenance {
                source: AuthoringSource::Human,
                created_at_ms: 0,
                model: None,
            },
        }
    }

    fn crosses_above(threshold: &str, source: PriceSource) -> Condition {
        Condition::Cross {
            left: Operand::Price {
                field: PriceField::Close,
                source,
            },
            direction: CrossDirection::Above,
            right: Operand::Constant { value: d(threshold) },
            timeframe: tf("4h"),
        }
    }

    /// FEAT-0390's sharpest acceptance criterion: "rises above" is a crossing,
    /// not a comparison. A price already above the level when the rule was armed
    /// has not risen above it, and must not fire.
    #[test]
    fn rises_above_does_not_fire_when_the_price_was_already_above() {
        let doc = notify_doc(crosses_above("60000", PriceSource::Last));
        let already_above = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["61000", "62000"]));
        assert_eq!(evaluate(&doc, &already_above, None), Verdict::DoesNotFire);

        let genuinely_crossing =
            InMemoryMarket::new().with_candles(tf("4h"), candles(&["59000", "61000"]));
        assert_eq!(evaluate(&doc, &genuinely_crossing, None), Verdict::Fires);
    }

    #[test]
    fn falls_below_is_a_crossing_too() {
        let doc = notify_doc(Condition::Cross {
            left: Operand::Price {
                field: PriceField::Close,
                source: PriceSource::Last,
            },
            direction: CrossDirection::Below,
            right: Operand::Constant { value: d("60000") },
            timeframe: tf("4h"),
        });
        let already_below =
            InMemoryMarket::new().with_candles(tf("4h"), candles(&["59000", "58000"]));
        assert_eq!(evaluate(&doc, &already_below, None), Verdict::DoesNotFire);

        let crossing = InMemoryMarket::new().with_candles(tf("4h"), candles(&["61000", "59000"]));
        assert_eq!(evaluate(&doc, &crossing, None), Verdict::Fires);
    }

    /// A rule that names the mark price and is handed a market with no mark
    /// series must withhold its verdict. Answering it from the last-price series
    /// would be a wrong alarm wearing a right one's clothes — the exact failure
    /// this item exists to remove.
    #[test]
    fn a_mark_price_rule_never_falls_back_to_the_last_price_series() {
        let doc = notify_doc(crosses_above("60000", PriceSource::Mark));
        // The last-price series alone would make this fire.
        let last_only = InMemoryMarket::new().with_candles(tf("4h"), candles(&["59000", "61000"]));

        // Destructured rather than matched-and-formatted: interpolating the
        // verdict or its reason into the failure message puts market data into
        // a panic string, which CodeQL reads as logging tainted input.
        let Verdict::Indeterminate { reason } = evaluate(&doc, &last_only, None) else {
            panic!("expected an indeterminate verdict when no mark series is available");
        };
        assert!(reason.contains("mark-price"));
    }

    #[test]
    fn a_mark_price_rule_reads_the_mark_series_and_not_the_last_one() {
        let doc = notify_doc(crosses_above("60000", PriceSource::Mark));

        // Last price crosses; mark does not. The mark series decides.
        let mark_lags = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["59000", "61000"]))
            .with_mark_candles(tf("4h"), candles(&["59000", "59500"]));
        assert_eq!(evaluate(&doc, &mark_lags, None), Verdict::DoesNotFire);

        // And the other way round, so the test cannot pass by reading neither.
        let mark_leads = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["59000", "59500"]))
            .with_mark_candles(tf("4h"), candles(&["59000", "61000"]));
        assert_eq!(evaluate(&doc, &mark_leads, None), Verdict::Fires);
    }

    /// The two series are fetched separately and need not be the same length.
    /// Indexing the mark series with a position computed in the last-price
    /// series would read the wrong bar — here it would read the *previous*
    /// mark candle and miss the crossing entirely.
    #[test]
    fn a_shorter_mark_series_is_indexed_on_its_own_timestamps() {
        let doc = notify_doc(crosses_above("60000", PriceSource::Mark));
        let market = InMemoryMarket::new()
            // Buckets 0, 1, 2.
            .with_candles(tf("4h"), candles_from(0, &["58000", "58500", "59000"]))
            // Buckets 1, 2 only — the same instants, one candle shorter.
            .with_mark_candles(tf("4h"), candles_from(1, &["59000", "61000"]));

        assert_eq!(evaluate(&doc, &market, None), Verdict::Fires);
    }

    fn percent_at_least(percent: &str, lookback: u32) -> Condition {
        Condition::Compare {
            left: Operand::PercentChange {
                field: PriceField::Close,
                source: PriceSource::Last,
                lookback,
            },
            op: CompareOp::Gte,
            right: Operand::Constant { value: d(percent) },
            timeframe: tf("4h"),
        }
    }

    #[test]
    fn a_rise_reaching_the_percentage_fires_and_one_short_of_it_does_not() {
        let doc = notify_doc(percent_at_least("5", 1));

        // 100000 -> 105000 is exactly 5%.
        let exactly = InMemoryMarket::new().with_candles(tf("4h"), candles(&["100000", "105000"]));
        assert_eq!(evaluate(&doc, &exactly, None), Verdict::Fires);

        // 100000 -> 104999 is not.
        let short = InMemoryMarket::new().with_candles(tf("4h"), candles(&["100000", "104999"]));
        assert_eq!(evaluate(&doc, &short, None), Verdict::DoesNotFire);
    }

    /// A fall is the same operand with a negative threshold, which is why there
    /// is no second variant for it.
    #[test]
    fn a_fall_is_the_same_operand_against_a_negative_threshold() {
        let doc = notify_doc(Condition::Compare {
            left: Operand::PercentChange {
                field: PriceField::Close,
                source: PriceSource::Last,
                lookback: 1,
            },
            op: CompareOp::Lte,
            right: Operand::Constant { value: d("-5") },
            timeframe: tf("4h"),
        });

        let fell = InMemoryMarket::new().with_candles(tf("4h"), candles(&["100000", "95000"]));
        assert_eq!(evaluate(&doc, &fell, None), Verdict::Fires);

        let rose = InMemoryMarket::new().with_candles(tf("4h"), candles(&["100000", "105000"]));
        assert_eq!(evaluate(&doc, &rose, None), Verdict::DoesNotFire);
    }

    /// The reference is a candle `lookback` closes back, not the previous one,
    /// and not the price at arming.
    #[test]
    fn the_percentage_reference_is_the_candle_the_lookback_names() {
        let market = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["100000", "103000", "104000", "105000"]));

        // Against the candle three closes back: 100000 -> 105000 = 5%.
        assert_eq!(
            evaluate(&notify_doc(percent_at_least("5", 3)), &market, None),
            Verdict::Fires
        );
        // Against the immediately preceding one: 104000 -> 105000 < 1%.
        assert_eq!(
            evaluate(&notify_doc(percent_at_least("5", 1)), &market, None),
            Verdict::DoesNotFire
        );
    }

    /// Not enough history is "I cannot tell", never "it did not move".
    #[test]
    fn a_percentage_move_without_its_reference_candle_is_indeterminate() {
        let doc = notify_doc(percent_at_least("5", 3));
        let market = InMemoryMarket::new().with_candles(tf("4h"), candles(&["100000", "105000"]));

        let Verdict::Indeterminate { reason } = evaluate(&doc, &market, None) else {
            panic!("expected an indeterminate verdict when the reference candle is missing");
        };
        assert!(reason.contains("percentage move"));
    }

    /// A zero reference price makes the move undefined rather than infinite.
    /// Dividing anyway is how a NaN reaches a trader as a fired alarm.
    #[test]
    fn a_zero_reference_price_is_indeterminate_rather_than_divided_by() {
        let doc = notify_doc(percent_at_least("5", 1));
        let market = InMemoryMarket::new().with_candles(tf("4h"), candles(&["0", "105000"]));

        let Verdict::Indeterminate { reason } = evaluate(&doc, &market, None) else {
            panic!("expected an indeterminate verdict for a zero reference price");
        };
        assert!(reason.contains("zero"));
    }

    /// Percentage moves go through `Decimal` end to end. 0.1 + 0.2 is the
    /// canonical float tell: a binary-float path would land just off 30%.
    #[test]
    fn percentage_moves_carry_no_float_rounding() {
        let doc = notify_doc(Condition::Compare {
            left: Operand::PercentChange {
                field: PriceField::Close,
                source: PriceSource::Last,
                lookback: 1,
            },
            op: CompareOp::Eq,
            right: Operand::Constant { value: d("30") },
            timeframe: tf("4h"),
        });
        let market = InMemoryMarket::new().with_candles(tf("4h"), candles(&["0.1", "0.13"]));
        assert_eq!(evaluate(&doc, &market, None), Verdict::Fires);
    }

    /// The acceptance criterion this crate can check directly: "evaluating one
    /// document twice over the same closed candles yields the same verdict".
    /// `evaluate` reads no clock, no randomness and no mutable global — this
    /// test is what turns that from a property of the design into a property
    /// that is actually checked.
    #[test]
    fn evaluating_the_same_inputs_repeatedly_yields_the_same_verdict() {
        let document = rsi_dip_while_flat();
        let market = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["60000", "60000"]))
            .with_indicator(&rsi(14), tf("4h"), 1, d("25"))
            .with_feed("liquidation_heatmap", d("0.5"));
        let account = AccountSnapshot::default();

        let first = evaluate(&document, &market, Some(&account));
        for _ in 0..20 {
            assert_eq!(evaluate(&document, &market, Some(&account)), first);
        }
        assert_eq!(first, Verdict::Fires);
    }

    /// `Suppressed` is a read of the veto at evaluation time, not a one-shot
    /// side effect that could drift on a second call.
    #[test]
    fn a_suppressing_veto_is_deterministic_too() {
        let document = rsi_dip_while_flat();
        let market = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["60000", "60000"]))
            .with_indicator(&rsi(14), tf("4h"), 1, d("25"))
            .with_feed("liquidation_heatmap", d("0.95"));
        let account = AccountSnapshot::default();

        let first = evaluate(&document, &market, Some(&account));
        assert_eq!(first, Verdict::Suppressed);
        for _ in 0..20 {
            assert_eq!(evaluate(&document, &market, Some(&account)), first);
        }
    }

    /// An indeterminate verdict (no account snapshot for a rule that reads one)
    /// is reported the same way every time — never "sometimes we guess yes".
    #[test]
    fn an_indeterminate_verdict_is_stable_across_repeated_evaluation() {
        let document = rsi_dip_while_flat();
        let market = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["60000", "60000"]))
            .with_indicator(&rsi(14), tf("4h"), 1, d("25"));

        let first = evaluate(&document, &market, None);
        assert!(matches!(first, Verdict::Indeterminate { .. }));
        for _ in 0..20 {
            assert_eq!(evaluate(&document, &market, None), first);
        }
    }

    /// Two markets built in a different call order but holding the same data
    /// must still agree — `InMemoryMarket` is keyed on `BTreeMap`, so insertion
    /// order cannot leak into the verdict the way it could with a `HashMap`.
    #[test]
    fn insertion_order_into_the_market_does_not_affect_the_verdict() {
        let document = rsi_dip_while_flat();
        let account = AccountSnapshot::default();

        let a = InMemoryMarket::new()
            .with_candles(tf("4h"), candles(&["60000", "60000"]))
            .with_indicator(&rsi(14), tf("4h"), 1, d("25"))
            .with_feed("liquidation_heatmap", d("0.5"));

        let b = InMemoryMarket::new()
            .with_feed("liquidation_heatmap", d("0.5"))
            .with_indicator(&rsi(14), tf("4h"), 1, d("25"))
            .with_candles(tf("4h"), candles(&["60000", "60000"]));

        assert_eq!(
            evaluate(&document, &a, Some(&account)),
            evaluate(&document, &b, Some(&account))
        );
    }
}
