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

//! Expressing FEAT-0027's price alerts in the rule schema.
//!
//! FEAT-0303's last acceptance criterion: the alerts that ship today must be
//! expressible here, "demonstrated by a test, without changing their firing
//! behaviour". This module is the conversion, and the tests below are the
//! demonstration — they run the *actual shipped engine* from
//! [`crate::alert_engine`] beside the new evaluator over the same price
//! sequences and assert the verdicts agree, rather than asserting against a
//! restatement of what the old engine was believed to do.
//!
//! Three details of the shipped behaviour are load-bearing and are reproduced
//! rather than tidied:
//!
//! - The previous-price comparison is **strict** on the old side and
//!   **inclusive** on the new one (`last < target && current >= target`), so a
//!   price resting exactly on the level does not re-fire.
//! - On the very first evaluation for a symbol there is no previous price, and
//!   `price_reached` fires only on exact equality while the directional variants
//!   never fire at all.
//! - Firing then sets `active = false`. That is a one-shot disarm held in engine
//!   state, not a property of the condition, so it is not part of the document —
//!   arming is `enabled`, and re-arming stays the caller's business exactly as it
//!   is today.

use super::condition::{Condition, CrossDirection, Operand, PriceField};
use super::consequence::{ConsequenceLevel, RuleAction};
use super::document::{AuthoringSource, Provenance, RuleDocument};
use super::refusal::Refused;
use super::timeframe::Timeframe;
use super::version::SchemaVersion;
use crate::alert_engine::{AlertCondition, AlertDefinition};

/// Convert a shipped alert definition into an equivalent rule document.
///
/// `timeframe` is the caller's choice and has no counterpart in the old engine,
/// which evaluated on every tick. That is the one genuine difference the schema
/// introduces, and it is a deliberate one: ADR-0012 decision 3 requires a
/// declared evaluation point, and "whatever tick happened to arrive" is not one.
/// The conversion therefore asks for it rather than inventing a default, because
/// a default here would silently decide how often a trader's alert is checked.
pub fn rule_from_alert(
    alert: &AlertDefinition,
    timeframe: Timeframe,
    created_at_ms: i64,
) -> Result<RuleDocument, Refused> {
    let (direction, threshold) = match &alert.condition {
        AlertCondition::PriceCrossUp(t) => (CrossDirection::Above, *t),
        AlertCondition::PriceCrossDown(t) => (CrossDirection::Below, *t),
        AlertCondition::PriceReached(t) => (CrossDirection::Any, *t),
    };

    let document = RuleDocument {
        schema_version: SchemaVersion::CURRENT,
        id: alert.id.clone(),
        name: format!("{} {}", alert.symbol, describe(&alert.condition)),
        symbol: alert.symbol.clone(),
        trigger_timeframe: timeframe,
        conditions: Condition::Cross {
            left: Operand::Price {
                field: PriceField::Close,
            },
            direction,
            right: Operand::Constant { value: threshold },
            timeframe,
        },
        veto: None,
        // A price alert notifies. It carries no order intent, and the schema
        // refuses to let it acquire one without being re-authored.
        action: RuleAction {
            consequence_level: ConsequenceLevel::Notify,
            order: None,
        },
        enabled: alert.active,
        provenance: Provenance {
            source: AuthoringSource::Human,
            created_at_ms,
            model: None,
        },
    };

    document.validate()?;
    Ok(document)
}

fn describe(condition: &AlertCondition) -> String {
    match condition {
        AlertCondition::PriceCrossUp(t) => format!("crosses above {t}"),
        AlertCondition::PriceCrossDown(t) => format!("crosses below {t}"),
        AlertCondition::PriceReached(t) => format!("reaches {t}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::alert_engine::AlertEngine;
    use crate::rule::evaluate::{evaluate, Candle, InMemoryMarket, Verdict};
    use rust_decimal::Decimal;
    use std::str::FromStr;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    fn tf() -> Timeframe {
        Timeframe::parse("1m").unwrap()
    }

    fn alert(condition: AlertCondition) -> AlertDefinition {
        AlertDefinition {
            id: "a1".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition,
            active: true,
        }
    }

    /// Candles whose close is the given price. The old engine only ever saw a
    /// price, so close-only candles are the faithful translation of its input.
    fn candles(prices: &[&str]) -> Vec<Candle> {
        prices
            .iter()
            .enumerate()
            .map(|(i, p)| Candle {
                open_time_ms: i as i64 * 60_000,
                open: d(p),
                high: d(p),
                low: d(p),
                close: d(p),
                volume: Decimal::ZERO,
            })
            .collect()
    }

    /// Did the *shipped* engine fire on the last price of this sequence?
    ///
    /// A fresh engine per call, so the one-shot disarm cannot mask a later
    /// firing — the question here is about the condition, not about engine state.
    fn legacy_fires(condition: &AlertCondition, prices: &[&str]) -> bool {
        let mut engine = AlertEngine::new();
        engine.set_alerts(vec![alert(condition.clone())]);
        let mut fired = false;
        for (i, p) in prices.iter().enumerate() {
            let events = engine.evaluate("BTCUSDT", d(p), i as i64 * 60_000);
            fired = !events.is_empty();
        }
        fired
    }

    /// Did the rule document fire at the last closed candle of this sequence?
    fn rule_fires(condition: &AlertCondition, prices: &[&str]) -> bool {
        let document = rule_from_alert(&alert(condition.clone()), tf(), 0).unwrap();
        let market = InMemoryMarket::new().with_candles(tf(), candles(prices));
        matches!(evaluate(&document, &market, None), Verdict::Fires)
    }

    /// The acceptance criterion, as a differential test against the real engine.
    ///
    /// Every case is run through both implementations and their answers compared,
    /// so this keeps holding if either side changes — which is the point of
    /// having one schema rather than two dialects.
    #[test]
    fn every_shipped_alert_fires_identically_under_the_rule_schema() {
        let cases: &[(&str, AlertCondition, &[&str])] = &[
            // --- price_cross_up ---
            (
                "up: crosses the level",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "60100"],
            ),
            (
                "up: lands exactly on it",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "60000"],
            ),
            (
                "up: never reaches it",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "59950"],
            ),
            (
                "up: was already above",
                AlertCondition::PriceCrossUp(d("60000")),
                &["60100", "60200"],
            ),
            (
                "up: sitting on the level",
                AlertCondition::PriceCrossUp(d("60000")),
                &["60000", "60000"],
            ),
            (
                "up: falls through instead",
                AlertCondition::PriceCrossUp(d("60000")),
                &["60100", "59900"],
            ),
            // --- price_cross_down ---
            (
                "down: crosses the level",
                AlertCondition::PriceCrossDown(d("60000")),
                &["60100", "59900"],
            ),
            (
                "down: lands exactly on it",
                AlertCondition::PriceCrossDown(d("60000")),
                &["60100", "60000"],
            ),
            (
                "down: never reaches it",
                AlertCondition::PriceCrossDown(d("60000")),
                &["60100", "60050"],
            ),
            (
                "down: was already below",
                AlertCondition::PriceCrossDown(d("60000")),
                &["59900", "59800"],
            ),
            (
                "down: sitting on the level",
                AlertCondition::PriceCrossDown(d("60000")),
                &["60000", "60000"],
            ),
            (
                "down: rises through instead",
                AlertCondition::PriceCrossDown(d("60000")),
                &["59900", "60100"],
            ),
            // --- price_reached, both directions ---
            (
                "reached: from below",
                AlertCondition::PriceReached(d("60000")),
                &["59900", "60100"],
            ),
            (
                "reached: from above",
                AlertCondition::PriceReached(d("60000")),
                &["60100", "59900"],
            ),
            (
                "reached: exactly, from below",
                AlertCondition::PriceReached(d("60000")),
                &["59900", "60000"],
            ),
            (
                "reached: exactly, from above",
                AlertCondition::PriceReached(d("60000")),
                &["60100", "60000"],
            ),
            (
                "reached: sitting on the level",
                AlertCondition::PriceReached(d("60000")),
                &["60000", "60000"],
            ),
            (
                "reached: never near it",
                AlertCondition::PriceReached(d("60000")),
                &["59900", "59950"],
            ),
            // --- scale-insensitive decimal equality ---
            (
                "reached: trailing zeroes still equal",
                AlertCondition::PriceReached(d("60000")),
                &["59900", "60000.000"],
            ),
            (
                "up: a cent short",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "59999.99"],
            ),
            (
                "up: a cent over",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "60000.01"],
            ),
            // --- longer walks ---
            (
                "up: crosses on the final step",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59000", "59500", "59900", "60050"],
            ),
            (
                "up: crossed earlier, flat since",
                AlertCondition::PriceCrossUp(d("60000")),
                &["59900", "60050", "60060"],
            ),
        ];

        for (label, condition, prices) in cases {
            assert_eq!(
                rule_fires(condition, prices),
                legacy_fires(condition, prices),
                "`{label}` disagrees between the shipped engine and the rule schema \
                 (condition {condition:?}, prices {prices:?})"
            );
        }
    }

    /// The first-evaluation case, which the shipped engine treats specially.
    /// Separated because "no previous price" is a single-price sequence, and the
    /// legacy helper above needs at least one prior tick to be meaningful.
    #[test]
    fn the_first_evaluation_behaves_as_the_shipped_engine_does() {
        // price_reached fires on an exact hit with no history...
        assert!(legacy_fires(
            &AlertCondition::PriceReached(d("60000")),
            &["60000"]
        ));
        assert!(rule_fires(
            &AlertCondition::PriceReached(d("60000")),
            &["60000"]
        ));

        // ...and not otherwise.
        assert!(!legacy_fires(
            &AlertCondition::PriceReached(d("60000")),
            &["60001"]
        ));
        assert!(!rule_fires(
            &AlertCondition::PriceReached(d("60000")),
            &["60001"]
        ));

        // Directional crosses never fire without a predecessor, even standing
        // right on the level.
        for condition in [
            AlertCondition::PriceCrossUp(d("60000")),
            AlertCondition::PriceCrossDown(d("60000")),
        ] {
            for price in ["60000", "60100", "59900"] {
                assert_eq!(
                    legacy_fires(&condition, &[price]),
                    rule_fires(&condition, &[price]),
                    "first evaluation of {condition:?} at {price}"
                );
                assert!(!rule_fires(&condition, &[price]));
            }
        }
    }

    #[test]
    fn a_converted_alert_is_a_valid_notify_rule_that_refuses_to_send() {
        let document = rule_from_alert(
            &alert(AlertCondition::PriceReached(d("60000"))),
            tf(),
            1_700_000_000_000,
        )
        .unwrap();
        assert!(document.validate().is_ok());
        assert_eq!(document.action.consequence_level, ConsequenceLevel::Notify);
        assert!(document.action.order.is_none());

        let err = document.authorise(ConsequenceLevel::Send).unwrap_err();
        assert_eq!(err.field, "action.consequence_level");
    }

    #[test]
    fn conversion_carries_the_armed_flag_and_the_identity_across() {
        let mut source = alert(AlertCondition::PriceCrossUp(d("60000")));
        source.active = false;
        let document = rule_from_alert(&source, tf(), 0).unwrap();
        assert!(!document.enabled);
        assert_eq!(document.id, "a1");
        assert_eq!(document.symbol, "BTCUSDT");
    }

    /// Arming is not a change of strategy, so it must not change the hash.
    #[test]
    fn arming_an_alert_does_not_change_what_the_rule_means() {
        let mut armed = alert(AlertCondition::PriceCrossUp(d("60000")));
        armed.active = true;
        let mut disarmed = armed.clone();
        disarmed.active = false;

        let a = rule_from_alert(&armed, tf(), 0)
            .unwrap()
            .content_hash()
            .unwrap();
        let b = rule_from_alert(&disarmed, tf(), 0)
            .unwrap()
            .content_hash()
            .unwrap();
        assert_eq!(a, b);
    }

    /// Two alerts at different levels are two different strategies.
    #[test]
    fn a_different_threshold_is_a_different_rule() {
        let a = rule_from_alert(&alert(AlertCondition::PriceCrossUp(d("60000"))), tf(), 0)
            .unwrap()
            .content_hash()
            .unwrap();
        let b = rule_from_alert(&alert(AlertCondition::PriceCrossUp(d("60001"))), tf(), 0)
            .unwrap()
            .content_hash()
            .unwrap();
        assert_ne!(a, b);
    }
}
