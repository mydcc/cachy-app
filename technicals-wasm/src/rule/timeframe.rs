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

//! Timeframes, and the arithmetic that makes a multi-timeframe rule honest.
//!
//! ADR-0012 decision 3 fixes the evaluation point at candle close. A document
//! that names more than one timeframe therefore has to say *which* close decides,
//! or "the closed candle" stops meaning anything. FEAT-0303 answers that with a
//! single declared trigger timeframe per document: the rule is evaluated once
//! per trigger close, and every condition reads the last candle of its own
//! timeframe that had already closed at that instant.
//!
//! Two constraints make that well-defined, and both are enforced here:
//!
//! 1. **A condition timeframe is never finer than the trigger.** A 15m condition
//!    read only at each 1h close silently throws away three closes, so the rule
//!    would mean something narrower than its author wrote. The honest expression
//!    is a finer trigger, so the finer condition is refused and says so.
//! 2. **A condition timeframe is an exact multiple of the trigger.** Otherwise
//!    the coarser candle's boundaries drift across trigger closes and "the last
//!    already-closed candle" moves for reasons the author never wrote down.
//!
//! Together these are the property that stops lookahead bias creeping into a
//! backtest — the same one TradingView spells `lookahead_off`.

use serde::{Deserialize, Serialize};

use super::refusal::{RefusalCode, RuleRefusal};

const SECONDS_PER_MINUTE: u64 = 60;
const SECONDS_PER_HOUR: u64 = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY: u64 = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_WEEK: u64 = 7 * SECONDS_PER_DAY;

/// One week. Longer than this and a rule is describing a regime, not a trade,
/// and the candle history needed to evaluate it does not exist on most venues.
const MAX_TIMEFRAME_SECONDS: u64 = SECONDS_PER_WEEK;

/// A candle interval of fixed length.
///
/// Stored as seconds rather than as an authored string so that two spellings of
/// one interval cannot become two identities. `7d` and `1w` are the same
/// timeframe; if the document kept the spelling, they would hash differently and
/// FEAT-0303's "same rule, same hash" criterion would be false. Parsing
/// normalises, and the normalised form is what the document holds, serialises,
/// and hashes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct Timeframe {
    seconds: u64,
}

impl Timeframe {
    /// Parse `<positive integer><unit>` where unit is `m`, `h`, `d` or `w`.
    ///
    /// `M` (calendar month) is refused rather than approximated. A month has no
    /// fixed length, so "is this an exact multiple of the trigger" has no
    /// answer, and a backtest whose month boundaries were 30 days while the
    /// venue's were calendar months is not describing the same rule that ran.
    /// The app charts `1M` happily — displaying it and *deciding* on it are
    /// different claims, which is the distinction ADR-0012 draws for intrabar
    /// values too.
    pub fn parse(raw: &str) -> Result<Self, RuleRefusal> {
        Self::parse_at(raw, "timeframe")
    }

    /// As [`Timeframe::parse`], but naming the field in any refusal so the
    /// caller can point at the offending place in the document.
    pub fn parse_at(raw: &str, field: &str) -> Result<Self, RuleRefusal> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                "timeframe is empty",
            ));
        }

        // Split the trailing unit off. Byte indexing is safe only because the
        // unit is checked to be ASCII first; a multi-byte final character would
        // otherwise slice mid-codepoint and panic, and this crate aborts on
        // panic.
        let unit = trimmed.chars().last().expect("non-empty checked above");
        if !unit.is_ascii() {
            return Err(RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                format!("`{trimmed}` does not end in a unit of m, h, d or w"),
            ));
        }
        let digits = &trimmed[..trimmed.len() - 1];

        if unit == 'M' {
            return Err(RuleRefusal::new(
                RefusalCode::CalendarTimeframeUnsupported,
                field,
                "calendar months have no fixed length, so a rule cannot be \
                 anchored to one; use 1w or shorter",
            ));
        }

        let unit_seconds = match unit {
            'm' => SECONDS_PER_MINUTE,
            'h' => SECONDS_PER_HOUR,
            'd' => SECONDS_PER_DAY,
            'w' => SECONDS_PER_WEEK,
            _ => {
                return Err(RuleRefusal::new(
                    RefusalCode::MalformedTimeframe,
                    field,
                    format!("`{unit}` is not a timeframe unit; expected m, h, d or w"),
                ))
            }
        };

        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return Err(RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                format!("`{trimmed}` is not <positive integer><unit>"),
            ));
        }

        let count: u64 = digits.parse().map_err(|_| {
            RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                format!("`{digits}` is not a count this schema can hold"),
            )
        })?;

        if count == 0 {
            return Err(RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                "a timeframe of zero has no close to evaluate on",
            ));
        }

        let seconds = count.checked_mul(unit_seconds).ok_or_else(|| {
            RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                format!("`{trimmed}` overflows"),
            )
        })?;

        if seconds > MAX_TIMEFRAME_SECONDS {
            return Err(RuleRefusal::new(
                RefusalCode::MalformedTimeframe,
                field,
                format!("`{trimmed}` is longer than the 1w maximum"),
            ));
        }

        Ok(Self { seconds })
    }

    pub fn seconds(self) -> u64 {
        self.seconds
    }

    pub fn milliseconds(self) -> i64 {
        // Bounded by MAX_TIMEFRAME_SECONDS, so this cannot overflow i64.
        (self.seconds * 1000) as i64
    }

    /// The single spelling of this interval: the coarsest unit that divides it
    /// exactly. 604800s is `1w`, never `7d`; 14400s is `4h`, never `240m`.
    //
    // `% x == 0` rather than `is_multiple_of`, which clippy prefers: that method
    // stabilised in Rust 1.87, and `scripts/build_wasm.sh` is written to tolerate
    // whatever toolchain a contributor happens to have (falling back to the
    // committed binary). A style lint is not worth raising the floor.
    #[allow(clippy::manual_is_multiple_of)]
    pub fn canonical(self) -> String {
        for (unit_seconds, suffix) in [
            (SECONDS_PER_WEEK, 'w'),
            (SECONDS_PER_DAY, 'd'),
            (SECONDS_PER_HOUR, 'h'),
            (SECONDS_PER_MINUTE, 'm'),
        ] {
            if self.seconds % unit_seconds == 0 {
                return format!("{}{}", self.seconds / unit_seconds, suffix);
            }
        }
        // Unreachable: parsing only admits whole multiples of a minute, and the
        // struct field is private so no other construction path exists. Falling
        // back to minutes rather than panicking keeps `panic = "abort"` honest.
        format!("{}m", self.seconds / SECONDS_PER_MINUTE)
    }

    /// Whether a condition on `self` can be read at each close of `trigger`.
    ///
    /// Returns the refusal rather than a bool so the caller does not have to
    /// re-derive which of the two rules was broken.
    #[allow(clippy::manual_is_multiple_of)] // see `canonical`
    pub fn check_against_trigger(self, trigger: Timeframe, field: &str) -> Result<(), RuleRefusal> {
        if self.seconds < trigger.seconds {
            return Err(RuleRefusal::new(
                RefusalCode::ConditionTimeframeFinerThanTrigger,
                field,
                format!(
                    "condition timeframe {} is finer than the trigger {}; reading it \
                     only at each trigger close would discard closes the rule appears \
                     to consider. Lower the trigger timeframe instead.",
                    self.canonical(),
                    trigger.canonical()
                ),
            ));
        }
        if self.seconds % trigger.seconds != 0 {
            return Err(RuleRefusal::new(
                RefusalCode::TimeframeNotMultipleOfTrigger,
                field,
                format!(
                    "condition timeframe {} is not an exact multiple of the trigger {}, \
                     so its closes drift across trigger closes",
                    self.canonical(),
                    trigger.canonical()
                ),
            ));
        }
        Ok(())
    }

    /// Open timestamp (ms) of the candle containing `timestamp_ms`.
    ///
    /// Epoch-anchored, which is what every venue this app talks to uses for
    /// intraday buckets. Weekly buckets anchored this way start on a Thursday
    /// (the Unix epoch was one) — that is a real limitation, recorded here
    /// rather than silently wrong: a weekly rule is evaluated on the venue's
    /// candle stream, and `evaluate` never derives a weekly bucket itself.
    pub fn bucket_start_ms(self, timestamp_ms: i64) -> i64 {
        let step = self.milliseconds();
        timestamp_ms - timestamp_ms.rem_euclid(step)
    }
}

impl TryFrom<String> for Timeframe {
    type Error = RuleRefusal;
    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(&value)
    }
}

impl From<Timeframe> for String {
    fn from(value: Timeframe) -> Self {
        value.canonical()
    }
}

impl std::fmt::Display for Timeframe {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.canonical())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_every_timeframe_the_app_charts() {
        for raw in [
            "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "12h", "1d", "3d", "1w",
        ] {
            let tf = Timeframe::parse(raw).unwrap_or_else(|e| panic!("{raw}: {e}"));
            assert_eq!(tf.canonical(), raw, "{raw} did not round-trip");
        }
    }

    /// The normalisation that keeps one interval to one identity — and so one
    /// hash. Without it `7d` and `1w` would be two different rules.
    #[test]
    fn normalises_equivalent_spellings_to_one_canonical_form() {
        assert_eq!(Timeframe::parse("7d").unwrap().canonical(), "1w");
        assert_eq!(Timeframe::parse("60m").unwrap().canonical(), "1h");
        assert_eq!(Timeframe::parse("240m").unwrap().canonical(), "4h");
        assert_eq!(Timeframe::parse("24h").unwrap().canonical(), "1d");
        assert_eq!(
            Timeframe::parse("7d").unwrap(),
            Timeframe::parse("1w").unwrap()
        );
    }

    #[test]
    fn refuses_calendar_months_by_name() {
        let err = Timeframe::parse("1M").unwrap_err();
        assert_eq!(err.code, RefusalCode::CalendarTimeframeUnsupported);
        assert!(err.detail.contains("fixed length"));
    }

    #[test]
    fn refuses_malformed_input_without_panicking() {
        for raw in [
            "", "  ", "h", "1", "0m", "-5m", "1x", "1.5h", "abc", "999w", "m1",
        ] {
            let err =
                Timeframe::parse(raw).unwrap_err_or_else_msg(&format!("`{raw}` should not parse"));
            assert!(matches!(
                err.code,
                RefusalCode::MalformedTimeframe | RefusalCode::CalendarTimeframeUnsupported
            ));
        }
    }

    /// A multi-byte final character used to slice mid-codepoint. The crate
    /// aborts on panic, so this is a crash of the whole panel, not an error.
    #[test]
    fn refuses_multibyte_input_without_slicing_mid_codepoint() {
        for raw in ["1€", "5м", "1日", "🕐"] {
            assert_eq!(
                Timeframe::parse(raw).unwrap_err().code,
                RefusalCode::MalformedTimeframe
            );
        }
    }

    #[test]
    fn accepts_a_coarser_condition_that_is_an_exact_multiple_of_the_trigger() {
        let trigger = Timeframe::parse("1h").unwrap();
        for raw in ["1h", "2h", "4h", "12h", "1d"] {
            Timeframe::parse(raw)
                .unwrap()
                .check_against_trigger(trigger, "conditions[0].timeframe")
                .unwrap_or_else(|e| panic!("{raw} against 1h: {e}"));
        }
    }

    #[test]
    fn refuses_a_condition_finer_than_the_trigger_and_names_the_field() {
        let trigger = Timeframe::parse("1h").unwrap();
        let err = Timeframe::parse("15m")
            .unwrap()
            .check_against_trigger(trigger, "conditions[0].timeframe")
            .unwrap_err();
        assert_eq!(err.code, RefusalCode::ConditionTimeframeFinerThanTrigger);
        assert_eq!(err.field, "conditions[0].timeframe");
    }

    #[test]
    fn refuses_a_coarser_condition_that_does_not_divide_the_trigger() {
        // 3d against 2h: coarser, but 259200 % 7200 == 0 — that one is fine.
        // 1w against 3d is the real drift case: 604800 % 259200 != 0.
        let trigger = Timeframe::parse("3d").unwrap();
        let err = Timeframe::parse("1w")
            .unwrap()
            .check_against_trigger(trigger, "conditions[2].timeframe")
            .unwrap_err();
        assert_eq!(err.code, RefusalCode::TimeframeNotMultipleOfTrigger);
    }

    #[test]
    fn serde_round_trips_through_the_canonical_string() {
        let tf = Timeframe::parse("4h").unwrap();
        let json = serde_json::to_string(&tf).unwrap();
        assert_eq!(json, "\"4h\"");
        assert_eq!(serde_json::from_str::<Timeframe>(&json).unwrap(), tf);
        // And the non-canonical spelling deserialises to the same value.
        assert_eq!(serde_json::from_str::<Timeframe>("\"240m\"").unwrap(), tf);
    }

    #[test]
    fn buckets_align_to_the_epoch() {
        let h1 = Timeframe::parse("1h").unwrap();
        assert_eq!(h1.bucket_start_ms(3_600_000), 3_600_000);
        assert_eq!(h1.bucket_start_ms(3_600_001), 3_600_000);
        assert_eq!(h1.bucket_start_ms(7_199_999), 3_600_000);
        // Pre-epoch timestamps floor downwards rather than towards zero.
        assert_eq!(h1.bucket_start_ms(-1), -3_600_000);
    }

    /// Small helper so the malformed-input test reads as one assertion per case.
    trait UnwrapErrOrElseMsg<T> {
        fn unwrap_err_or_else_msg(self, msg: &str) -> RuleRefusal;
    }
    impl UnwrapErrOrElseMsg<Timeframe> for Result<Timeframe, RuleRefusal> {
        fn unwrap_err_or_else_msg(self, msg: &str) -> RuleRefusal {
            match self {
                Ok(tf) => panic!("{msg} (parsed as {})", tf.canonical()),
                Err(e) => e,
            }
        }
    }
}
