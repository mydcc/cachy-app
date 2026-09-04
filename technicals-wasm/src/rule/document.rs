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

//! The rule document: what a strategy *is*, per ADR-0012 decision 1.
//!
//! # What the content hash covers, and why not everything
//!
//! FEAT-0303 asks for "a content hash that identifies this exact rule in a
//! journal entry or decision log". That is a question about *meaning*, not about
//! bytes, so the hash covers the semantic fields — symbol, trigger timeframe,
//! conditions, veto, action, schema version — and deliberately excludes `id`,
//! `name`, `enabled` and `provenance`.
//!
//! The exclusion is the useful half. Renaming a rule from "rsi dip" to "RSI dip"
//! must not make an audit think the strategy changed; arming and disarming the
//! same rule must not produce two strategies in the log; and two traders who
//! independently wrote the same rule should be able to see that they did. What
//! must change the hash is anything that changes what the rule *does* — and a
//! test below asserts both halves rather than trusting the field list.
//!
//! Canonical form is JSON with sorted keys: `serde_json`'s `Map` is a `BTreeMap`
//! unless the `preserve_order` feature is on, so round-tripping through `Value`
//! sorts every object. Decimals are already strings in this crate, so no float
//! formatting can drift between platforms.

use serde::{Deserialize, Serialize};

use super::condition::{Condition, ConditionSite, MAX_CONDITION_DEPTH};
use super::consequence::{ConsequenceLevel, RuleAction};
use super::refusal::{RefusalCode, Refused, RuleRefusal};
use super::sha256::sha256_hex;
use super::timeframe::Timeframe;
use super::version::{migrate_to_current, SchemaVersion};

/// Who wrote this rule.
///
/// ADR-0012 decision 4: a model proposes, and its proposal is held to the same
/// validation as a hand-built rule. Recording which is which is what lets the
/// register of decision 8 answer "how have model-proposed rules actually done"
/// without anyone having to remember.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AuthoringSource {
    Human,
    Model,
}

/// Where the document came from.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Provenance {
    pub source: AuthoringSource,
    /// Unix milliseconds. Supplied by the caller rather than read from a clock,
    /// because this crate compiles to WASM where the host owns the clock, and
    /// because a deterministic document is one nothing stamps behind your back.
    pub created_at_ms: i64,
    /// Which model proposed it, when `source` is `model`. Class A like the rest
    /// of the document — it never leaves the device.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// A serialisable, versioned, schema-validated strategy.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuleDocument {
    pub schema_version: SchemaVersion,
    /// Local identity. Not hashed — see the module docs.
    pub id: String,
    /// Human label. Not hashed.
    pub name: String,
    pub symbol: String,
    /// The evaluation anchor. The rule is evaluated once per close of this
    /// timeframe, and every condition reads the last candle of its own timeframe
    /// that had already closed at that instant.
    pub trigger_timeframe: Timeframe,
    pub conditions: Condition,
    /// Optional suppression. External feeds are legal here and only here.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub veto: Option<Condition>,
    pub action: RuleAction,
    /// Armed or not. Not hashed: arming is not a change of strategy.
    #[serde(default)]
    pub enabled: bool,
    pub provenance: Provenance,
}

impl RuleDocument {
    /// Every reason this document is not usable, or `Ok`.
    pub fn validate(&self) -> Result<(), Refused> {
        let mut out: Vec<RuleRefusal> = Vec::new();

        self.schema_version
            .check_readable("schema_version")
            .unwrap_or_else(|e| out.push(e));

        if self.id.trim().is_empty() {
            out.push(RuleRefusal::new(
                RefusalCode::UnknownField,
                "id",
                "a rule needs a stable local identity",
            ));
        }
        if self.symbol.trim().is_empty() {
            out.push(RuleRefusal::new(
                RefusalCode::InvalidSymbol,
                "symbol",
                "a rule must name the market it watches",
            ));
        }

        let may_read_account = self.action.consequence_level.may_read_account_state();

        self.conditions.validate(
            "conditions",
            ConditionSite::Trigger,
            self.trigger_timeframe,
            may_read_account,
            0,
            &mut out,
        );

        if let Some(veto) = &self.veto {
            veto.validate(
                "veto",
                ConditionSite::Veto,
                self.trigger_timeframe,
                may_read_account,
                0,
                &mut out,
            );
        }

        self.action.validate("action", &mut out);

        if out.is_empty() {
            Ok(())
        } else {
            Err(Refused { refusals: out })
        }
    }

    /// Whether this rule may be asked to do `requested`.
    ///
    /// The gate FEAT-0303 requires: a rule authorising `notify` refuses a caller
    /// asking it to send, and the refusal names `action.consequence_level`.
    pub fn authorise(&self, requested: ConsequenceLevel) -> Result<(), RuleRefusal> {
        self.action.consequence_level.authorise(requested)
    }

    /// The semantic subset of the document, as sorted-key JSON.
    ///
    /// Built by round-tripping the whole document through `serde_json::Value` and
    /// then *removing* the excluded keys, rather than by assembling the included
    /// ones by hand. That direction matters: a field added to the struct later is
    /// hashed by default, so forgetting to update this function makes the hash
    /// over-sensitive (a visible test failure) instead of blind to a new field
    /// that changes behaviour (a silent audit hole).
    pub fn canonical_value(&self) -> Result<serde_json::Value, RuleRefusal> {
        let mut value = serde_json::to_value(self).map_err(|e| {
            RuleRefusal::new(
                RefusalCode::UnknownField,
                "",
                format!("document could not be canonicalised: {e}"),
            )
        })?;

        if let Some(map) = value.as_object_mut() {
            for excluded in EXCLUDED_FROM_HASH {
                map.remove(*excluded);
            }
        }
        Ok(value)
    }

    /// Canonical JSON: sorted keys, no whitespace, decimals as strings.
    pub fn canonical_json(&self) -> Result<String, RuleRefusal> {
        let value = self.canonical_value()?;
        serde_json::to_string(&value).map_err(|e| {
            RuleRefusal::new(
                RefusalCode::UnknownField,
                "",
                format!("canonical form could not be serialised: {e}"),
            )
        })
    }

    /// Lowercase hex SHA-256 of the canonical form — the identity a journal entry
    /// or decision log records.
    pub fn content_hash(&self) -> Result<String, RuleRefusal> {
        Ok(sha256_hex(self.canonical_json()?.as_bytes()))
    }

    /// Every timeframe the document reads, trigger first.
    pub fn timeframes(&self) -> Vec<Timeframe> {
        let mut out = vec![self.trigger_timeframe];
        self.conditions.timeframes(&mut out);
        if let Some(veto) = &self.veto {
            veto.timeframes(&mut out);
        }
        out
    }

    /// How many candles of history the trigger timeframe needs before this rule
    /// can produce a verdict at all.
    pub fn warmup_candles(&self) -> u32 {
        let veto = self.veto.as_ref().map(|v| v.warmup_candles()).unwrap_or(0);
        self.conditions.warmup_candles().max(veto)
    }
}

/// Fields that identify or annotate the rule rather than define it.
///
/// Kept next to the test that pins it so the two cannot drift apart.
const EXCLUDED_FROM_HASH: &[&str] = &["id", "name", "enabled", "provenance"];

/// Parse untrusted JSON into a validated document: migrate, then parse, then
/// validate.
///
/// The order is deliberate. Migration runs on untyped JSON because a document at
/// an older version does not necessarily parse into the current typed shape —
/// that is what a migration is for. Only then does `deny_unknown_fields` get to
/// reject leftovers, and only then does semantic validation run.
pub fn parse_document(json: &str) -> Result<RuleDocument, Refused> {
    let mut raw: serde_json::Value = serde_json::from_str(json).map_err(|e| {
        Refused::one(
            RefusalCode::UnknownField,
            "",
            format!("document is not valid JSON: {e}"),
        )
    })?;

    migrate_to_current(&mut raw).map_err(|e| Refused { refusals: vec![e] })?;

    let document: RuleDocument = serde_json::from_value(raw).map_err(|e| {
        // serde's message already names the offending key, which is exactly what
        // a refusal has to carry. Classifying it further would mean parsing
        // serde's prose, and a wrong classification is worse than an honest one.
        Refused::one(
            RefusalCode::UnknownField,
            "",
            format!(
                "document does not match schema v{}: {e}",
                super::version::CURRENT_SCHEMA_VERSION
            ),
        )
    })?;

    document.validate()?;
    Ok(document)
}

/// Serialise a validated document. The inverse of [`parse_document`].
pub fn serialise_document(document: &RuleDocument) -> Result<String, RuleRefusal> {
    serde_json::to_string(
        &serde_json::to_value(document)
            .map_err(|e| RuleRefusal::new(RefusalCode::UnknownField, "", format!("{e}")))?,
    )
    .map_err(|e| RuleRefusal::new(RefusalCode::UnknownField, "", format!("{e}")))
}

/// The deepest nesting a document may carry, re-exported so a UI can stop a
/// trader before the validator has to.
pub const MAX_DEPTH: usize = MAX_CONDITION_DEPTH;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rule::condition::{
        AccountField, CompareOp, CrossDirection, LogicOp, Operand, PositionSide, PriceField,
    };
    use crate::rule::consequence::{OrderIntent, OrderSide, SizeBasis};
    use crate::rule::indicator::{IndicatorRef, ParamValue};
    use rust_decimal::Decimal;
    use std::collections::BTreeMap;
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

    /// "RSI below 30 on the 4h close" — the sentence the whole item is about.
    fn rsi_dip() -> RuleDocument {
        RuleDocument {
            schema_version: SchemaVersion::CURRENT,
            id: "rule-1".to_string(),
            name: "RSI dip".to_string(),
            symbol: "BTCUSDT".to_string(),
            trigger_timeframe: tf("4h"),
            conditions: Condition::Compare {
                left: Operand::Indicator { indicator: rsi(14) },
                op: CompareOp::Lt,
                right: Operand::Constant { value: d("30") },
                timeframe: tf("4h"),
            },
            veto: None,
            action: RuleAction {
                consequence_level: ConsequenceLevel::Notify,
                order: None,
            },
            enabled: true,
            provenance: Provenance {
                source: AuthoringSource::Human,
                created_at_ms: 1_700_000_000_000,
                model: None,
            },
        }
    }

    // ---- round-trip and hash stability -------------------------------------

    #[test]
    fn a_document_round_trips_through_serialisation_unchanged() {
        let original = rsi_dip();
        let json = serialise_document(&original).unwrap();
        let parsed = parse_document(&json).unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn the_hash_is_stable_across_round_trips() {
        let original = rsi_dip();
        let first = original.content_hash().unwrap();

        let mut current = original.clone();
        for _ in 0..5 {
            let json = serialise_document(&current).unwrap();
            current = parse_document(&json).unwrap();
            assert_eq!(current.content_hash().unwrap(), first);
        }
        assert_eq!(first.len(), 64);
    }

    /// Field *order* in the input must not change the hash — otherwise two
    /// byte-different spellings of one rule would be two rules in the log.
    #[test]
    fn the_hash_ignores_key_order_in_the_source_json() {
        let doc = rsi_dip();
        let canonical = serialise_document(&doc).unwrap();

        let mut value: serde_json::Value = serde_json::from_str(&canonical).unwrap();
        // Re-serialise from a Value, which sorts keys; then hand-build a
        // differently-ordered spelling of the same object.
        let reordered = format!(
            r#"{{"provenance":{},"enabled":{},"action":{},"conditions":{},"trigger_timeframe":{},"symbol":{},"name":{},"id":{},"schema_version":{}}}"#,
            value["provenance"],
            value["enabled"],
            value["action"],
            value["conditions"],
            value["trigger_timeframe"],
            value["symbol"],
            value["name"],
            value["id"],
            value["schema_version"]
        );
        assert_ne!(
            reordered, canonical,
            "the test needs a genuinely different byte string"
        );
        value = serde_json::from_str(&reordered).unwrap();
        let from_reordered: RuleDocument = serde_json::from_value(value).unwrap();
        assert_eq!(
            from_reordered.content_hash().unwrap(),
            doc.content_hash().unwrap()
        );
    }

    /// The two halves of the hashing decision, asserted rather than assumed.
    #[test]
    fn the_hash_tracks_meaning_and_ignores_labelling() {
        let base = rsi_dip();
        let hash = base.content_hash().unwrap();

        for mutate in [
            (|doc: &mut RuleDocument| doc.name = "Completely different label".to_string())
                as fn(&mut RuleDocument),
            |doc: &mut RuleDocument| doc.id = "some-other-uuid".to_string(),
            |doc: &mut RuleDocument| doc.enabled = !doc.enabled,
            |doc: &mut RuleDocument| doc.provenance.created_at_ms = 42,
            |doc: &mut RuleDocument| doc.provenance.source = AuthoringSource::Model,
        ] {
            let mut altered = base.clone();
            mutate(&mut altered);
            assert_eq!(
                altered.content_hash().unwrap(),
                hash,
                "labelling changed the strategy hash"
            );
        }

        for mutate in [
            (|doc: &mut RuleDocument| doc.symbol = "ETHUSDT".to_string()) as fn(&mut RuleDocument),
            |doc: &mut RuleDocument| doc.trigger_timeframe = tf("1h"),
            |doc: &mut RuleDocument| {
                doc.conditions = Condition::Compare {
                    left: Operand::Indicator { indicator: rsi(21) },
                    op: CompareOp::Lt,
                    right: Operand::Constant { value: d("30") },
                    timeframe: tf("4h"),
                }
            },
            |doc: &mut RuleDocument| {
                doc.conditions = Condition::Compare {
                    left: Operand::Indicator { indicator: rsi(14) },
                    op: CompareOp::Gt,
                    right: Operand::Constant { value: d("30") },
                    timeframe: tf("4h"),
                }
            },
            |doc: &mut RuleDocument| doc.action.consequence_level = ConsequenceLevel::Simulate,
        ] {
            let mut altered = base.clone();
            mutate(&mut altered);
            assert_ne!(
                altered.content_hash().unwrap(),
                hash,
                "a change of meaning left the hash alone"
            );
        }
    }

    /// Guards the direction of `canonical_value`: it *removes* an excluded list
    /// rather than assembling an included one, so a field added to the struct is
    /// hashed by default. If someone adds a behavioural field and this list is
    /// not the reason it is excluded, the hash still covers it.
    #[test]
    fn only_labelling_fields_are_excluded_from_the_hash() {
        assert_eq!(EXCLUDED_FROM_HASH, &["id", "name", "enabled", "provenance"]);
        let canonical = rsi_dip().canonical_value().unwrap();
        let map = canonical.as_object().unwrap();
        for excluded in EXCLUDED_FROM_HASH {
            assert!(!map.contains_key(*excluded));
        }
        for included in [
            "schema_version",
            "symbol",
            "trigger_timeframe",
            "conditions",
            "action",
        ] {
            assert!(map.contains_key(included), "{included} must be hashed");
        }
    }

    // ---- rejection of unknown things ---------------------------------------

    #[test]
    fn an_unknown_top_level_field_is_rejected_rather_than_ignored() {
        let json = serialise_document(&rsi_dip()).unwrap();
        let with_extra = json.replace(r#""enabled":true"#, r#""enabled":true,"max_loss":"100""#);
        let err = parse_document(&with_extra).unwrap_err();
        assert!(err.to_string().contains("max_loss"), "got: {err}");
    }

    #[test]
    fn an_unknown_operator_is_rejected() {
        let json = serialise_document(&rsi_dip())
            .unwrap()
            .replace(r#""op":"lt""#, r#""op":"approximately""#);
        assert!(parse_document(&json).is_err());
    }

    #[test]
    fn an_unknown_condition_kind_is_rejected() {
        let json = serialise_document(&rsi_dip())
            .unwrap()
            .replace(r#""kind":"compare""#, r#""kind":"javascript""#);
        assert!(parse_document(&json).is_err());
    }

    /// ADR-0012 decision 1, as a structural property: there is no field anywhere
    /// in the schema that holds an expression, so supplied text cannot become a
    /// code path — it can only fail to parse.
    #[test]
    fn a_document_carrying_an_expression_has_nowhere_to_put_it() {
        for attempt in [
            r#"{"kind":"expression","source":"close > sma(20)"}"#,
            r#"{"kind":"compare","expression":"rsi(14) < 30"}"#,
            r#"{"kind":"script","body":"return true"}"#,
        ] {
            assert!(
                serde_json::from_str::<Condition>(attempt).is_err(),
                "`{attempt}` must not parse into a condition"
            );
        }
    }

    #[test]
    fn a_document_with_no_schema_version_is_refused() {
        let json = serialise_document(&rsi_dip()).unwrap();
        let stripped = json.replace(r#""schema_version":1,"#, "");
        let err = parse_document(&stripped).unwrap_err();
        assert!(err.has(RefusalCode::UnsupportedSchemaVersion));
    }

    // ---- ADR-0012 decision 7: feeds veto, never trigger ---------------------

    fn feed_condition() -> Condition {
        Condition::ExternalFeed {
            feed: "liquidation_heatmap".to_string(),
            op: CompareOp::Gt,
            value: d("0.8"),
        }
    }

    #[test]
    fn a_third_party_feed_as_a_trigger_is_refused_and_cites_the_decision() {
        let mut doc = rsi_dip();
        doc.conditions = feed_condition();
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::ExternalFeedTrigger));
        let refusal = err
            .refusals
            .iter()
            .find(|r| r.code == RefusalCode::ExternalFeedTrigger)
            .unwrap();
        assert!(refusal.detail.contains("ADR-0012"));
        assert!(refusal.detail.contains("veto"));
    }

    #[test]
    fn a_feed_nested_deep_inside_a_trigger_group_is_still_refused() {
        let mut doc = rsi_dip();
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![
                rsi_dip().conditions,
                Condition::Group {
                    op: LogicOp::Any,
                    of: vec![feed_condition()],
                },
            ],
        };
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::ExternalFeedTrigger));
        let refusal = err
            .refusals
            .iter()
            .find(|r| r.code == RefusalCode::ExternalFeedTrigger)
            .unwrap();
        assert_eq!(refusal.field, "conditions.of[1].of[0]");
    }

    #[test]
    fn the_same_feed_is_accepted_as_a_veto() {
        let mut doc = rsi_dip();
        doc.veto = Some(feed_condition());
        assert!(doc.validate().is_ok(), "{:?}", doc.validate());
    }

    // ---- consequence levels -------------------------------------------------

    #[test]
    fn a_notify_rule_cannot_read_account_state_and_the_refusal_says_why() {
        let mut doc = rsi_dip();
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![
                rsi_dip().conditions,
                Condition::Position {
                    side: PositionSide::Either,
                    open: false,
                },
            ],
        };
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::FieldNotHonouredAtLevel));
        let refusal = err
            .refusals
            .iter()
            .find(|r| r.code == RefusalCode::FieldNotHonouredAtLevel)
            .unwrap();
        assert_eq!(refusal.field, "conditions.of[1]");
        assert!(refusal.detail.contains("position book"));
    }

    #[test]
    fn the_same_account_condition_is_accepted_at_simulate() {
        let mut doc = rsi_dip();
        doc.conditions = Condition::Account {
            field: AccountField::UnrealisedPnlPercent,
            op: CompareOp::Lt,
            value: d("-2"),
        };
        doc.action = RuleAction {
            consequence_level: ConsequenceLevel::Simulate,
            order: Some(OrderIntent {
                side: OrderSide::Sell,
                size_basis: SizeBasis::PercentOfEquity,
                size: d("100"),
                reduce_only: true,
            }),
        };
        assert!(doc.validate().is_ok(), "{:?}", doc.validate());
    }

    /// FEAT-0303's acceptance criterion, at the document level.
    #[test]
    fn a_notify_document_refuses_a_caller_asking_it_to_send() {
        let err = rsi_dip().authorise(ConsequenceLevel::Send).unwrap_err();
        assert_eq!(err.code, RefusalCode::ConsequenceLevelTooLow);
        assert_eq!(err.field, "action.consequence_level");
    }

    // ---- structural bounds --------------------------------------------------

    #[test]
    fn a_condition_tree_deeper_than_the_bound_is_refused_rather_than_overflowing() {
        let mut nested = rsi_dip().conditions;
        for _ in 0..(MAX_DEPTH + 2) {
            nested = Condition::Group {
                op: LogicOp::All,
                of: vec![nested],
            };
        }
        let mut doc = rsi_dip();
        doc.conditions = nested;
        assert!(doc
            .validate()
            .unwrap_err()
            .has(RefusalCode::ConditionTreeTooDeep));
    }

    #[test]
    fn an_empty_group_is_refused() {
        let mut doc = rsi_dip();
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![],
        };
        assert!(doc
            .validate()
            .unwrap_err()
            .has(RefusalCode::EmptyConditionTree));
    }

    #[test]
    fn a_blank_symbol_is_refused() {
        let mut doc = rsi_dip();
        doc.symbol = "   ".to_string();
        assert!(doc.validate().unwrap_err().has(RefusalCode::InvalidSymbol));
    }

    // ---- multi-timeframe ----------------------------------------------------

    #[test]
    fn a_coarser_condition_under_a_finer_trigger_is_accepted() {
        let mut doc = rsi_dip();
        doc.trigger_timeframe = tf("1h");
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![
                Condition::Compare {
                    left: Operand::Indicator { indicator: rsi(14) },
                    op: CompareOp::Lt,
                    right: Operand::Constant { value: d("30") },
                    timeframe: tf("4h"),
                },
                Condition::Cross {
                    left: Operand::Price {
                        field: PriceField::Close,
                    },
                    direction: CrossDirection::Above,
                    right: Operand::Constant { value: d("60000") },
                    timeframe: tf("1h"),
                },
            ],
        };
        assert!(doc.validate().is_ok(), "{:?}", doc.validate());
        assert_eq!(doc.timeframes(), vec![tf("1h"), tf("4h")]);
    }

    #[test]
    fn a_condition_finer_than_the_trigger_is_refused_by_name() {
        let mut doc = rsi_dip();
        doc.trigger_timeframe = tf("4h");
        doc.conditions = Condition::Compare {
            left: Operand::Indicator { indicator: rsi(14) },
            op: CompareOp::Lt,
            right: Operand::Constant { value: d("30") },
            timeframe: tf("15m"),
        };
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::ConditionTimeframeFinerThanTrigger));
        assert_eq!(err.refusals[0].field, "conditions.timeframe");
    }

    // ---- every refusal at once ---------------------------------------------

    /// Validation reports the whole list, not the first problem, so one repair
    /// pass is enough.
    #[test]
    fn validation_reports_every_problem_in_one_pass() {
        let mut doc = rsi_dip();
        doc.symbol = String::new();
        doc.id = String::new();
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![
                feed_condition(),
                Condition::Position {
                    side: PositionSide::Long,
                    open: true,
                },
            ],
        };
        let err = doc.validate().unwrap_err();
        assert!(err.refusals.len() >= 4, "got only: {err}");
        assert!(err.has(RefusalCode::InvalidSymbol));
        assert!(err.has(RefusalCode::UnknownField));
        assert!(err.has(RefusalCode::ExternalFeedTrigger));
        assert!(err.has(RefusalCode::FieldNotHonouredAtLevel));
    }
}
