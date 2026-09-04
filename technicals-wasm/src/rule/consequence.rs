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

//! Consequence levels, and what each one refuses to honour.
//!
//! ADR-0012 decision 2: one schema serves alerting, backtesting, paper and live,
//! and "a capability a level does not have is refused explicitly, in the manner
//! of ADR-0008 — never emulated by a second dialect". This module is where that
//! refusal lives.
//!
//! The ordering is the whole point. A document declares the *most* it authorises;
//! a caller asks for what it intends to do; and the ask is granted only when it
//! is at or below what the document authorised. A `notify` rule handed to an
//! executor is refused by name, not downgraded, not ignored.

use serde::{Deserialize, Serialize};

use super::refusal::{RefusalCode, RuleRefusal};

/// What a rule is authorised to cause, in increasing order of consequence.
///
/// `Ord` is derived from declaration order and is load-bearing: `Notify <
/// Simulate < Send` is the comparison [`ConsequenceLevel::authorise`] makes.
/// Reordering these variants changes what the app is allowed to do with money,
/// so they are ordered here once and compared nowhere else by hand.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ConsequenceLevel {
    /// Tell the trader. Touches nothing but the screen.
    Notify,
    /// Record what would have been sent, against real market data, without
    /// sending it. Paper trading and backtest replay share this level.
    Simulate,
    /// Submit a real order — and, per ADR-0012 decision 5, only ever through the
    /// same `OrderGate` a human click enters. This level authorises a rule to
    /// *ask*; it does not authorise a path around the gate.
    Send,
}

impl ConsequenceLevel {
    /// Whether a rule authorised at `self` may be asked to do `requested`.
    ///
    /// Named `authorise` rather than `can` because the refusal — not the boolean —
    /// is the product: it names the field a caller has to change.
    pub fn authorise(self, requested: ConsequenceLevel) -> Result<(), RuleRefusal> {
        if requested > self {
            return Err(RuleRefusal::new(
                RefusalCode::ConsequenceLevelTooLow,
                "action.consequence_level",
                format!(
                    "this rule authorises `{}`, but the caller asked it to `{}`. \
                     Re-author the rule at the higher level; it is not downgraded \
                     or emulated.",
                    self.as_str(),
                    requested.as_str()
                ),
            ));
        }
        Ok(())
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Notify => "notify",
            Self::Simulate => "simulate",
            Self::Send => "send",
        }
    }

    /// Whether this level may read account state at all.
    ///
    /// `notify` may not. An alert engine has no position book — FEAT-0027
    /// evaluates against a price feed and nothing else — so a `notify` rule
    /// carrying "only when flat" would be a condition nothing ever checks. That
    /// is worse than refusing it: the trader would believe a guard exists.
    pub fn may_read_account_state(self) -> bool {
        self >= Self::Simulate
    }
}

/// Which side an order intent takes.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum OrderSide {
    Buy,
    Sell,
}

/// How an order's size is expressed.
///
/// Never a bare number. "2" is meaningless without saying whether it is two
/// contracts, two percent of equity, or two percent of account risk, and a
/// schema that leaves that to convention is a schema that eventually sizes a
/// position wrong.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SizeBasis {
    /// Quantity in the base asset (0.5 BTC).
    BaseQuantity,
    /// Notional in the quote asset (500 USDT).
    QuoteNotional,
    /// Percentage of account equity.
    PercentOfEquity,
    /// Percentage of equity risked between entry and stop — the sizing the
    /// calculator already speaks.
    PercentRisk,
}

/// What a rule intends to submit, at levels that submit anything.
///
/// This is an *intent*, not an order. It carries no price, no leverage and no
/// venue: those come from the gate and the account at the moment of submission,
/// and duplicating them here would create the second convention ADR-0010
/// recorded the cost of.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OrderIntent {
    pub side: OrderSide,
    pub size_basis: SizeBasis,
    /// Decimal, carried as a string. A position size is money.
    pub size: rust_decimal::Decimal,
    /// Whether this intent may only reduce an existing position.
    #[serde(default)]
    pub reduce_only: bool,
}

/// What the rule does when its conditions hold.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuleAction {
    pub consequence_level: ConsequenceLevel,
    /// Present exactly when the level submits something. Validation refuses both
    /// mismatches by name rather than ignoring a stray intent — an order intent
    /// sitting unread on a `notify` rule is the field a trader would later swear
    /// they had armed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<OrderIntent>,
}

impl RuleAction {
    pub fn validate(&self, field: &str, out: &mut Vec<RuleRefusal>) {
        match (self.consequence_level, &self.order) {
            (ConsequenceLevel::Notify, Some(_)) => out.push(RuleRefusal::new(
                RefusalCode::FieldNotHonouredAtLevel,
                format!("{field}.order"),
                "a `notify` rule carries an order intent nothing will ever submit; \
                 remove it, or author the rule at `simulate` or `send`",
            )),
            (ConsequenceLevel::Simulate | ConsequenceLevel::Send, None) => {
                out.push(RuleRefusal::new(
                    RefusalCode::FieldNotHonouredAtLevel,
                    format!("{field}.order"),
                    format!(
                        "a `{}` rule must say what it would submit",
                        self.consequence_level.as_str()
                    ),
                ))
            }
            _ => {}
        }

        if let Some(order) = &self.order {
            if order.size <= rust_decimal::Decimal::ZERO {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidDecimal,
                    format!("{field}.order.size"),
                    format!("order size `{}` is not positive", order.size),
                ));
            }
            if matches!(
                order.size_basis,
                SizeBasis::PercentOfEquity | SizeBasis::PercentRisk
            ) && order.size > rust_decimal::Decimal::from(100)
            {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidDecimal,
                    format!("{field}.order.size"),
                    format!("`{}` percent is more than the whole account", order.size),
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::str::FromStr;

    #[test]
    fn levels_are_ordered_by_consequence() {
        assert!(ConsequenceLevel::Notify < ConsequenceLevel::Simulate);
        assert!(ConsequenceLevel::Simulate < ConsequenceLevel::Send);
    }

    /// FEAT-0303's acceptance criterion, stated directly.
    #[test]
    fn a_notify_rule_asked_to_send_is_refused_and_the_refusal_names_the_field() {
        let err = ConsequenceLevel::Notify
            .authorise(ConsequenceLevel::Send)
            .unwrap_err();
        assert_eq!(err.code, RefusalCode::ConsequenceLevelTooLow);
        assert_eq!(err.field, "action.consequence_level");
        assert!(err.detail.contains("notify") && err.detail.contains("send"));
    }

    #[test]
    fn a_notify_rule_is_also_refused_a_simulation() {
        assert!(ConsequenceLevel::Notify
            .authorise(ConsequenceLevel::Simulate)
            .is_err());
    }

    #[test]
    fn a_higher_level_rule_may_be_asked_for_less() {
        assert!(ConsequenceLevel::Send
            .authorise(ConsequenceLevel::Notify)
            .is_ok());
        assert!(ConsequenceLevel::Send
            .authorise(ConsequenceLevel::Simulate)
            .is_ok());
        assert!(ConsequenceLevel::Send
            .authorise(ConsequenceLevel::Send)
            .is_ok());
        assert!(ConsequenceLevel::Simulate
            .authorise(ConsequenceLevel::Notify)
            .is_ok());
    }

    #[test]
    fn only_levels_that_act_may_read_account_state() {
        assert!(!ConsequenceLevel::Notify.may_read_account_state());
        assert!(ConsequenceLevel::Simulate.may_read_account_state());
        assert!(ConsequenceLevel::Send.may_read_account_state());
    }

    fn action(level: ConsequenceLevel, order: Option<OrderIntent>) -> RuleAction {
        RuleAction {
            consequence_level: level,
            order,
        }
    }

    fn intent(size: &str, basis: SizeBasis) -> OrderIntent {
        OrderIntent {
            side: OrderSide::Buy,
            size_basis: basis,
            size: Decimal::from_str(size).unwrap(),
            reduce_only: false,
        }
    }

    #[test]
    fn a_notify_rule_carrying_an_order_intent_is_refused() {
        let mut out = Vec::new();
        action(
            ConsequenceLevel::Notify,
            Some(intent("1", SizeBasis::BaseQuantity)),
        )
        .validate("action", &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].code, RefusalCode::FieldNotHonouredAtLevel);
        assert_eq!(out[0].field, "action.order");
    }

    #[test]
    fn a_send_rule_with_nothing_to_send_is_refused() {
        let mut out = Vec::new();
        action(ConsequenceLevel::Send, None).validate("action", &mut out);
        assert_eq!(out[0].field, "action.order");
    }

    #[test]
    fn a_notify_rule_with_no_order_is_accepted() {
        let mut out = Vec::new();
        action(ConsequenceLevel::Notify, None).validate("action", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn refuses_a_non_positive_or_impossible_size() {
        for (size, basis) in [
            ("0", SizeBasis::BaseQuantity),
            ("-1", SizeBasis::QuoteNotional),
            ("101", SizeBasis::PercentOfEquity),
            ("250", SizeBasis::PercentRisk),
        ] {
            let mut out = Vec::new();
            action(ConsequenceLevel::Send, Some(intent(size, basis))).validate("action", &mut out);
            assert!(
                !out.is_empty(),
                "size {size} on {basis:?} should be refused"
            );
        }
    }

    #[test]
    fn a_size_over_100_is_fine_when_it_is_not_a_percentage() {
        let mut out = Vec::new();
        action(
            ConsequenceLevel::Send,
            Some(intent("5000", SizeBasis::QuoteNotional)),
        )
        .validate("action", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn levels_serialise_as_the_words_the_adr_uses() {
        assert_eq!(
            serde_json::to_string(&ConsequenceLevel::Notify).unwrap(),
            "\"notify\""
        );
        assert_eq!(
            serde_json::to_string(&ConsequenceLevel::Simulate).unwrap(),
            "\"simulate\""
        );
        assert_eq!(
            serde_json::to_string(&ConsequenceLevel::Send).unwrap(),
            "\"send\""
        );
    }

    #[test]
    fn an_order_size_crosses_the_boundary_as_a_string() {
        let json = serde_json::to_string(&intent("0.005", SizeBasis::BaseQuantity)).unwrap();
        assert!(json.contains(r#""size":"0.005""#), "got: {json}");
    }
}
