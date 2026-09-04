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

    /// The whole point of `field`: a refusal a caller can act on points at the
    /// thing that has to change.
    #[test]
    fn every_code_produces_a_distinct_non_empty_key() {
        use RefusalCode::*;
        let all = [
            UnknownField,
            UnknownIndicator,
            UnknownIndicatorOutput,
            InvalidIndicatorParameter,
            UnknownOperator,
            InvalidDecimal,
            InvalidSymbol,
            MalformedTimeframe,
            CalendarTimeframeUnsupported,
            ConditionTimeframeFinerThanTrigger,
            TimeframeNotMultipleOfTrigger,
            ConsequenceLevelTooLow,
            FieldNotHonouredAtLevel,
            ExternalFeedTrigger,
            ExecutableTextRejected,
            UnsupportedSchemaVersion,
            MigrationNotPossible,
            EmptyConditionTree,
            ConditionTreeTooDeep,
            DuplicateConditionId,
        ];
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
