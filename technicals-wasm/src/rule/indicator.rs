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

//! The registry of indicator identities a condition may name, and the
//! validation of their parameters.
//!
//! FEAT-0303 requires that "indicator identity and parameters are named
//! explicitly (`rsi`, period 14) — never a free-text expression", and that
//! validation "rejects unknown indicator identities, unknown operators, and
//! unknown fields rather than ignoring them". This module is the closed set that
//! makes both statements enforceable.
//!
//! **Why there is no `source` parameter in version 1.** The TypeScript
//! `IndicatorSettings` interface declares a price source (`close`, `hl2`,
//! `hlc3`, …) on rsi, macd, cci, momentum, ema and bollinger — but the WASM core
//! has no such field and computes every one of them on the close;
//! `technicalsCalculator.ts` passes `closesNum` to the Bollinger path
//! unconditionally. A schema field the evaluator does not honour is a document
//! that claims one thing while the engine does another, which is the exact gap
//! ADR-0012 exists to close. A rule that wants the high compares against a
//! `price` operand, which the evaluator genuinely holds.

use std::collections::BTreeMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::refusal::{RefusalCode, RuleRefusal};

/// The domain of a parameter, and so what "invalid" means for it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParamKind {
    /// A whole number of candles. `min` is inclusive; a period of 1 or 0 makes
    /// most indicators degenerate rather than merely useless, and the WASM core
    /// already drops HMA and Choppiness below 2.
    Period { min: u32, max: u32 },
    /// A positive multiplier — Bollinger's standard deviations, SuperTrend's
    /// factor, Parabolic SAR's acceleration. Carried as `Decimal`, never `f64`:
    /// these values reach a comparison against a price.
    Factor {
        min: &'static str,
        max: &'static str,
    },
}

/// One parameter a given indicator accepts.
#[derive(Clone, Copy, Debug)]
pub struct ParamSpec {
    pub name: &'static str,
    pub kind: ParamKind,
}

/// One indicator identity, its parameters and its named output lines.
#[derive(Clone, Copy, Debug)]
pub struct IndicatorSpec {
    pub id: &'static str,
    pub params: &'static [ParamSpec],
    /// The output lines a condition may reference. Multi-line indicators name
    /// each line; single-line indicators expose exactly `value`, so that every
    /// reference has the same shape and `output` is never optional-by-omission.
    pub outputs: &'static [&'static str],
}

const PERIOD: ParamKind = ParamKind::Period { min: 2, max: 5000 };
const SHORT_PERIOD: ParamKind = ParamKind::Period { min: 1, max: 5000 };
const VALUE: &[&str] = &["value"];

/// Every indicator a rule may name in version 1.
///
/// Deliberately narrower than what the app charts. Two families are left out and
/// will be refused by name rather than silently accepted:
///
/// - **VWAP** is anchored to a session, so its value depends on a boundary that
///   is not derivable from the candle window alone. A backtest and a live run
///   would disagree about where the session started, which is the divergence
///   ADR-0012 decision 3 exists to prevent.
/// - **Volume profile** produces a distribution rather than a series, so
///   "its value at the closed candle" is not a number a comparison can use.
///
/// Both are chart features, not rule features, and saying so out loud costs less
/// than a rule that backtests differently from how it runs.
pub const REGISTRY: &[IndicatorSpec] = &[
    IndicatorSpec {
        id: "rsi",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "stoch_rsi",
        params: &[
            ParamSpec {
                name: "rsi_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "stoch_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "k_period",
                kind: SHORT_PERIOD,
            },
            ParamSpec {
                name: "d_period",
                kind: SHORT_PERIOD,
            },
        ],
        outputs: &["k", "d"],
    },
    IndicatorSpec {
        id: "macd",
        params: &[
            ParamSpec {
                name: "fast_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "slow_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "signal_period",
                kind: PERIOD,
            },
        ],
        outputs: &["macd", "signal", "histogram"],
    },
    IndicatorSpec {
        id: "stochastic",
        params: &[
            ParamSpec {
                name: "k_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "k_smoothing",
                kind: SHORT_PERIOD,
            },
            ParamSpec {
                name: "d_period",
                kind: SHORT_PERIOD,
            },
        ],
        outputs: &["k", "d"],
    },
    IndicatorSpec {
        id: "williams_r",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "cci",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "adx",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: &["adx", "plus_di", "minus_di"],
    },
    IndicatorSpec {
        id: "ao",
        params: &[
            ParamSpec {
                name: "fast_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "slow_period",
                kind: PERIOD,
            },
        ],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "momentum",
        params: &[ParamSpec {
            name: "period",
            kind: SHORT_PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "ema",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "sma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "wma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "vwma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "hma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "bollinger",
        params: &[
            ParamSpec {
                name: "period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "std_dev",
                kind: ParamKind::Factor {
                    min: "0.1",
                    max: "10",
                },
            },
        ],
        outputs: &["upper", "middle", "lower", "percent_b"],
    },
    IndicatorSpec {
        id: "atr",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "choppiness",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "super_trend",
        params: &[
            ParamSpec {
                name: "period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "factor",
                kind: ParamKind::Factor {
                    min: "0.1",
                    max: "50",
                },
            },
        ],
        outputs: &["value", "upper", "lower"],
    },
    IndicatorSpec {
        id: "mfi",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "obv",
        params: &[],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "volume_ma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "parabolic_sar",
        params: &[
            ParamSpec {
                name: "start",
                kind: ParamKind::Factor {
                    min: "0.001",
                    max: "1",
                },
            },
            ParamSpec {
                name: "increment",
                kind: ParamKind::Factor {
                    min: "0.001",
                    max: "1",
                },
            },
            ParamSpec {
                name: "max",
                kind: ParamKind::Factor {
                    min: "0.001",
                    max: "1",
                },
            },
        ],
        outputs: VALUE,
    },
    IndicatorSpec {
        id: "ichimoku",
        params: &[
            ParamSpec {
                name: "conversion_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "base_period",
                kind: PERIOD,
            },
            ParamSpec {
                name: "span_b_period",
                kind: PERIOD,
            },
        ],
        outputs: &["conversion", "base", "span_a", "span_b"],
    },
];

pub fn spec_for(id: &str) -> Option<&'static IndicatorSpec> {
    REGISTRY.iter().find(|s| s.id == id)
}

/// A parameter value: a whole count, or a decimal multiplier.
///
/// There is no string variant, and that is a security property rather than a
/// simplification — ADR-0012 forbids evaluating a rule by executing supplied
/// text, and the cheapest way to guarantee that is to leave nowhere for text to
/// sit. `untagged` makes the two unambiguous on the wire: a JSON number is a
/// count, a JSON string is a decimal (this crate's `rust_decimal` carries
/// decimals as strings so no precision is lost crossing the boundary).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[serde(untagged)]
pub enum ParamValue {
    Count(u32),
    Ratio(Decimal),
}

/// A named indicator with its parameters and the output line being read.
///
/// `deny_unknown_fields` is the enforcement point for "unknown fields are
/// rejected rather than ignored": a typo'd key is a refusal, not a silently
/// defaulted rule.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct IndicatorRef {
    pub id: String,
    /// `BTreeMap`, not `HashMap`: iteration order is the serialisation order, and
    /// the serialisation is what gets hashed. A `HashMap` would give the same
    /// rule a different hash per process.
    #[serde(default)]
    pub params: BTreeMap<String, ParamValue>,
    /// Which line of a multi-line indicator to read. Always present after
    /// validation; `default_output` fills it for the single-line case so a
    /// document never has to spell `"output": "value"` to mean the obvious thing.
    #[serde(default = "default_output")]
    pub output: String,
}

fn default_output() -> String {
    "value".to_string()
}

impl IndicatorRef {
    /// Check identity, output line, and every parameter against the registry.
    ///
    /// Collects *all* problems rather than returning the first, so a caller
    /// repairing a document — a trader in a form, or the model of FEAT-0304 —
    /// converges in one pass instead of one refusal per attempt.
    pub fn validate(&self, field: &str, out: &mut Vec<RuleRefusal>) {
        let Some(spec) = spec_for(&self.id) else {
            out.push(RuleRefusal::new(
                RefusalCode::UnknownIndicator,
                format!("{field}.id"),
                format!(
                    "`{}` is not an indicator this schema defines; known identities are {}",
                    self.id,
                    REGISTRY.iter().map(|s| s.id).collect::<Vec<_>>().join(", ")
                ),
            ));
            return;
        };

        if !spec.outputs.contains(&self.output.as_str()) {
            out.push(RuleRefusal::new(
                RefusalCode::UnknownIndicatorOutput,
                format!("{field}.output"),
                format!(
                    "`{}` does not produce an output named `{}`; it produces {}",
                    spec.id,
                    self.output,
                    spec.outputs.join(", ")
                ),
            ));
        }

        for (name, value) in &self.params {
            let Some(param) = spec.params.iter().find(|p| p.name == name) else {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidIndicatorParameter,
                    format!("{field}.params.{name}"),
                    format!(
                        "`{}` takes no parameter named `{}`; it takes {}",
                        spec.id,
                        name,
                        if spec.params.is_empty() {
                            "none".to_string()
                        } else {
                            spec.params
                                .iter()
                                .map(|p| p.name)
                                .collect::<Vec<_>>()
                                .join(", ")
                        }
                    ),
                ));
                continue;
            };
            check_param(param, value, &format!("{field}.params.{name}"), out);
        }

        for param in spec.params {
            if !self.params.contains_key(param.name) {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidIndicatorParameter,
                    format!("{field}.params.{}", param.name),
                    format!(
                        "`{}` requires parameter `{}`; a rule never inherits a default \
                         from settings, because the settings can change under an armed rule",
                        spec.id, param.name
                    ),
                ));
            }
        }
    }

    /// How many candles must be present before this reference has a value.
    ///
    /// Used by the evaluator to answer "not enough history yet" as a distinct
    /// outcome from "condition is false" — the two mean very different things to
    /// a trader and to a backtest.
    pub fn warmup_candles(&self) -> u32 {
        let longest = self
            .params
            .values()
            .filter_map(|v| match v {
                ParamValue::Count(n) => Some(*n),
                ParamValue::Ratio(_) => None,
            })
            .max()
            .unwrap_or(1);
        // A crossing needs the previous closed candle to have a value too, so
        // one spare candle on top of the longest window.
        longest.saturating_add(1)
    }
}

fn check_param(spec: &ParamSpec, value: &ParamValue, field: &str, out: &mut Vec<RuleRefusal>) {
    match (spec.kind, value) {
        (ParamKind::Period { min, max }, ParamValue::Count(n)) => {
            if *n < min || *n > max {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidIndicatorParameter,
                    field,
                    format!(
                        "`{n}` is outside the range {min}..={max} for `{}`",
                        spec.name
                    ),
                ));
            }
        }
        (ParamKind::Period { .. }, ParamValue::Ratio(d)) => {
            out.push(RuleRefusal::new(
                RefusalCode::InvalidIndicatorParameter,
                field,
                format!("`{}` is a whole number of candles, not `{d}`", spec.name),
            ));
        }
        (ParamKind::Factor { min, max }, ParamValue::Ratio(d)) => {
            let lo: Decimal = min.parse().unwrap_or_default();
            let hi: Decimal = max.parse().unwrap_or_default();
            if *d < lo || *d > hi {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidIndicatorParameter,
                    field,
                    format!(
                        "`{d}` is outside the range {min}..={max} for `{}`",
                        spec.name
                    ),
                ));
            }
        }
        (ParamKind::Factor { .. }, ParamValue::Count(n)) => {
            // A bare `2` for std_dev is what a human writes and means. Accepting
            // it as 2.0 is not a silent reinterpretation — the value is
            // identical — so this is the one place a widening is honest.
            let as_decimal = Decimal::from(*n);
            let ParamKind::Factor { min, max } = spec.kind else {
                unreachable!()
            };
            let lo: Decimal = min.parse().unwrap_or_default();
            let hi: Decimal = max.parse().unwrap_or_default();
            if as_decimal < lo || as_decimal > hi {
                out.push(RuleRefusal::new(
                    RefusalCode::InvalidIndicatorParameter,
                    field,
                    format!(
                        "`{n}` is outside the range {min}..={max} for `{}`",
                        spec.name
                    ),
                ));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn indicator(id: &str, params: &[(&str, ParamValue)], output: &str) -> IndicatorRef {
        IndicatorRef {
            id: id.to_string(),
            params: params
                .iter()
                .map(|(k, v)| (k.to_string(), v.clone()))
                .collect(),
            output: output.to_string(),
        }
    }

    fn refusals(r: &IndicatorRef) -> Vec<RuleRefusal> {
        let mut out = Vec::new();
        r.validate("conditions[0].left.indicator", &mut out);
        out
    }

    #[test]
    fn accepts_rsi_14() {
        assert!(refusals(&indicator(
            "rsi",
            &[("period", ParamValue::Count(14))],
            "value"
        ))
        .is_empty());
    }

    #[test]
    fn rejects_an_unknown_identity_and_lists_what_it_knows() {
        let out = refusals(&indicator("supertrend_v2", &[], "value"));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].code, RefusalCode::UnknownIndicator);
        assert!(
            out[0].detail.contains("rsi"),
            "the refusal should name the known set"
        );
    }

    /// ADR-0012 forbids a rule whose meaning came from executable text. There is
    /// no field for it, so the attempt lands as an unknown identity rather than
    /// as anything that could be run.
    #[test]
    fn an_expression_string_is_just_an_unknown_identity() {
        let out = refusals(&indicator("close > sma(20) && rsi(14) < 30", &[], "value"));
        assert_eq!(out[0].code, RefusalCode::UnknownIndicator);
    }

    #[test]
    fn rejects_an_output_line_the_indicator_does_not_produce() {
        let out = refusals(&indicator(
            "rsi",
            &[("period", ParamValue::Count(14))],
            "histogram",
        ));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].code, RefusalCode::UnknownIndicatorOutput);
        assert_eq!(out[0].field, "conditions[0].left.indicator.output");
    }

    #[test]
    fn accepts_every_declared_output_of_a_multi_line_indicator() {
        for line in ["macd", "signal", "histogram"] {
            let r = indicator(
                "macd",
                &[
                    ("fast_period", ParamValue::Count(12)),
                    ("slow_period", ParamValue::Count(26)),
                    ("signal_period", ParamValue::Count(9)),
                ],
                line,
            );
            assert!(refusals(&r).is_empty(), "macd.{line} should be readable");
        }
    }

    #[test]
    fn rejects_an_unknown_parameter_rather_than_ignoring_it() {
        let out = refusals(&indicator(
            "rsi",
            &[
                ("period", ParamValue::Count(14)),
                ("smoothing", ParamValue::Count(3)),
            ],
            "value",
        ));
        assert!(out
            .iter()
            .any(|r| r.code == RefusalCode::InvalidIndicatorParameter
                && r.field.ends_with("params.smoothing")));
    }

    /// A rule must carry its own parameters. Inheriting them from the panel's
    /// settings would mean an armed rule silently changes meaning when the
    /// trader adjusts a slider somewhere else.
    #[test]
    fn requires_every_parameter_rather_than_defaulting_from_settings() {
        let out = refusals(&indicator(
            "macd",
            &[("fast_period", ParamValue::Count(12))],
            "macd",
        ));
        let missing: Vec<&str> = out.iter().map(|r| r.field.as_str()).collect();
        assert!(missing.iter().any(|f| f.ends_with("params.slow_period")));
        assert!(missing.iter().any(|f| f.ends_with("params.signal_period")));
    }

    #[test]
    fn rejects_a_period_outside_its_domain() {
        for bad in [0u32, 1, 100_000] {
            let out = refusals(&indicator(
                "rsi",
                &[("period", ParamValue::Count(bad))],
                "value",
            ));
            assert!(
                out.iter()
                    .any(|r| r.code == RefusalCode::InvalidIndicatorParameter),
                "period {bad} should be refused"
            );
        }
    }

    #[test]
    fn rejects_a_decimal_where_a_candle_count_belongs() {
        let out = refusals(&indicator(
            "rsi",
            &[(
                "period",
                ParamValue::Ratio(Decimal::from_str("14.5").unwrap()),
            )],
            "value",
        ));
        assert!(out
            .iter()
            .any(|r| r.detail.contains("whole number of candles")));
    }

    #[test]
    fn accepts_a_whole_number_for_a_factor_because_the_value_is_identical() {
        let two_as_int = indicator(
            "bollinger",
            &[
                ("period", ParamValue::Count(20)),
                ("std_dev", ParamValue::Count(2)),
            ],
            "upper",
        );
        let two_as_decimal = indicator(
            "bollinger",
            &[
                ("period", ParamValue::Count(20)),
                (
                    "std_dev",
                    ParamValue::Ratio(Decimal::from_str("2").unwrap()),
                ),
            ],
            "upper",
        );
        assert!(refusals(&two_as_int).is_empty());
        assert!(refusals(&two_as_decimal).is_empty());
    }

    #[test]
    fn rejects_a_factor_outside_its_domain() {
        let out = refusals(&indicator(
            "bollinger",
            &[
                ("period", ParamValue::Count(20)),
                (
                    "std_dev",
                    ParamValue::Ratio(Decimal::from_str("99").unwrap()),
                ),
            ],
            "upper",
        ));
        assert!(out.iter().any(|r| r.field.ends_with("params.std_dev")));
    }

    /// `deny_unknown_fields` is what makes "unknown fields are rejected rather
    /// than ignored" true at the parse boundary rather than only in `validate`.
    #[test]
    fn deserialising_an_unknown_field_fails_rather_than_dropping_it() {
        let json = r#"{"id":"rsi","params":{"period":14},"output":"value","source":"hl2"}"#;
        let err = serde_json::from_str::<IndicatorRef>(json).unwrap_err();
        assert!(err.to_string().contains("source"), "got: {err}");
    }

    #[test]
    fn output_defaults_to_value_for_single_line_indicators() {
        let r: IndicatorRef =
            serde_json::from_str(r#"{"id":"atr","params":{"period":14}}"#).unwrap();
        assert_eq!(r.output, "value");
        assert!(refusals(&r).is_empty());
    }

    /// Decimals cross the boundary as strings in this crate. If that ever
    /// changed, thresholds would silently gain float rounding.
    #[test]
    fn decimal_params_round_trip_as_strings() {
        let r = indicator(
            "super_trend",
            &[
                ("period", ParamValue::Count(10)),
                (
                    "factor",
                    ParamValue::Ratio(Decimal::from_str("3.5").unwrap()),
                ),
            ],
            "value",
        );
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains(r#""factor":"3.5""#), "got: {json}");
        assert_eq!(serde_json::from_str::<IndicatorRef>(&json).unwrap(), r);
    }

    /// Params serialise in sorted order regardless of insertion order, which is
    /// what makes the document hash stable.
    #[test]
    fn params_serialise_in_a_stable_order() {
        let a = indicator(
            "macd",
            &[
                ("signal_period", ParamValue::Count(9)),
                ("fast_period", ParamValue::Count(12)),
                ("slow_period", ParamValue::Count(26)),
            ],
            "macd",
        );
        let b = indicator(
            "macd",
            &[
                ("fast_period", ParamValue::Count(12)),
                ("slow_period", ParamValue::Count(26)),
                ("signal_period", ParamValue::Count(9)),
            ],
            "macd",
        );
        assert_eq!(
            serde_json::to_string(&a).unwrap(),
            serde_json::to_string(&b).unwrap()
        );
    }

    #[test]
    fn the_registry_has_no_duplicate_identities_and_every_entry_has_an_output() {
        let mut ids: Vec<&str> = REGISTRY.iter().map(|s| s.id).collect();
        let before = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), before, "duplicate indicator id in REGISTRY");
        for spec in REGISTRY {
            assert!(
                !spec.outputs.is_empty(),
                "{} declares no output line",
                spec.id
            );
            let mut names: Vec<&str> = spec.params.iter().map(|p| p.name).collect();
            let n = names.len();
            names.sort_unstable();
            names.dedup();
            assert_eq!(names.len(), n, "{} declares a parameter twice", spec.id);
        }
    }

    /// The two chart-only families, refused by name rather than half-supported.
    #[test]
    fn session_anchored_and_distribution_indicators_are_not_in_the_registry() {
        for id in ["vwap", "volume_profile"] {
            assert!(
                spec_for(id).is_none(),
                "{id} must not be rule-addressable in v1"
            );
        }
    }
}
