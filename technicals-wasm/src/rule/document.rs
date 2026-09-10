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

use super::condition::{Condition, ConditionSite, MAX_CONDITION_DEPTH, MAX_RULE_WARMUP_CANDLES};
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

        // The ceiling that keeps an over-deep rule from being silent instead of
        // refused. Checked per tree so the refusal names which half is too
        // deep; `warmup_candles()` reduces to a maximum and carries no path, so
        // this is the finest granularity available without a second walker.
        for (site, tree) in [
            ("conditions", Some(&self.conditions)),
            ("veto", self.veto.as_ref()),
        ] {
            let Some(tree) = tree else { continue };
            let needed = tree.warmup_candles();
            if needed > MAX_RULE_WARMUP_CANDLES {
                out.push(RuleRefusal::new(
                    RefusalCode::RuleWarmupTooDeep,
                    site,
                    format!(
                        "this rule needs {needed} closed candles before it can produce a \
                         verdict, and at most {MAX_RULE_WARMUP_CANDLES} are loaded. Without \
                         this refusal the alert would simply never fire: the evaluation gate \
                         withholds a verdict while the series is too short and has no \
                         separate state for a requirement that can never be met. Shorten a \
                         window or an indicator period."
                    ),
                ));
            }
        }

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

    /// Every timeframe the document reads from the mark-price series.
    ///
    /// Empty for the overwhelming majority of rules, which is the point: a
    /// caller fetches a second, mark-price candle series only when some
    /// condition actually names one.
    pub fn mark_timeframes(&self) -> Vec<Timeframe> {
        let mut out = Vec::new();
        self.conditions.mark_timeframes(&mut out);
        if let Some(veto) = &self.veto {
            veto.mark_timeframes(&mut out);
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
        AccountField, CompareOp, CrossDirection, Dimension, LogicOp, Operand, PositionSide,
        PriceField, PriceSource, WindowAgg, MAX_WINDOW_LOOKBACK,
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

    // ---- FEAT-0390: price source and percentage moves ----------------------

    fn price_cross(source: PriceSource) -> Condition {
        Condition::Cross {
            left: Operand::Price {
                field: PriceField::Close,
                source,
            },
            direction: CrossDirection::Above,
            right: Operand::Constant { value: d("60000") },
            timeframe: tf("4h"),
        }
    }

    /// The claim the whole additive design rests on: a rule that reads the last
    /// price serialises exactly as it did before `source` existed, so every
    /// document already in `cachy_rules_v1` keeps its content hash and needs no
    /// migration. If this fails, the feature silently re-identifies every stored
    /// rule in the journal.
    #[test]
    fn a_last_price_source_is_absent_from_the_canonical_form() {
        let mut doc = rsi_dip();
        doc.conditions = price_cross(PriceSource::Last);
        let canonical = doc.canonical_json().unwrap();
        // `"source"` on its own would also match `provenance.source`, which is a
        // different field entirely; the operand's spelling is what matters here.
        assert!(
            !canonical.contains(r#""source":"last""#),
            "a default price source must not be serialised: {canonical}"
        );
    }

    /// The same document written before this field existed — i.e. with no
    /// `source` key at all — must parse, mean last price, and hash the same.
    #[test]
    fn a_document_without_a_price_source_parses_as_last_and_keeps_its_hash() {
        let mut doc = rsi_dip();
        doc.conditions = price_cross(PriceSource::Last);
        let json = serialise_document(&doc).unwrap();
        assert!(!json.contains(r#""source":"last""#));

        let parsed = parse_document(&json).unwrap();
        assert_eq!(parsed.conditions, price_cross(PriceSource::Last));
        assert_eq!(parsed.content_hash().unwrap(), doc.content_hash().unwrap());
    }

    /// Reading the mark series instead of the last series is a different alarm,
    /// so it must be a different strategy in the log.
    #[test]
    fn switching_to_the_mark_price_changes_the_content_hash() {
        let mut last = rsi_dip();
        last.conditions = price_cross(PriceSource::Last);
        let mut mark = rsi_dip();
        mark.conditions = price_cross(PriceSource::Mark);

        assert_ne!(
            last.content_hash().unwrap(),
            mark.content_hash().unwrap(),
            "the price series a rule reads is part of what it means"
        );
        assert!(serialise_document(&mark).unwrap().contains(r#""source":"mark""#));
    }

    #[test]
    fn a_mark_price_document_round_trips() {
        let mut doc = rsi_dip();
        doc.conditions = price_cross(PriceSource::Mark);
        let parsed = parse_document(&serialise_document(&doc).unwrap()).unwrap();
        assert_eq!(parsed, doc);
    }

    fn percent_move(lookback: u32) -> Condition {
        Condition::Compare {
            left: Operand::PercentChange {
                field: PriceField::Close,
                source: PriceSource::Last,
                lookback,
            },
            op: CompareOp::Gte,
            right: Operand::Constant { value: d("5") },
            timeframe: tf("4h"),
        }
    }

    /// A lookback of zero measures a candle against itself: always exactly zero
    /// percent, so the rule can never fire. Refused at authoring rather than
    /// stored as an alarm that stays silent — that is the BUG-0382 shape.
    #[test]
    fn a_percentage_move_with_no_lookback_is_refused_and_names_the_field() {
        let mut doc = rsi_dip();
        doc.conditions = percent_move(0);
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::InvalidLookback));
        let refusal = err
            .refusals
            .iter()
            .find(|r| r.code == RefusalCode::InvalidLookback)
            .unwrap();
        assert_eq!(refusal.field, "conditions.left.lookback");
    }

    #[test]
    fn a_percentage_move_with_a_real_lookback_is_accepted_and_round_trips() {
        let mut doc = rsi_dip();
        doc.conditions = percent_move(3);
        assert!(doc.validate().is_ok(), "{:?}", doc.validate());
        assert_eq!(parse_document(&serialise_document(&doc).unwrap()).unwrap(), doc);
    }

    /// A percentage move cannot answer before its reference candle exists.
    #[test]
    fn a_percentage_move_needs_its_reference_candle_in_the_warmup() {
        let mut doc = rsi_dip();
        doc.conditions = percent_move(3);
        assert_eq!(doc.warmup_candles(), 4);
    }

    /// The mark series is fetched separately and not every venue serves one, so
    /// a caller has to be able to ask which timeframes actually need it —
    /// without walking the tree itself.
    #[test]
    fn only_conditions_that_read_the_mark_series_report_a_mark_timeframe() {
        let mut last_only = rsi_dip();
        last_only.conditions = price_cross(PriceSource::Last);
        assert!(last_only.mark_timeframes().is_empty());

        let mut mark = rsi_dip();
        mark.conditions = price_cross(PriceSource::Mark);
        assert_eq!(mark.mark_timeframes(), vec![tf("4h")]);
    }

    #[test]
    fn a_mark_condition_nested_in_a_group_still_reports_its_timeframe() {
        let mut doc = rsi_dip();
        doc.trigger_timeframe = tf("1h");
        doc.conditions = Condition::Group {
            op: LogicOp::All,
            of: vec![
                rsi_dip().conditions,
                Condition::Group {
                    op: LogicOp::Any,
                    of: vec![price_cross(PriceSource::Mark)],
                },
            ],
        };
        assert_eq!(doc.mark_timeframes(), vec![tf("4h")]);
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
                        source: PriceSource::Last,
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

    // ---- FEAT-0028: volume is an operand, and it has a unit ----------------

    fn ind(id: &str, period: u32) -> IndicatorRef {
        let mut params = BTreeMap::new();
        params.insert("period".to_string(), ParamValue::Count(period));
        IndicatorRef {
            id: id.to_string(),
            params,
            output: "value".to_string(),
        }
    }

    fn compare(left: Operand, right: Operand) -> Condition {
        Condition::Compare {
            left,
            op: CompareOp::Gt,
            right,
            timeframe: tf("4h"),
        }
    }

    fn with(conditions: Condition) -> RuleDocument {
        let mut doc = rsi_dip();
        doc.conditions = conditions;
        doc
    }

    /// The reason `Volume` is its own operand and not a seventh `PriceField`.
    ///
    /// Both numbers are well-formed and nothing downstream would object: the
    /// rule would compare traded size against quote currency and fire on the
    /// crossover of two unrelated scales. Validation is the last place this is
    /// still visible.
    #[test]
    fn volume_against_a_price_is_refused_rather_than_compared() {
        let doc = with(compare(
            Operand::Volume {},
            Operand::Price {
                field: PriceField::Close,
                source: PriceSource::Last,
            },
        ));
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::OperandDimensionMismatch));
        let refusal = err
            .refusals
            .iter()
            .find(|r| r.code == RefusalCode::OperandDimensionMismatch)
            .unwrap();
        assert_eq!(refusal.field, "conditions");
        assert!(
            refusal.detail.contains("volume") && refusal.detail.contains("price"),
            "the refusal has to name both dimensions: {}",
            refusal.detail
        );
    }

    /// The same refusal through the indicator registry rather than through
    /// `PriceField`: an EMA is a price, so volume cannot be compared to it.
    #[test]
    fn volume_against_a_price_moving_average_is_refused_too() {
        let doc = with(compare(
            Operand::Volume {},
            Operand::Indicator {
                indicator: ind("ema", 20),
            },
        ));
        assert!(doc
            .validate()
            .unwrap_err()
            .has(RefusalCode::OperandDimensionMismatch));
    }

    /// A `Cross` is the other shape that reads two operands, so it carries the
    /// same check. Without it the refusal would be one shape's habit rather
    /// than the schema's rule.
    #[test]
    fn a_volume_crossing_a_price_is_refused_on_the_same_grounds() {
        let doc = with(Condition::Cross {
            left: Operand::Volume {},
            direction: CrossDirection::Above,
            right: Operand::Price {
                field: PriceField::Close,
                source: PriceSource::Last,
            },
            timeframe: tf("4h"),
        });
        assert!(doc
            .validate()
            .unwrap_err()
            .has(RefusalCode::OperandDimensionMismatch));
    }

    /// The condition FEAT-0028 actually asks for: volume against its own
    /// average. This is what the whole change exists to make expressible, so a
    /// dimension check that refused it would have missed the point entirely.
    #[test]
    fn volume_against_a_volume_average_is_accepted() {
        let doc = with(compare(
            Operand::Volume {},
            Operand::Indicator {
                indicator: ind("volume_ma", 20),
            },
        ));
        assert!(doc.validate().is_ok());
    }

    /// `Constant` is deliberately dimensionless — it is compared against a
    /// price, a percentage and an RSI in turn. A volume threshold has to keep
    /// working for the same reason all three do.
    #[test]
    fn volume_against_a_plain_threshold_is_accepted() {
        let doc = with(compare(
            Operand::Volume {},
            Operand::Constant {
                value: d("1000000"),
            },
        ));
        assert!(doc.validate().is_ok());
    }

    /// `bollinger` is why the dimension sits on the output and not on the
    /// indicator: three of its lines are prices and `percent_b` is a bare
    /// ratio. One dimension per indicator would have had to special-case this.
    #[test]
    fn bollinger_bands_are_prices_but_percent_b_is_not() {
        let mut params = BTreeMap::new();
        params.insert("period".to_string(), ParamValue::Count(20));
        let band = IndicatorRef {
            id: "bollinger".to_string(),
            params: params.clone(),
            output: "upper".to_string(),
        };
        let ratio = IndicatorRef {
            id: "bollinger".to_string(),
            params,
            output: "percent_b".to_string(),
        };
        assert_eq!(band.output_dimension(), Some(Dimension::Price));
        assert_eq!(ratio.output_dimension(), Some(Dimension::Unitless));
    }

    /// An unknown output already has a precise refusal from
    /// `IndicatorRef::validate`, which names what the registry does offer.
    /// Answering "unknown" for its dimension keeps one bad document to one
    /// refusal instead of adding a vaguer second one.
    #[test]
    fn an_unknown_output_has_no_dimension_and_so_adds_no_second_refusal() {
        let bogus = IndicatorRef {
            id: "rsi".to_string(),
            params: BTreeMap::new(),
            output: "histogram".to_string(),
        };
        assert_eq!(bogus.output_dimension(), None);
        let doc = with(compare(
            Operand::Volume {},
            Operand::Indicator { indicator: bogus },
        ));
        let err = doc.validate().unwrap_err();
        assert!(err.has(RefusalCode::UnknownIndicatorOutput));
        assert!(!err.has(RefusalCode::OperandDimensionMismatch));
    }

    /// The scope this change deliberately does not take.
    ///
    /// `Dimension` knows a price and a percentage are no more comparable than a
    /// price and a volume, and `check_dimensions` could refuse the pair with no
    /// extra code. It does not, because rules already sitting in a trader's
    /// `localStorage` validated yesterday: a saved alert that stops loading is
    /// a worse failure than the one being prevented. When this test is changed,
    /// it should be changed by a commit that also carries the migration.
    #[test]
    fn a_price_against_a_percentage_stays_accepted_until_its_own_change() {
        let doc = with(compare(
            Operand::Price {
                field: PriceField::Close,
                source: PriceSource::Last,
            },
            Operand::PercentChange {
                field: PriceField::Close,
                source: PriceSource::Last,
                lookback: 3,
            },
        ));
        assert!(doc.validate().is_ok());
    }

    /// The additive-schema claim, for the operand this change adds: a volume
    /// operand names itself in the canonical form and survives a round trip,
    /// and no document that predates it changes shape.
    #[test]
    fn a_volume_operand_round_trips_through_its_canonical_form() {
        let doc = with(compare(
            Operand::Volume {},
            Operand::Constant {
                value: d("1000000"),
            },
        ));
        let json = serde_json::to_string(&doc).unwrap();
        assert!(
            json.contains(r#"{"kind":"volume"}"#),
            "volume has to serialise as a bare kind: {json}"
        );
        let back: RuleDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(back.conditions, doc.conditions);
    }

    fn close() -> Operand {
        Operand::Price {
            field: PriceField::Close,
            source: PriceSource::Last,
        }
    }

    fn window(agg: WindowAgg, lookback: u32, of: Operand) -> Operand {
        Operand::Window {
            of: Box::new(of),
            agg,
            lookback,
        }
    }

    /// Rule 2 of ADR-0016, checked through the guard rather than at the method.
    ///
    /// Asserting `dimension()` directly would prove the delegation and not that
    /// it is load-bearing. Running it through `check_dimensions` proves the
    /// thing that matters: a window over a volume is still a volume, so
    /// comparing it against a price is refused for the same reason the bare
    /// volume operand is — the guard was inherited, not re-implemented.
    #[test]
    fn a_window_is_denominated_in_whatever_it_aggregates() {
        let volume_window_vs_price = with(compare(
            window(WindowAgg::Max, 20, Operand::Volume {}),
            close(),
        ));
        let refusals = volume_window_vs_price.validate().unwrap_err().refusals;
        assert!(
            refusals
                .iter()
                .any(|r| r.code == RefusalCode::OperandDimensionMismatch),
            "a window over volume against a price has to be refused: {refusals:?}"
        );

        // And the pair that agrees stays legal, so the test cannot pass by
        // refusing every window.
        let volume_window_vs_volume = with(compare(
            window(WindowAgg::Max, 20, Operand::Volume {}),
            Operand::Volume {},
        ));
        assert!(volume_window_vs_volume.validate().is_ok());

        assert_eq!(
            window(WindowAgg::Min, 20, Operand::Volume {}).dimension(),
            Some(Dimension::Volume)
        );
    }

    /// Rule 4: `of.warmup_candles() + lookback - 1`.
    ///
    /// The `- 1` is the candle the two counts share — the window includes the
    /// close being evaluated, which the inner operand's own warmup already
    /// counts. Stated as a number here because the alternative to auditing it
    /// is discovering it when an alert stays quiet.
    #[test]
    fn a_window_costs_its_span_on_top_of_what_it_aggregates() {
        // A price operand needs 2 (a crossing reads the previous close).
        let over_price = with(compare(window(WindowAgg::Min, 10, close()), close()));
        assert_eq!(over_price.warmup_candles(), 11);

        // An rsi(14) needs its own warmup, and the window adds to it.
        let bare_rsi = with(compare(
            Operand::Indicator { indicator: rsi(14) },
            Operand::Constant { value: d("30") },
        ));
        let windowed = with(compare(
            window(
                WindowAgg::Min,
                10,
                Operand::Indicator { indicator: rsi(14) },
            ),
            Operand::Constant { value: d("30") },
        ));
        assert_eq!(
            windowed.warmup_candles(),
            bare_rsi.warmup_candles() + 9,
            "a 10-close window adds 9 candles to what it aggregates"
        );
    }

    /// Rule 3. A refusal rather than a depth budget: no one has named a use for
    /// a minimum of a maximum, and allowing it lets the history requirement
    /// compound where the type no longer says so.
    #[test]
    fn a_window_over_a_window_is_refused() {
        let doc = with(compare(
            window(WindowAgg::Min, 20, window(WindowAgg::Max, 20, close())),
            close(),
        ));
        let refusals = doc.validate().unwrap_err().refusals;
        assert!(
            refusals.iter().any(|r| r.code == RefusalCode::NestedWindow),
            "{refusals:?}"
        );
    }

    #[test]
    fn a_window_shorter_than_two_closes_or_longer_than_the_cap_is_refused() {
        for lookback in [0, 1, MAX_WINDOW_LOOKBACK + 1] {
            let doc = with(compare(window(WindowAgg::Min, lookback, close()), close()));
            let refusals = doc.validate().unwrap_err().refusals;
            assert!(
                refusals
                    .iter()
                    .any(|r| r.code == RefusalCode::InvalidWindowLookback),
                "lookback {lookback} has to be refused: {refusals:?}"
            );
        }

        // The ends of the accepted range stay accepted.
        for lookback in [2, MAX_WINDOW_LOOKBACK] {
            let doc = with(compare(window(WindowAgg::Min, lookback, close()), close()));
            let refusals = doc.validate().err().map(|e| e.refusals).unwrap_or_default();
            assert!(
                !refusals
                    .iter()
                    .any(|r| r.code == RefusalCode::InvalidWindowLookback),
                "lookback {lookback} is inside the range: {refusals:?}"
            );
        }
    }

    /// The refusal that keeps an over-deep rule from being silent.
    ///
    /// `ruleEvaluationGate` withholds a verdict while the series is shorter
    /// than the warmup requirement and has no separate state for "and it always
    /// will be", so without this the alert is indistinguishable from one still
    /// warming up. The example is ADR-0016's own: a 500-close window over an
    /// ema(50) needs 549 candles, which passes the per-operand cap and fails
    /// the total.
    #[test]
    fn a_rule_needing_more_history_than_the_app_loads_is_refused() {
        let mut params = BTreeMap::new();
        params.insert("period".to_string(), ParamValue::Count(50));
        let ema = IndicatorRef {
            id: "ema".to_string(),
            params,
            output: "value".to_string(),
        };

        let doc = with(compare(
            window(
                WindowAgg::Min,
                MAX_WINDOW_LOOKBACK,
                Operand::Indicator {
                    indicator: ema.clone(),
                },
            ),
            Operand::Indicator { indicator: ema },
        ));
        assert!(doc.warmup_candles() > MAX_RULE_WARMUP_CANDLES);

        let refusals = doc.validate().unwrap_err().refusals;
        let deep = refusals
            .iter()
            .find(|r| r.code == RefusalCode::RuleWarmupTooDeep)
            .unwrap_or_else(|| panic!("expected a warmup refusal: {refusals:?}"));
        assert_eq!(deep.field, "conditions");
        assert!(
            deep.detail.contains(&doc.warmup_candles().to_string()),
            "the refusal has to name the figure a trader must get under: {}",
            deep.detail
        );
    }

    /// Rule 7: the addition is additive. A window names itself in the canonical
    /// form, survives a round trip, and no document that predates it changes
    /// shape — so no stored rule's content hash moves and no migration is due.
    #[test]
    fn a_window_operand_round_trips_through_its_canonical_form() {
        let doc = with(compare(
            close(),
            window(WindowAgg::Min, 120, Operand::Volume {}),
        ));
        let json = serde_json::to_string(&doc).unwrap();
        assert!(
            json.contains(r#""kind":"window""#) && json.contains(r#""agg":"min""#),
            "a window has to serialise as snake_case kind and agg: {json}"
        );
        let back: RuleDocument = serde_json::from_str(&json).unwrap();
        assert_eq!(back.conditions, doc.conditions);
    }

    /// Rule 6: `Min` and `Max`, and nothing else. `sma`, `ema` and `volume_ma`
    /// already average over a period; a second spelling of the same number is a
    /// second thing to keep consistent with the first.
    #[test]
    fn a_window_has_no_aggregate_beyond_min_and_max() {
        let json = serde_json::to_string(&with(compare(
            close(),
            window(WindowAgg::Min, 10, close()),
        )))
        .unwrap()
        .replace(r#""agg":"min""#, r#""agg":"mean""#);
        assert!(serde_json::from_str::<RuleDocument>(&json).is_err());
    }
}
