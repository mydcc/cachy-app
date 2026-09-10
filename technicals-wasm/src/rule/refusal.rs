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

//! How this schema says no.
//!
//! ADR-0008 settled the shape of a refusal for exchange verbs: it names the
//! capability, it carries an i18n key rather than a bare code, and it is raised
//! before the request is built. A rule document is refused the same way, for the
//! same reason — a trader who is told "invalid rule" learns nothing, and a
//! refusal nobody can act on is a refusal that gets worked around.
//!
//! Every refusal names a `field`. That is not decoration: FEAT-0303 requires
//! that a rule declaring consequence level `notify` be refused *by name* when a
//! caller asks it to send, so the caller can point at the offending field rather
//! than reject the document wholesale.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Machine-readable reason. One variant per thing the schema will not do.
///
/// The variant name is also the i18n key suffix, so adding a variant without a
/// translation is visible at review time rather than at runtime as a raw code
/// rendered to a trader.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RefusalCode {
    /// A key the schema does not define. Never ignored — see ADR-0012's
    /// requirement that unknown fields be rejected rather than dropped, because
    /// a silently dropped field is a rule that means something other than what
    /// its author wrote.
    UnknownField,
    /// An indicator identity outside the registry.
    UnknownIndicator,
    /// A named output line the indicator does not produce (`rsi.signal` when
    /// the rule never enabled the signal line, `atr.histogram`, …).
    UnknownIndicatorOutput,
    /// A parameter the indicator does not take, or a value outside its domain.
    InvalidIndicatorParameter,
    /// A comparison operator the schema does not define.
    UnknownOperator,
    /// A threshold or price that is not a well-formed decimal.
    InvalidDecimal,
    /// Empty or blank symbol.
    InvalidSymbol,
    /// A timeframe string that does not parse.
    MalformedTimeframe,
    /// A calendar-month timeframe. Months have no fixed length, so "is this
    /// condition's timeframe an exact multiple of the trigger's" has no answer,
    /// and a backtest over month boundaries cannot be reconciled with a live
    /// run. Refused rather than approximated at 30 days.
    CalendarTimeframeUnsupported,
    /// A condition timeframe finer than the document's trigger timeframe.
    /// Reading a 15m value only at each 1h close silently discards three closes,
    /// so the rule means something narrower than its author wrote. The honest
    /// expression is a finer trigger.
    ConditionTimeframeFinerThanTrigger,
    /// A condition timeframe that is not an exact multiple of the trigger, so
    /// its closes do not line up with the evaluation anchor.
    TimeframeNotMultipleOfTrigger,
    /// The caller asked for a consequence the document does not authorise —
    /// asking a `notify` rule to send. ADR-0012 decision 2: a level refuses what
    /// it cannot honour rather than emulating it.
    ConsequenceLevelTooLow,
    /// A field the declared consequence level cannot honour (an order size on a
    /// `notify` rule, an account-state condition an alert cannot read).
    FieldNotHonouredAtLevel,
    /// ADR-0012 decision 7: a third-party aggregate feed may veto or annotate a
    /// trigger, never be one. A backtest over an unversioned feed cannot be
    /// honest, so this is refused at validation rather than at execution.
    ExternalFeedTrigger,
    /// ADR-0012 decision 1: nothing evaluates a rule by executing supplied text.
    /// A free-text expression field is refused wherever it appears, from a human
    /// author or a model alike.
    ExecutableTextRejected,
    /// A schema version this build does not know. Newer than us, or withdrawn.
    UnsupportedSchemaVersion,
    /// A document whose meaning cannot be carried forward to the current schema
    /// version. Refusing beats guessing: ADR-0012 requires migration to preserve
    /// meaning or refuse, never to silently reinterpret.
    MigrationNotPossible,
    /// A condition tree with no conditions in it, or a group with no members.
    EmptyConditionTree,
    /// A condition tree nested past the depth the evaluator will walk. A bound
    /// exists because the evaluator is recursive and the crate builds with
    /// `panic = "abort"`, so an unbounded document is a stack overflow that
    /// takes the panel down.
    ConditionTreeTooDeep,
    /// The same condition identifier used twice, which makes an evaluation trace
    /// ambiguous about which condition fired.
    DuplicateConditionId,
    /// A percentage-move operand whose reference is not a real earlier candle.
    /// A lookback of zero measures a candle against itself, which is always
    /// zero percent — a rule that can never fire rather than one that is merely
    /// wrong, so it is refused at authoring time instead of at evaluation.
    InvalidLookback,
    /// A comparison whose two sides are denominated in different things —
    /// traded volume against something that is not volume. Both numbers exist and both are
    /// well-formed, so nothing downstream would complain; the condition would
    /// simply compare size to currency and fire on the crossover of two
    /// unrelated scales. Refused at authoring time because there is no later
    /// point at which it looks wrong.
    OperandDimensionMismatch,
    /// A window over a window. A minimum of a maximum is not a sentence anyone
    /// writes on purpose, and allowing it would let `warmup_candles` compound
    /// without a bound the type expresses. Refused rather than budgeted with a
    /// depth counter, because one legitimate use has never been named.
    NestedWindow,
    /// A window whose span is shorter than two closes. A window of one candle
    /// is that candle, so `min` and `max` both return the operand itself — a
    /// condition comparing a value against itself, which is a rule that cannot
    /// discriminate rather than one that is wrong.
    InvalidWindowLookback,
    /// A document needing more closed candles than the app will ever hold.
    ///
    /// This is the refusal that keeps an over-deep rule from being *silent*
    /// instead of rejected: `ruleEvaluationGate` withholds a verdict while the
    /// series is shorter than `warmupCandles` and has no separate signal for
    /// "and it always will be", so without this code an alert whose history
    /// requirement can never be met looks exactly like one still warming up.
    /// ADR-0009 is the cost side — Bitunix pages 200 rows at a time.
    RuleWarmupTooDeep,
}

impl RefusalCode {
    /// The i18n key a UI renders. Mirrors `getDisplayMessage`'s handling of
    /// `ExchangeUnsupportedError`: the caller never assembles English itself.
    pub fn i18n_key(self) -> String {
        format!("rules.refusal.{}", self.i18n_suffix())
    }

    /// The key suffix, in the camelCase the locale files already use
    /// (`dashboard.alerts.priceReached`). Deliberately *not* the serde wire
    /// spelling, which is snake_case to match the rest of this crate — the two
    /// conventions are different on purpose, and `every_code_...` below asserts
    /// this half stays total and collision-free.
    pub fn i18n_suffix(self) -> &'static str {
        match self {
            Self::UnknownField => "unknownField",
            Self::UnknownIndicator => "unknownIndicator",
            Self::UnknownIndicatorOutput => "unknownIndicatorOutput",
            Self::InvalidIndicatorParameter => "invalidIndicatorParameter",
            Self::UnknownOperator => "unknownOperator",
            Self::InvalidDecimal => "invalidDecimal",
            Self::InvalidSymbol => "invalidSymbol",
            Self::MalformedTimeframe => "malformedTimeframe",
            Self::CalendarTimeframeUnsupported => "calendarTimeframeUnsupported",
            Self::ConditionTimeframeFinerThanTrigger => "conditionTimeframeFinerThanTrigger",
            Self::TimeframeNotMultipleOfTrigger => "timeframeNotMultipleOfTrigger",
            Self::ConsequenceLevelTooLow => "consequenceLevelTooLow",
            Self::FieldNotHonouredAtLevel => "fieldNotHonouredAtLevel",
            Self::ExternalFeedTrigger => "externalFeedTrigger",
            Self::ExecutableTextRejected => "executableTextRejected",
            Self::UnsupportedSchemaVersion => "unsupportedSchemaVersion",
            Self::MigrationNotPossible => "migrationNotPossible",
            Self::EmptyConditionTree => "emptyConditionTree",
            Self::ConditionTreeTooDeep => "conditionTreeTooDeep",
            Self::DuplicateConditionId => "duplicateConditionId",
            Self::InvalidLookback => "invalidLookback",
            Self::OperandDimensionMismatch => "operandDimensionMismatch",
            Self::NestedWindow => "nestedWindow",
            Self::InvalidWindowLookback => "invalidWindowLookback",
            Self::RuleWarmupTooDeep => "ruleWarmupTooDeep",
        }
    }
}

/// One reason a document was refused, naming the field responsible.
///
/// `detail` is developer-facing English for logs and tests. It is deliberately
/// *not* the string a trader sees — that is rendered from `i18n_key` — because a
/// message assembled in Rust cannot be translated, and FEAT-0027 already
/// established that every trader-facing alert string exists in both German and
/// English.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct RuleRefusal {
    pub code: RefusalCode,
    /// Dotted path to the offending field, e.g. `conditions[1].indicator.period`
    /// or `action.consequence_level`. Never empty.
    pub field: String,
    /// The i18n key, materialised so a JS caller does not have to know the
    /// `rules.refusal.` prefix.
    pub i18n_key: String,
    pub detail: String,
}

impl RuleRefusal {
    pub fn new(code: RefusalCode, field: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            code,
            field: field.into(),
            i18n_key: code.i18n_key(),
            detail: detail.into(),
        }
    }
}

impl fmt::Display for RuleRefusal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{} at `{}`: {}",
            self.code.i18n_suffix(),
            self.field,
            self.detail
        )
    }
}

impl std::error::Error for RuleRefusal {}

/// The result of validating a document: either the accepted value, or *every*
/// reason it was refused.
///
/// All reasons, not the first. A trader fixing a rule one refusal per attempt is
/// the failure mode this avoids, and a model repairing its own proposal
/// (FEAT-0304) needs the whole list to converge in one pass.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Refused {
    pub refusals: Vec<RuleRefusal>,
}

impl Refused {
    pub fn one(code: RefusalCode, field: impl Into<String>, detail: impl Into<String>) -> Self {
        Self {
            refusals: vec![RuleRefusal::new(code, field, detail)],
        }
    }

    pub fn is_empty(&self) -> bool {
        self.refusals.is_empty()
    }

    /// True when any refusal carries `code`. Used by tests and by callers that
    /// branch on a specific reason rather than rendering the list.
    pub fn has(&self, code: RefusalCode) -> bool {
        self.refusals.iter().any(|r| r.code == code)
    }
}

impl fmt::Display for Refused {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let joined: Vec<String> = self.refusals.iter().map(|r| r.to_string()).collect();
        write!(f, "{}", joined.join("; "))
    }
}

impl std::error::Error for Refused {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refusal_carries_an_i18n_key_derived_from_its_code() {
        let r = RuleRefusal::new(
            RefusalCode::ConsequenceLevelTooLow,
            "action.consequence_level",
            "rule authorises notify, caller asked for send",
        );
        assert_eq!(r.i18n_key, "rules.refusal.consequenceLevelTooLow");
        assert_eq!(r.field, "action.consequence_level");
    }

    /// Every refusal code, in one place, so the two tests below cannot drift
    /// apart — which is how `InvalidLookback` came to be absent from both.
    ///
    /// Still hand-maintained: Rust has no built-in way to enumerate a plain
    /// enum, and a `strum` dependency in the crate that computes money is a
    /// decision worth making deliberately rather than in passing. What this
    /// does buy is that a variant added here is checked for a distinct key
    /// *and* for a translation in every language, instead of only the first.
    const ALL_CODES: &[RefusalCode] = &[
        RefusalCode::UnknownField,
        RefusalCode::UnknownIndicator,
        RefusalCode::UnknownIndicatorOutput,
        RefusalCode::InvalidIndicatorParameter,
        RefusalCode::UnknownOperator,
        RefusalCode::InvalidDecimal,
        RefusalCode::InvalidSymbol,
        RefusalCode::MalformedTimeframe,
        RefusalCode::CalendarTimeframeUnsupported,
        RefusalCode::ConditionTimeframeFinerThanTrigger,
        RefusalCode::TimeframeNotMultipleOfTrigger,
        RefusalCode::ConsequenceLevelTooLow,
        RefusalCode::FieldNotHonouredAtLevel,
        RefusalCode::ExternalFeedTrigger,
        RefusalCode::ExecutableTextRejected,
        RefusalCode::UnsupportedSchemaVersion,
        RefusalCode::MigrationNotPossible,
        RefusalCode::EmptyConditionTree,
        RefusalCode::ConditionTreeTooDeep,
        RefusalCode::DuplicateConditionId,
        RefusalCode::InvalidLookback,
        RefusalCode::OperandDimensionMismatch,
        RefusalCode::NestedWindow,
        RefusalCode::InvalidWindowLookback,
        RefusalCode::RuleWarmupTooDeep,
    ];

    /// Every locale file a refusal can be rendered through.
    ///
    /// `include_str!` rather than a runtime read: a test that silently passes
    /// because it could not find the file is worse than no test.
    const LOCALES: &[(&str, &str)] = &[
        ("en", include_str!("../../../src/locales/locales/en.json")),
        ("de", include_str!("../../../src/locales/locales/de.json")),
    ];

    /// The claim the enum's own doc comment makes — that a variant without a
    /// translation is caught at review time rather than rendered to a trader as
    /// a raw code — and which nothing actually enforced.
    ///
    /// `invalidLookback` shipped with FEAT-0390 and had no key in either locale
    /// file. It was missing from `ALL_CODES` too, so the totality test above
    /// could not see it either: a hand-maintained list cannot prove itself
    /// total. Extending that list stays a manual step, but from here a variant
    /// that reaches it without a translation fails in both languages at once.
    #[test]
    fn every_code_has_a_string_in_every_locale() {
        let all = ALL_CODES;
        for (lang, raw) in LOCALES {
            let doc: serde_json::Value = serde_json::from_str(raw)
                .unwrap_or_else(|e| panic!("{lang}.json is not valid JSON: {e}"));
            let refusal = doc
                .get("rules")
                .and_then(|r| r.get("refusal"))
                .unwrap_or_else(|| panic!("{lang}.json has no rules.refusal block"));
            let missing: Vec<&str> = all
                .iter()
                .map(|c| c.i18n_suffix())
                .filter(|suffix| refusal.get(suffix).is_none())
                .collect();
            assert!(
                missing.is_empty(),
                "{lang}.json is missing rules.refusal keys: {missing:?}"
            );
            let blank: Vec<&str> = all
                .iter()
                .map(|c| c.i18n_suffix())
                .filter(|suffix| {
                    refusal
                        .get(suffix)
                        .and_then(|v| v.as_str())
                        .is_none_or(str::is_empty)
                })
                .collect();
            assert!(
                blank.is_empty(),
                "{lang}.json has empty rules.refusal strings: {blank:?}"
            );
        }
    }

    /// The whole point of `field`: a refusal a caller can act on points at the
    /// thing that has to change.
    #[test]
    fn every_code_produces_a_distinct_non_empty_key() {
        let all = ALL_CODES;
        let mut keys: Vec<String> = all.iter().map(|c| c.i18n_key()).collect();
        assert!(keys
            .iter()
            .all(|k| k.starts_with("rules.refusal.") && k.len() > 14));
        keys.sort();
        let before = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), before, "two refusal codes share an i18n key");
    }
}
