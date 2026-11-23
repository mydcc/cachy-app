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

//! A grid bot's document — FEAT-0819, ADR-0027.
//!
//! A distinct kind, not a `RuleDocument` with extra fields. A rule is a
//! trigger `Condition` plus an action; a grid is a price range, a ladder and a
//! budget, and it has no trigger to evaluate. Bolting a ladder onto a rule
//! would leave one of them with a field it does not honour, which is the
//! exact shape the rule schema refuses everywhere else.
//!
//! What it shares with a rule is everything that is not the strategy's
//! shape: the condition language (the trend filter and the stop-out are
//! ordinary `Condition` trees, validated by the same walker at the same sites
//! a veto and an exit use), the provenance block, the refusal vocabulary and
//! the content-hash discipline (sorted keys, decimals as strings, identity
//! and lifecycle fields excluded).
//!
//! Decisions held here rather than in the runtime, because the runtime must
//! never see a document that contradicts them:
//!
//! - **One side** (ADR-0027 point 8). `side` is `long` or `short`; there is no
//!   neutral grid.
//! - **Quote budget** (point 10). `sizing.basis` is `quote_budget`; a
//!   `percent_risk` grid is refused by name, because a ladder has no single
//!   stop distance to size against.
//! - **Mandatory stop-out** (ADR-0027, "budget and stop-out limits are not
//!   optional"). An empty `stop_out` is refused; there is no opt-out.
//! - **Paper only** (point 6). `simulate` is the only level a grid accepts;
//!   `send` waits for FEAT-0035 and its own gate decision.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::condition::{Condition, ConditionSite};
use super::consequence::ConsequenceLevel;
use super::document::{check_warmup_ceiling, Provenance};
use super::refusal::{RefusalCode, Refused, RuleRefusal};
use super::sha256::sha256_hex;
use super::timeframe::Timeframe;

/// The grid document version this build authors and reads.
///
/// Its own counter, not the rule schema's: the two kinds evolve separately,
/// and a rule migration must never have to reason about a grid.
pub const GRID_SCHEMA_VERSION: u16 = 1;

/// The most levels one grid may hold.
///
/// The paper book and its UI were built for a handful of resting orders
/// (ADR-0027, "What this costs"), and every level is one of them. A hundred
/// keeps a dense ladder possible without letting one document flood the book.
pub const MAX_GRID_LEVELS: u32 = 100;

/// The fewest levels that still make a ladder: one to open, one to close.
pub const MIN_GRID_LEVELS: u32 = 2;

/// The discriminator a stored grid carries, so a reader can tell the two
/// document kinds apart before it parses either.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GridKind {
    Grid,
}

/// Which side of the book the grid trades (ADR-0027 point 8).
///
/// A long grid opens with buy levels and closes with sell levels; a short
/// grid is the mirror. It reserves exactly this `(symbol, side)`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GridSide {
    Long,
    Short,
}

/// How the levels are spaced between the bounds.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GridSpacing {
    /// Equal price steps.
    Arithmetic,
    /// Equal percentage steps.
    Geometric,
}

/// How a grid's size is stated.
///
/// `PercentRisk` parses so that it can be refused by name: a serde error on an
/// unknown variant would reach the trader as "unknown field", which hides the
/// actual reason.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GridSizeBasis {
    /// A total budget in the quote currency, split evenly across the levels.
    QuoteBudget,
    /// Refused for a grid (ADR-0027 point 10).
    PercentRisk,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GridSizing {
    pub basis: GridSizeBasis,
    pub amount: Decimal,
}

/// A serialisable, versioned, validated grid strategy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GridDocument {
    pub kind: GridKind,
    /// Not hashed, for the reason the rule schema gives: a migration must not
    /// move a recorded identity.
    pub schema_version: u16,
    /// Local identity. Not hashed.
    pub id: String,
    /// Human label. Not hashed.
    pub name: String,
    pub symbol: String,
    pub side: GridSide,
    /// The cadence the trend filter and the stop-out are read at — the same
    /// role a rule's `trigger_timeframe` plays for its exits.
    pub evaluation_timeframe: Timeframe,
    pub lower_price: Decimal,
    pub upper_price: Decimal,
    pub level_count: u32,
    pub spacing: GridSpacing,
    pub sizing: GridSizing,
    /// While this reads false the grid withdraws its resting opening orders
    /// (ADR-0027 point 9). Optional: a grid without one is always willing.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trend_filter: Option<Condition>,
    /// Any one of these holding cancels the ladder and closes the position.
    /// Required and non-empty.
    pub stop_out: Vec<Condition>,
    pub consequence_level: ConsequenceLevel,
    pub enabled: bool,
    pub provenance: Provenance,
}

/// Fields that identify or annotate the grid rather than define it.
pub(crate) const GRID_EXCLUDED_FROM_HASH: &[&str] =
    &["schema_version", "id", "name", "enabled", "provenance"];

impl GridDocument {
    /// Every reason this grid is not usable, or `Ok`.
    pub fn validate(&self) -> Result<(), Refused> {
        let mut out: Vec<RuleRefusal> = Vec::new();

        if self.schema_version != GRID_SCHEMA_VERSION {
            out.push(RuleRefusal::new(
                RefusalCode::UnsupportedSchemaVersion,
                "schema_version",
                format!(
                    "grid document version {} is not readable by this build, which reads {}",
                    self.schema_version, GRID_SCHEMA_VERSION
                ),
            ));
        }
        if self.id.trim().is_empty() {
            out.push(RuleRefusal::new(
                RefusalCode::UnknownField,
                "id",
                "a grid needs a stable local identity",
            ));
        }
        if self.symbol.trim().is_empty() {
            out.push(RuleRefusal::new(
                RefusalCode::InvalidSymbol,
                "symbol",
                "a grid must name the market it trades",
            ));
        }

        self.validate_range(&mut out);
        self.validate_level_count(&mut out);
        self.validate_sizing(&mut out);
        self.validate_level(&mut out);
        self.validate_conditions(&mut out);

        if out.is_empty() {
            Ok(())
        } else {
            Err(Refused { refusals: out })
        }
    }

    fn validate_range(&self, out: &mut Vec<RuleRefusal>) {
        if self.lower_price <= Decimal::ZERO {
            out.push(RuleRefusal::new(
                RefusalCode::GridInvalidRange,
                "lower_price",
                format!("lower price `{}` is not positive", self.lower_price),
            ));
        }
        if self.upper_price <= self.lower_price {
            out.push(RuleRefusal::new(
                RefusalCode::GridInvalidRange,
                "upper_price",
                format!(
                    "upper price `{}` must lie above lower price `{}`",
                    self.upper_price, self.lower_price
                ),
            ));
        }
    }

    fn validate_level_count(&self, out: &mut Vec<RuleRefusal>) {
        if !(MIN_GRID_LEVELS..=MAX_GRID_LEVELS).contains(&self.level_count) {
            out.push(RuleRefusal::new(
                RefusalCode::GridInvalidLevelCount,
                "level_count",
                format!(
                    "a grid holds {MIN_GRID_LEVELS} to {MAX_GRID_LEVELS} levels; got {}",
                    self.level_count
                ),
            ));
        }
    }

    fn validate_sizing(&self, out: &mut Vec<RuleRefusal>) {
        if self.sizing.basis == GridSizeBasis::PercentRisk {
            out.push(RuleRefusal::new(
                RefusalCode::GridRiskSizingUnsupported,
                "sizing.basis",
                "a ladder has no single stop distance, so it cannot be sized by \
                 percent of risk; state a quote budget",
            ));
        }
        if self.sizing.amount <= Decimal::ZERO {
            out.push(RuleRefusal::new(
                RefusalCode::InvalidDecimal,
                "sizing.amount",
                format!("budget `{}` is not positive", self.sizing.amount),
            ));
        }
    }

    fn validate_level(&self, out: &mut Vec<RuleRefusal>) {
        match self.consequence_level {
            ConsequenceLevel::Simulate => {}
            ConsequenceLevel::Notify => out.push(RuleRefusal::new(
                RefusalCode::ConsequenceLevelTooLow,
                "consequence_level",
                "a grid places orders; `notify` cannot. Author it at `simulate`",
            )),
            ConsequenceLevel::Send => out.push(RuleRefusal::new(
                RefusalCode::GridPaperOnly,
                "consequence_level",
                "a grid runs on the paper account only; live execution waits for \
                 its own gate decision (FEAT-0035)",
            )),
        }
    }

    fn validate_conditions(&self, out: &mut Vec<RuleRefusal>) {
        // `simulate` is the only level that passes, and it may read account
        // state; validating as if it could keeps an account condition from
        // being refused twice on a document already refused for its level.
        const MAY_READ_ACCOUNT: bool = true;

        if let Some(filter) = &self.trend_filter {
            filter.validate(
                "trend_filter",
                ConditionSite::Veto,
                self.evaluation_timeframe,
                MAY_READ_ACCOUNT,
                0,
                out,
            );
            check_warmup_ceiling("trend_filter", filter, out);
        }

        if self.stop_out.is_empty() {
            out.push(RuleRefusal::new(
                RefusalCode::GridStopOutRequired,
                "stop_out",
                "a grid accumulates exposure level by level, so it must state when \
                 it gives up; an empty stop-out is refused, with no opt-out",
            ));
        }
        for (i, rule) in self.stop_out.iter().enumerate() {
            let field = format!("stop_out[{i}]");
            rule.validate(
                &field,
                ConditionSite::Exit,
                self.evaluation_timeframe,
                MAY_READ_ACCOUNT,
                0,
                out,
            );
            check_warmup_ceiling(&field, rule, out);
        }
    }

    /// The canonical value: everything that defines the strategy, nothing that
    /// only names or annotates it.
    pub fn canonical_value(&self) -> Result<serde_json::Value, RuleRefusal> {
        let mut value = serde_json::to_value(self).map_err(|e| {
            RuleRefusal::new(
                RefusalCode::UnknownField,
                "",
                format!("grid could not be canonicalised: {e}"),
            )
        })?;
        if let Some(map) = value.as_object_mut() {
            for excluded in GRID_EXCLUDED_FROM_HASH {
                map.remove(*excluded);
            }
        }
        Ok(value)
    }

    /// Lowercase hex SHA-256 of the canonical form.
    pub fn content_hash(&self) -> Result<String, RuleRefusal> {
        let canonical = serde_json::to_string(&self.canonical_value()?).map_err(|e| {
            RuleRefusal::new(
                RefusalCode::UnknownField,
                "",
                format!("canonical grid could not be serialised: {e}"),
            )
        })?;
        Ok(sha256_hex(canonical.as_bytes()))
    }
}

/// Parse untrusted JSON into a validated grid.
pub fn parse_grid(json: &str) -> Result<GridDocument, Refused> {
    let mut document: GridDocument = serde_json::from_str(json).map_err(|e| {
        Refused::one(
            RefusalCode::UnknownField,
            "",
            format!("grid document does not match schema v{GRID_SCHEMA_VERSION}: {e}"),
        )
    })?;
    // `rust_decimal` keeps the scale it was given, so `40000` and `40000.0`
    // would serialise — and hash — as two strategies. Normalised here, once,
    // so the stored form and the hashed form are the same value. Affordable
    // only because no grid has been stored yet; the rule schema's constants
    // predate this and are not normalised.
    document.lower_price = document.lower_price.normalize();
    document.upper_price = document.upper_price.normalize();
    document.sizing.amount = document.sizing.amount.normalize();
    document.validate()?;
    Ok(document)
}

/// Serialise a validated grid. The inverse of [`parse_grid`].
pub fn serialise_grid(document: &GridDocument) -> Result<String, RuleRefusal> {
    serde_json::to_string(
        &serde_json::to_value(document)
            .map_err(|e| RuleRefusal::new(RefusalCode::UnknownField, "", format!("{e}")))?,
    )
    .map_err(|e| RuleRefusal::new(RefusalCode::UnknownField, "", format!("{e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid_json(overrides: &[(&str, serde_json::Value)]) -> String {
        let mut doc = serde_json::json!({
            "kind": "grid",
            "schema_version": 1,
            "id": "grid-1",
            "name": "BTC range",
            "symbol": "BTCUSDT",
            "side": "long",
            "evaluation_timeframe": "1h",
            "lower_price": "40000",
            "upper_price": "50000",
            "level_count": 10,
            "spacing": "arithmetic",
            "sizing": { "basis": "quote_budget", "amount": "1000" },
            "stop_out": [{
                "kind": "compare",
                "left": { "kind": "price", "field": "close" },
                "op": "lt",
                "right": { "kind": "constant", "value": "38000" },
                "timeframe": "1h"
            }],
            "consequence_level": "simulate",
            "enabled": true,
            "provenance": { "source": "human", "created_at_ms": 1700000000000i64 }
        });
        for (key, value) in overrides {
            doc[*key] = value.clone();
        }
        doc.to_string()
    }

    fn codes(json: &str) -> Vec<(RefusalCode, String)> {
        parse_grid(json)
            .unwrap_err()
            .refusals
            .into_iter()
            .map(|r| (r.code, r.field))
            .collect()
    }

    #[test]
    fn an_arithmetic_and_a_geometric_grid_both_validate_and_round_trip() {
        for spacing in ["arithmetic", "geometric"] {
            let json = grid_json(&[("spacing", serde_json::json!(spacing))]);
            let parsed = parse_grid(&json).unwrap();
            let canonical = serialise_grid(&parsed).unwrap();
            assert_eq!(parse_grid(&canonical).unwrap(), parsed, "{spacing}");
            assert_eq!(
                serialise_grid(&parse_grid(&canonical).unwrap()).unwrap(),
                canonical
            );
        }
    }

    #[test]
    fn a_percent_risk_grid_is_refused_by_name() {
        let json = grid_json(&[(
            "sizing",
            serde_json::json!({ "basis": "percent_risk", "amount": "1" }),
        )]);
        assert!(codes(&json).contains(&(
            RefusalCode::GridRiskSizingUnsupported,
            "sizing.basis".into()
        )));
    }

    #[test]
    fn an_empty_stop_out_is_refused_and_an_absent_one_does_not_parse() {
        let empty = grid_json(&[("stop_out", serde_json::json!([]))]);
        assert!(codes(&empty).contains(&(RefusalCode::GridStopOutRequired, "stop_out".into())));

        let mut absent: serde_json::Value = serde_json::from_str(&grid_json(&[])).unwrap();
        absent.as_object_mut().unwrap().remove("stop_out");
        assert!(parse_grid(&absent.to_string()).is_err());
    }

    #[test]
    fn a_send_level_grid_is_refused_as_paper_only_and_notify_as_too_low() {
        let send = grid_json(&[("consequence_level", serde_json::json!("send"))]);
        assert!(codes(&send).contains(&(RefusalCode::GridPaperOnly, "consequence_level".into())));
        let notify = grid_json(&[("consequence_level", serde_json::json!("notify"))]);
        assert!(codes(&notify).contains(&(
            RefusalCode::ConsequenceLevelTooLow,
            "consequence_level".into()
        )));
    }

    #[test]
    fn the_range_must_be_positive_and_ordered() {
        let inverted = grid_json(&[("upper_price", serde_json::json!("40000"))]);
        assert!(codes(&inverted).contains(&(RefusalCode::GridInvalidRange, "upper_price".into())));
        let zero = grid_json(&[("lower_price", serde_json::json!("0"))]);
        assert!(codes(&zero).contains(&(RefusalCode::GridInvalidRange, "lower_price".into())));
    }

    #[test]
    fn the_level_count_is_bounded_on_both_ends() {
        for count in [0, 1, MAX_GRID_LEVELS + 1] {
            let json = grid_json(&[("level_count", serde_json::json!(count))]);
            assert!(
                codes(&json).contains(&(RefusalCode::GridInvalidLevelCount, "level_count".into())),
                "{count}"
            );
        }
        for count in [MIN_GRID_LEVELS, MAX_GRID_LEVELS] {
            assert!(parse_grid(&grid_json(&[("level_count", serde_json::json!(count))])).is_ok());
        }
    }

    #[test]
    fn a_budget_that_is_not_positive_is_refused() {
        let json = grid_json(&[(
            "sizing",
            serde_json::json!({ "basis": "quote_budget", "amount": "0" }),
        )]);
        assert!(codes(&json).contains(&(RefusalCode::InvalidDecimal, "sizing.amount".into())));
    }

    #[test]
    fn the_stop_out_refuses_an_external_feed_like_an_exit_does() {
        let json = grid_json(&[(
            "stop_out",
            serde_json::json!([{ "kind": "external_feed", "feed": "liquidation_heatmap", "op": "gt", "value": "0.9" }]),
        )]);
        let refused = codes(&json);
        assert!(
            refused
                .iter()
                .any(|(_, field)| field.starts_with("stop_out[0]")),
            "got: {refused:?}"
        );
    }

    #[test]
    fn a_condition_finer_than_the_evaluation_timeframe_is_refused_in_the_trend_filter() {
        let json = grid_json(&[(
            "trend_filter",
            serde_json::json!({
                "kind": "compare",
                "left": { "kind": "price", "field": "close" },
                "op": "gt",
                "right": { "kind": "constant", "value": "1" },
                "timeframe": "1m"
            }),
        )]);
        let refused = codes(&json);
        assert!(
            refused
                .iter()
                .any(|(_, field)| field.starts_with("trend_filter")),
            "got: {refused:?}"
        );
    }

    #[test]
    fn an_unknown_field_is_refused_rather_than_dropped() {
        let json = grid_json(&[("neutral", serde_json::json!(true))]);
        assert!(parse_grid(&json).is_err());
    }

    #[test]
    fn identity_and_lifecycle_fields_are_not_hashed_and_strategy_fields_are() {
        let base = parse_grid(&grid_json(&[])).unwrap().content_hash().unwrap();
        assert_eq!(base.len(), 64);

        for (key, value) in [
            ("id", serde_json::json!("grid-2")),
            ("name", serde_json::json!("renamed")),
            ("enabled", serde_json::json!(false)),
        ] {
            let hash = parse_grid(&grid_json(&[(key, value)]))
                .unwrap()
                .content_hash()
                .unwrap();
            assert_eq!(hash, base, "{key} must not move the hash");
        }
        for (key, value) in [
            ("side", serde_json::json!("short")),
            ("spacing", serde_json::json!("geometric")),
            ("level_count", serde_json::json!(11)),
            ("upper_price", serde_json::json!("50001")),
        ] {
            let hash = parse_grid(&grid_json(&[(key, value)]))
                .unwrap()
                .content_hash()
                .unwrap();
            assert_ne!(hash, base, "{key} must move the hash");
        }
    }

    #[test]
    fn an_equal_decimal_spelled_differently_keeps_the_hash() {
        let base = parse_grid(&grid_json(&[])).unwrap().content_hash().unwrap();
        let spelled = parse_grid(&grid_json(&[("lower_price", serde_json::json!("40000.0"))]))
            .unwrap()
            .content_hash()
            .unwrap();
        // Two spellings of one price must be one strategy identity.
        assert_eq!(spelled, base);
        let budget = parse_grid(&grid_json(&[(
            "sizing",
            serde_json::json!({ "basis": "quote_budget", "amount": "1000.00" }),
        )]))
        .unwrap()
        .content_hash()
        .unwrap();
        assert_eq!(budget, base);
    }
}
