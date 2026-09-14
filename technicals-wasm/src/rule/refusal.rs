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

/// Declare every refusal code once, and derive the enum, the i18n suffix and the
/// code list from that one declaration (FEAT-0432).
///
/// The variant name is also the i18n key suffix — in camelCase, the spelling the
/// locale files already use (`dashboard.alerts.priceReached`) — so adding a
/// variant without a translation is visible at review time rather than at runtime
/// as a raw code rendered to a trader.
///
/// Before this macro the same set was written three times: the enum, the
/// `i18n_suffix` match, and a hand-maintained `ALL_CODES` list the locale test
/// iterated. A hand-maintained list cannot prove itself total, and it was paid
/// for twice — `InvalidLookback` shipped with no locale key because it was
/// missing from the list too (FEAT-0390), and three window-operand codes passed
/// the whole suite before the list or the locale files knew about them
/// (ADR-0016). A variant that is declared here exists, is in `ALL`, and has a
/// suffix; one that is not declared does not exist.
///
/// A `macro_rules!` block, not a `strum` dependency: the crate that computes
/// money is the wrong place to add a dependency for an enumeration trick
/// (FEAT-0432, out of scope: no new crate dependency).
macro_rules! refusal_codes {
    (
        $(
            $(#[$meta:meta])*
            $variant:ident => $suffix:literal
        ),+ $(,)?
    ) => {
        /// Machine-readable reason. One variant per thing the schema will not do.
        ///
        /// The variant name is also the i18n key suffix, so adding a variant without a
        /// translation is visible at review time rather than at runtime as a raw code
        /// rendered to a trader.
        #[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
        #[serde(rename_all = "snake_case")]
        pub enum RefusalCode {
            $(
                $(#[$meta])*
                $variant,
            )+
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
                    $(
                        Self::$variant => $suffix,
                    )+
                }
            }
        }

        /// Every refusal code, derived from the declaration above.
        ///
        /// The macro emits it, so it cannot drift from the enum: a variant that is
        /// declared is in this list, and one that is not declared does not exist. The
        /// locale test below iterates this list rather than a copy, so a new variant
        /// is forced through the locale check instead of being silently omitted from
        /// it — which is exactly how `InvalidLookback` reached a trader as a raw code.
        pub const ALL: &[RefusalCode] = &[
            $( RefusalCode::$variant ),+
        ];
    };
}

refusal_codes! {
    /// A key the schema does not define. Never ignored — see ADR-0012's
    /// requirement that unknown fields be rejected rather than dropped, because
    /// a silently dropped field is a rule that means something other than what
    /// its author wrote.
    UnknownField => "unknownField",
    /// An indicator identity outside the registry.
    UnknownIndicator => "unknownIndicator",
    /// A named output line the indicator does not produce (`rsi.signal` when
    /// the rule never enabled the signal line, `atr.histogram`, …).
    UnknownIndicatorOutput => "unknownIndicatorOutput",
    /// A parameter the indicator does not take, or a value outside its domain.
    InvalidIndicatorParameter => "invalidIndicatorParameter",
    /// A comparison operator the schema does not define.
    UnknownOperator => "unknownOperator",
    /// A threshold or price that is not a well-formed decimal.
    InvalidDecimal => "invalidDecimal",
    /// Empty or blank symbol.
    InvalidSymbol => "invalidSymbol",
    /// A timeframe string that does not parse.
    MalformedTimeframe => "malformedTimeframe",
    /// A calendar-month timeframe. Months have no fixed length, so "is this
    /// condition's timeframe an exact multiple of the trigger's" has no answer,
    /// and a backtest over month boundaries cannot be reconciled with a live
    /// run. Refused rather than approximated at 30 days.
    CalendarTimeframeUnsupported => "calendarTimeframeUnsupported",
    /// A condition timeframe finer than the document's trigger timeframe.
    /// Reading a 15m value only at each 1h close silently discards three closes,
    /// so the rule means something narrower than its author wrote. The honest
    /// expression is a finer trigger.
    ConditionTimeframeFinerThanTrigger => "conditionTimeframeFinerThanTrigger",
    /// A condition timeframe that is not an exact multiple of the trigger, so
    /// its closes do not line up with the evaluation anchor.
    TimeframeNotMultipleOfTrigger => "timeframeNotMultipleOfTrigger",
    /// The caller asked for a consequence the document does not authorise —
    /// asking a `notify` rule to send. ADR-0012 decision 2: a level refuses what
    /// it cannot honour rather than emulating it.
    ConsequenceLevelTooLow => "consequenceLevelTooLow",
    /// A field the declared consequence level cannot honour (an order size on a
    /// `notify` rule, an account-state condition an alert cannot read).
    FieldNotHonouredAtLevel => "fieldNotHonouredAtLevel",
    /// ADR-0012 decision 7: a third-party aggregate feed may veto or annotate a
    /// trigger, never be one. A backtest over an unversioned feed cannot be
    /// honest, so this is refused at validation rather than at execution.
    ExternalFeedTrigger => "externalFeedTrigger",
    /// ADR-0012 decision 1: nothing evaluates a rule by executing supplied text.
    /// A free-text expression field is refused wherever it appears, from a human
    /// author or a model alike.
    ExecutableTextRejected => "executableTextRejected",
    /// A schema version this build does not know. Newer than us, or withdrawn.
    UnsupportedSchemaVersion => "unsupportedSchemaVersion",
    /// A document whose meaning cannot be carried forward to the current schema
    /// version. Refusing beats guessing: ADR-0012 requires migration to preserve
    /// meaning or refuse, never to silently reinterpret.
    MigrationNotPossible => "migrationNotPossible",
    /// A condition tree with no conditions in it, or a group with no members.
    EmptyConditionTree => "emptyConditionTree",
    /// A condition tree nested past the depth the evaluator will walk. A bound
    /// exists because the evaluator is recursive and the crate builds with
    /// `panic = "abort"`, so an unbounded document is a stack overflow that
    /// takes the panel down.
    ConditionTreeTooDeep => "conditionTreeTooDeep",
    /// The same condition identifier used twice, which makes an evaluation trace
    /// ambiguous about which condition fired.
    DuplicateConditionId => "duplicateConditionId",
    /// A percentage-move operand whose reference is not a real earlier candle.
    /// A lookback of zero measures a candle against itself, which is always
    /// zero percent — a rule that can never fire rather than one that is merely
    /// wrong, so it is refused at authoring time instead of at evaluation.
    InvalidLookback => "invalidLookback",
    /// A comparison whose two sides are denominated in different things —
    /// traded volume against something that is not volume. Both numbers exist and both are
    /// well-formed, so nothing downstream would complain; the condition would
    /// simply compare size to currency and fire on the crossover of two
    /// unrelated scales. Refused at authoring time because there is no later
    /// point at which it looks wrong.
    OperandDimensionMismatch => "operandDimensionMismatch",
    /// A window over a window. A minimum of a maximum is not a sentence anyone
    /// writes on purpose, and allowing it would let `warmup_candles` compound
    /// without a bound the type expresses. Refused rather than budgeted with a
    /// depth counter, because one legitimate use has never been named.
    NestedWindow => "nestedWindow",
    /// A window whose span is shorter than two closes. A window of one candle
    /// is that candle, so `min` and `max` both return the operand itself — a
    /// condition comparing a value against itself, which is a rule that cannot
    /// discriminate rather than one that is wrong.
    InvalidWindowLookback => "invalidWindowLookback",
    /// A cumulative indicator (OBV) compared against anything but a window over
    /// itself. Its level is a running total from the first candle it is handed,
    /// and the alert path hands it a rolling buffer, so "OBV above 1,000,000"
    /// fires or stays quiet on how much history happens to be loaded. Only the
    /// indicator against its own window extreme is independent of that
    /// (FEAT-0446 group 4).
    CumulativeNeedsOwnWindow => "cumulativeNeedsOwnWindow",
    /// A document needing more closed candles than the app will ever hold.
    ///
    /// This is the refusal that keeps an over-deep rule from being *silent*
    /// instead of rejected: `ruleEvaluationGate` withholds a verdict while the
    /// series is shorter than `warmupCandles` and has no separate signal for
    /// "and it always will be", so without this code an alert whose history
    /// requirement can never be met looks exactly like one still warming up.
    /// ADR-0009 is the cost side — Bitunix pages 200 rows at a time.
    RuleWarmupTooDeep => "ruleWarmupTooDeep",
    /// A note that is present but blank, or longer than the character limit.
    ///
    /// A blank note is refused rather than normalised to absent, because a
    /// caller that sends an empty string has a bug worth surfacing. The limit
    /// exists because a note is rendered into an OS notification and into
    /// Manage, so an unbounded one is unreadable in both.
    InvalidNote => "invalidNote",
    /// The same trigger channel listed twice, which would announce one trigger
    /// twice on it.
    DuplicateTriggerMethod => "duplicateTriggerMethod",
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
    /// file. It was missing from the old hand-maintained `ALL_CODES` too, so the
    /// totality test could not see it either: a hand-maintained list cannot prove
    /// itself total. The list is now generated by `refusal_codes!`, so a variant
    /// that is declared cannot be absent from it, and from here a variant without
    /// a translation fails in both languages at once.
    #[test]
    fn every_code_has_a_string_in_every_locale() {
        let all = ALL;
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
        let all = ALL;
        let mut keys: Vec<String> = all.iter().map(|c| c.i18n_key()).collect();
        assert!(keys
            .iter()
            .all(|k| k.starts_with("rules.refusal.") && k.len() > 14));
        keys.sort();
        let before = keys.len();
        keys.dedup();
        assert_eq!(keys.len(), before, "two refusal codes share an i18n key");
    }

    /// The wire spelling every refusal had before FEAT-0432, pinned so the
    /// mechanism change is provably inert for documents already stored: serde
    /// still derives `snake_case` from the variant name, and this asserts that
    /// derivation still produces exactly these strings.
    ///
    /// Checked against the generated `ALL` in both directions, so a new variant
    /// forces a golden entry instead of silently gaining a wire name — the
    /// totality the old `ALL_CODES` copy never had.
    const WIRE_NAMES: &[&str] = &[
        "unknown_field",
        "unknown_indicator",
        "unknown_indicator_output",
        "invalid_indicator_parameter",
        "unknown_operator",
        "invalid_decimal",
        "invalid_symbol",
        "malformed_timeframe",
        "calendar_timeframe_unsupported",
        "condition_timeframe_finer_than_trigger",
        "timeframe_not_multiple_of_trigger",
        "consequence_level_too_low",
        "field_not_honoured_at_level",
        "external_feed_trigger",
        "executable_text_rejected",
        "unsupported_schema_version",
        "migration_not_possible",
        "empty_condition_tree",
        "condition_tree_too_deep",
        "duplicate_condition_id",
        "invalid_lookback",
        "operand_dimension_mismatch",
        "nested_window",
        "invalid_window_lookback",
        "cumulative_needs_own_window",
        "rule_warmup_too_deep",
        "invalid_note",
        "duplicate_trigger_method",
    ];

    #[test]
    fn every_code_keeps_its_historical_wire_spelling() {
        let mut actual: Vec<String> = ALL
            .iter()
            .map(|c| {
                serde_json::to_value(c)
                    .expect("a refusal code must serialise")
                    .as_str()
                    .expect("a refusal code serialises to a JSON string")
                    .to_string()
            })
            .collect();
        actual.sort();

        let mut expected: Vec<String> = WIRE_NAMES.iter().map(|s| s.to_string()).collect();
        expected.sort();

        assert_eq!(
            actual, expected,
            "a refusal code's serialised wire name changed, which moves stored hashes"
        );
    }
}
