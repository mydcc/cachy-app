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

//! The JavaScript surface of the rule schema.
//!
//! Split in two on purpose. Every function with behaviour is a plain Rust
//! `..._json` function returning `Result<String, Refused>`; every
//! `#[wasm_bindgen]` export is a three-line shell that converts the error into a
//! `JsValue`.
//!
//! That split is not tidiness. `JsValue` and `serde_wasm_bindgen::to_value`
//! panic outside `wasm32` — js-sys has no host implementation — so anything
//! that touches them is unreachable from `cargo test`. Written the obvious way,
//! with the logic inside the exports, **every refusal path in this module would
//! be untestable**, and this crate's tests are the only ones CI can run without
//! a browser. So the logic lives where the tests can reach it, and the shell
//! stays too small to hide a mistake.
//!
//! Refusals cross as JSON rather than as a message: the caller has to render an
//! i18n key and point at a field, and a stringified error would force the
//! TypeScript side to parse English back into a decision.
//!
//! There is deliberately no second validator on the TypeScript side. Two
//! implementations of "is this rule valid" is the divergence ADR-0012 exists to
//! prevent, so TypeScript gets types and this module gets the say.

use std::collections::BTreeMap;

use rust_decimal::Decimal;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

use super::consequence::ConsequenceLevel;
use super::document::{parse_document, serialise_document};
use super::evaluate::{evaluate, AccountSnapshot, Candle, InMemoryMarket};
use super::indicator::IndicatorRef;
use super::refusal::{RefusalCode, Refused};
use super::timeframe::Timeframe;
use super::version::CURRENT_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Logic. Host-testable, no JsValue anywhere.
// ---------------------------------------------------------------------------

/// Parse, migrate and validate a document, returning its **canonical**
/// serialisation.
///
/// Canonical, not the input: a caller that stores what comes back stores the
/// normalised form, so `240m` becomes `4h` once rather than differing between
/// what was saved and what gets hashed.
pub fn validate_json(document_json: &str) -> Result<String, Refused> {
    let document = parse_document(document_json)?;
    serialise_document(&document).map_err(|e| Refused { refusals: vec![e] })
}

/// The content hash of a document, after validating it.
///
/// Validation first, deliberately: hashing an invalid document would mint an
/// identity for something that can never run, and that identity would then show
/// up in a journal entry as though it were a strategy.
pub fn content_hash_json(document_json: &str) -> Result<String, Refused> {
    let document = parse_document(document_json)?;
    document
        .content_hash()
        .map_err(|e| Refused { refusals: vec![e] })
}

/// Whether a document authorises `requested_level`, refusing by name otherwise.
///
/// This is the check an executor makes before doing anything, and the one that
/// keeps a `notify` rule from ever reaching the order path.
pub fn authorise_json(document_json: &str, requested_level: &str) -> Result<(), Refused> {
    let requested = match requested_level {
        "notify" => ConsequenceLevel::Notify,
        "simulate" => ConsequenceLevel::Simulate,
        "send" => ConsequenceLevel::Send,
        other => {
            return Err(Refused::one(
                RefusalCode::UnknownField,
                "requested_level",
                format!("`{other}` is not a consequence level; expected notify, simulate or send"),
            ))
        }
    };
    parse_document(document_json)?
        .authorise(requested)
        .map_err(|e| Refused { refusals: vec![e] })
}

/// How many candles of the trigger timeframe the document needs before it can
/// produce a verdict, so a caller can request enough history up front rather
/// than discovering the gap as a stream of indeterminate verdicts.
pub fn warmup_candles_json(document_json: &str) -> Result<u32, Refused> {
    Ok(parse_document(document_json)?.warmup_candles())
}

/// Every timeframe the document reads, canonical spellings, trigger first.
pub fn timeframes_json(document_json: &str) -> Result<Vec<String>, Refused> {
    Ok(parse_document(document_json)?
        .timeframes()
        .iter()
        .map(|t| t.canonical())
        .collect())
}

/// Convert a shipped FEAT-0027 alert definition into an equivalent rule document.
///
/// Exposed so the migration of stored alerts happens through the same conversion
/// the differential tests cover, rather than through a second one written in
/// TypeScript.
pub fn from_alert_json(
    alert_json: &str,
    timeframe: &str,
    created_at_ms: i64,
) -> Result<String, Refused> {
    let alert: crate::alert_engine::AlertDefinition =
        serde_json::from_str(alert_json).map_err(|e| {
            Refused::one(
                RefusalCode::UnknownField,
                "alert",
                format!("could not read alert definition: {e}"),
            )
        })?;

    let tf = Timeframe::parse_at(timeframe, "trigger_timeframe")
        .map_err(|e| Refused { refusals: vec![e] })?;

    let document = super::legacy::rule_from_alert(&alert, tf, created_at_ms)?;
    serialise_document(&document).map_err(|e| Refused { refusals: vec![e] })
}

/// The market and account snapshot a document is evaluated against, on the wire.
///
/// `candles` is keyed by any spelling [`Timeframe::parse`] accepts. `indicators`
/// names each series by its full [`IndicatorRef`] rather than by
/// [`InMemoryMarket`]'s internal `Debug`-derived key, so nothing on the JS side
/// has to replicate that formatting; `values` is index-aligned to
/// `candles[timeframe]`, `null` where a value was not available (not yet warmed
/// up, or a gap) — [`MarketView::indicator_at`](super::evaluate::MarketView) reads
/// exactly that as "no value" and turns it into an indeterminate verdict rather
/// than a false condition.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CtxPayload {
    candles: BTreeMap<String, Vec<Candle>>,
    #[serde(default)]
    indicators: Vec<IndicatorSeries>,
    #[serde(default)]
    feeds: BTreeMap<String, Decimal>,
    #[serde(default)]
    account: Option<AccountSnapshot>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IndicatorSeries {
    indicator: IndicatorRef,
    timeframe: String,
    values: Vec<Option<Decimal>>,
}

/// Evaluate `document` against a JSON-carried market/account snapshot.
///
/// Assembles an [`InMemoryMarket`] from `ctx_json` and hands it to
/// [`evaluate`](super::evaluate::evaluate) — this function decides nothing about
/// the rule itself, only about what the caller sent. Refuses rather than panics
/// on anything malformed, same as every other export in this module.
pub fn evaluate_json(document_json: &str, ctx_json: &str) -> Result<String, Refused> {
    let document = parse_document(document_json)?;

    let payload: CtxPayload = serde_json::from_str(ctx_json).map_err(|e| {
        Refused::one(
            RefusalCode::UnknownField,
            "ctx",
            format!("ctx is not valid JSON: {e}"),
        )
    })?;

    let mut market = InMemoryMarket::new();

    for (raw_timeframe, candles) in payload.candles {
        let timeframe =
            Timeframe::parse_at(&raw_timeframe, &format!("ctx.candles.{raw_timeframe}"))
                .map_err(|e| Refused { refusals: vec![e] })?;
        market = market.with_candles(timeframe, candles);
    }

    for (i, series) in payload.indicators.into_iter().enumerate() {
        let timeframe = Timeframe::parse_at(
            &series.timeframe,
            &format!("ctx.indicators[{i}].timeframe"),
        )
        .map_err(|e| Refused { refusals: vec![e] })?;
        for (index, value) in series.values.into_iter().enumerate() {
            if let Some(value) = value {
                market = market.with_indicator(&series.indicator, timeframe, index, value);
            }
        }
    }

    for (feed, value) in payload.feeds {
        market = market.with_feed(&feed, value);
    }

    let verdict = evaluate(&document, &market, payload.account.as_ref());
    serde_json::to_string(&verdict).map_err(|e| {
        Refused::one(
            RefusalCode::UnknownField,
            "",
            format!("verdict could not be serialised: {e}"),
        )
    })
}

// ---------------------------------------------------------------------------
// The boundary. Nothing here decides anything.
// ---------------------------------------------------------------------------

/// Structured refusals for the `Err` arm.
///
/// Falls back to the `Display` string only if the refusal itself cannot be
/// serialised, which would mean something is badly wrong; losing the structure
/// beats losing the refusal.
fn refused_to_js(refused: Refused) -> JsValue {
    serde_wasm_bindgen::to_value(&refused)
        .unwrap_or_else(|_| JsValue::from_str(&refused.to_string()))
}

/// The schema version this build authors and reads.
#[wasm_bindgen]
pub fn rule_schema_version() -> u16 {
    CURRENT_SCHEMA_VERSION
}

#[wasm_bindgen]
pub fn rule_validate(document_json: &str) -> Result<String, JsValue> {
    validate_json(document_json).map_err(refused_to_js)
}

#[wasm_bindgen]
pub fn rule_content_hash(document_json: &str) -> Result<String, JsValue> {
    content_hash_json(document_json).map_err(refused_to_js)
}

#[wasm_bindgen]
pub fn rule_authorise(document_json: &str, requested_level: &str) -> Result<(), JsValue> {
    authorise_json(document_json, requested_level).map_err(refused_to_js)
}

#[wasm_bindgen]
pub fn rule_warmup_candles(document_json: &str) -> Result<u32, JsValue> {
    warmup_candles_json(document_json).map_err(refused_to_js)
}

#[wasm_bindgen]
pub fn rule_timeframes(document_json: &str) -> Result<JsValue, JsValue> {
    let names = timeframes_json(document_json).map_err(refused_to_js)?;
    serde_wasm_bindgen::to_value(&names)
        .map_err(|e| JsValue::from_str(&format!("could not serialise timeframes: {e}")))
}

#[wasm_bindgen]
pub fn rule_from_alert_json(
    alert_json: &str,
    timeframe: &str,
    created_at_ms: f64,
) -> Result<String, JsValue> {
    from_alert_json(alert_json, timeframe, created_at_ms as i64).map_err(refused_to_js)
}

#[wasm_bindgen]
pub fn rule_evaluate(document_json: &str, ctx_json: &str) -> Result<String, JsValue> {
    evaluate_json(document_json, ctx_json).map_err(refused_to_js)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal valid document, as a caller would send it.
    const DOC: &str = r#"{
        "schema_version": 1,
        "id": "rule-1",
        "name": "RSI dip",
        "symbol": "BTCUSDT",
        "trigger_timeframe": "4h",
        "conditions": {
            "kind": "compare",
            "left": { "kind": "indicator", "indicator": { "id": "rsi", "params": { "period": 14 } } },
            "op": "lt",
            "right": { "kind": "constant", "value": "30" },
            "timeframe": "4h"
        },
        "action": { "consequence_level": "notify" },
        "enabled": true,
        "provenance": { "source": "human", "created_at_ms": 1700000000000 }
    }"#;

    #[test]
    fn validate_returns_the_canonical_form() {
        let canonical = validate_json(DOC).unwrap();
        // Re-validating the canonical form is a no-op, which is what makes it
        // safe for a caller to store what came back.
        assert_eq!(validate_json(&canonical).unwrap(), canonical);
        assert!(!canonical.contains('\n'));
    }

    #[test]
    fn a_non_canonical_timeframe_spelling_is_normalised_on_the_way_out() {
        let with_240m = DOC
            .replace(
                r#""trigger_timeframe": "4h""#,
                r#""trigger_timeframe": "240m""#,
            )
            .replace(r#""timeframe": "4h""#, r#""timeframe": "240m""#);
        let canonical = validate_json(&with_240m).unwrap();
        assert!(
            canonical.contains(r#""trigger_timeframe":"4h""#),
            "got: {canonical}"
        );
        assert_eq!(
            content_hash_json(&with_240m).unwrap(),
            content_hash_json(DOC).unwrap()
        );
    }

    #[test]
    fn the_hash_is_sixty_four_hex_characters_and_stable() {
        let hash = content_hash_json(DOC).unwrap();
        assert_eq!(hash.len(), 64);
        assert_eq!(content_hash_json(DOC).unwrap(), hash);
    }

    #[test]
    fn authorise_allows_what_the_document_declares() {
        assert!(authorise_json(DOC, "notify").is_ok());
    }

    #[test]
    fn authorise_refuses_a_higher_level_and_an_unknown_one() {
        assert!(authorise_json(DOC, "send").is_err());
        assert!(authorise_json(DOC, "simulate").is_err());
        assert!(authorise_json(DOC, "SEND").is_err());
        assert!(authorise_json(DOC, "").is_err());
    }

    #[test]
    fn timeframes_and_warmup_are_derivable_without_evaluating() {
        assert_eq!(warmup_candles_json(DOC).unwrap(), 15);
    }

    #[test]
    fn an_invalid_document_is_refused_rather_than_hashed() {
        let broken = DOC.replace(r#""id": "rsi""#, r#""id": "rsi_v2""#);
        assert!(content_hash_json(&broken).is_err());
        assert!(validate_json(&broken).is_err());
    }

    #[test]
    fn the_exported_schema_version_matches_the_crate() {
        assert_eq!(rule_schema_version(), CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn a_shipped_alert_converts_through_the_exported_path() {
        let alert =
            r#"{"id":"a1","symbol":"BTCUSDT","condition":{"price_reached":"60000"},"active":true}"#;
        let document = from_alert_json(alert, "1m", 1_700_000_000_000).unwrap();
        assert!(document.contains(r#""kind":"cross""#), "got: {document}");
        assert!(document.contains(r#""direction":"any""#));
        assert!(document.contains(r#""consequence_level":"notify""#));
        // And it is a document the rest of the surface accepts.
        assert!(authorise_json(&document, "notify").is_ok());
        assert!(authorise_json(&document, "send").is_err());
        assert_eq!(content_hash_json(&document).unwrap().len(), 64);
    }

    #[test]
    fn a_calendar_month_trigger_is_refused_at_the_boundary() {
        assert!(from_alert_json(
            r#"{"id":"a1","symbol":"BTCUSDT","condition":{"price_reached":"60000"},"active":true}"#,
            "1M",
            0
        )
        .is_err());
    }

    // ---- rule_evaluate --------------------------------------------------

    /// "RSI below 30 on the 4h close, unless the liquidation heatmap is hot" —
    /// notify-level so no account snapshot is needed, and a veto so `Suppressed`
    /// is reachable too.
    const EVAL_DOC: &str = r#"{
        "schema_version": 1,
        "id": "rule-eval-1",
        "name": "RSI dip",
        "symbol": "BTCUSDT",
        "trigger_timeframe": "4h",
        "conditions": {
            "kind": "compare",
            "left": { "kind": "indicator", "indicator": { "id": "rsi", "params": { "period": 14 } } },
            "op": "lt",
            "right": { "kind": "constant", "value": "30" },
            "timeframe": "4h"
        },
        "veto": {
            "kind": "external_feed",
            "feed": "liquidation_heatmap",
            "op": "gt",
            "value": "0.9"
        },
        "action": { "consequence_level": "notify" },
        "enabled": true,
        "provenance": { "source": "human", "created_at_ms": 1700000000000 }
    }"#;

    /// `n` closed 4h candles, oldest first. Prices are irrelevant here — the
    /// condition reads the indicator series, not the price — so every candle is
    /// identical.
    fn eval_candles_json(n: usize) -> String {
        const STEP_MS: i64 = 4 * 60 * 60 * 1000;
        let candles: Vec<String> = (0..n)
            .map(|i| {
                format!(
                    r#"{{"open_time_ms":{},"open":"100","high":"100","low":"100","close":"100","volume":"0"}}"#,
                    i as i64 * STEP_MS
                )
            })
            .collect();
        format!("[{}]", candles.join(","))
    }

    /// `n` RSI values aligned to `eval_candles_json(n)`, `null` everywhere except
    /// the last index — `evaluate` only ever reads the anchor candle here.
    fn eval_rsi_values_json(n: usize, last: &str) -> String {
        let mut values = vec!["null".to_string(); n.saturating_sub(1)];
        values.push(format!("\"{last}\""));
        format!("[{}]", values.join(","))
    }

    fn eval_ctx_json(rsi_value: &str, feed_value: &str) -> String {
        format!(
            r#"{{
                "candles": {{ "4h": {} }},
                "indicators": [ {{
                    "indicator": {{ "id": "rsi", "params": {{ "period": 14 }} }},
                    "timeframe": "4h",
                    "values": {}
                }} ],
                "feeds": {{ "liquidation_heatmap": "{feed_value}" }}
            }}"#,
            eval_candles_json(15),
            eval_rsi_values_json(15, rsi_value),
        )
    }

    #[test]
    fn a_document_whose_conditions_and_veto_both_hold_fires() {
        let verdict = evaluate_json(EVAL_DOC, &eval_ctx_json("25", "0.5")).unwrap();
        assert_eq!(verdict, r#"{"verdict":"fires"}"#);
    }

    #[test]
    fn a_document_whose_condition_does_not_hold_does_not_fire() {
        let verdict = evaluate_json(EVAL_DOC, &eval_ctx_json("55", "0.5")).unwrap();
        assert_eq!(verdict, r#"{"verdict":"does_not_fire"}"#);
    }

    #[test]
    fn a_veto_above_threshold_suppresses_an_otherwise_firing_condition() {
        let verdict = evaluate_json(EVAL_DOC, &eval_ctx_json("25", "0.95")).unwrap();
        assert_eq!(verdict, r#"{"verdict":"suppressed"}"#);
    }

    #[test]
    fn no_closed_trigger_candle_is_indeterminate_rather_than_a_fabricated_verdict() {
        let ctx = r#"{ "candles": { "4h": [] } }"#;
        let verdict = evaluate_json(EVAL_DOC, ctx).unwrap();
        assert!(
            verdict.starts_with(r#"{"verdict":"indeterminate""#),
            "got: {verdict}"
        );
        assert!(verdict.contains("no closed 4h candle"), "got: {verdict}");
    }

    #[test]
    fn malformed_ctx_json_is_refused_with_a_field_not_a_panic() {
        let err = evaluate_json(EVAL_DOC, "{not json").unwrap_err();
        assert_eq!(err.refusals[0].field, "ctx");
    }

    #[test]
    fn an_unparseable_timeframe_in_ctx_is_refused_by_field_not_a_panic() {
        let ctx = r#"{ "candles": { "not-a-timeframe": [] } }"#;
        let err = evaluate_json(EVAL_DOC, ctx).unwrap_err();
        assert!(
            err.refusals[0].field.starts_with("ctx.candles"),
            "got: {err}"
        );
    }
}
