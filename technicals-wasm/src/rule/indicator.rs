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
//! **The price an indicator is computed over.** The settings cards draw rsi,
//! macd, stoch_rsi, cci, momentum, ema and bollinger over a price the trader
//! picks (`close`, `hl2`, `hlc3`, …). Version 1 had no field for it, because
//! nothing computed an alert series over anything but the default price, and a
//! schema field the evaluator does not honour is a document that claims one
//! thing while the engine does another — the exact gap ADR-0012 exists to close.
//! FEAT-0454 adds `IndicatorRef::field` together with the alert path that
//! honours it (`computeIndicatorSeries`); see `default_field` for which
//! indicators take one.

use std::collections::BTreeMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::condition::{Dimension, PriceField};
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
    /// The output lines a condition may reference, each with what its numbers
    /// are denominated in. Multi-line indicators name each line; single-line
    /// indicators expose exactly `value`, so that every reference has the same
    /// shape and `output` is never optional-by-omission.
    ///
    /// The dimension sits on the *output*, not on the indicator, because
    /// `bollinger` is both: `upper`/`middle`/`lower` are prices and `percent_b`
    /// is a bare ratio. One dimension per indicator would have made that entry
    /// a special case; one per output makes it representable.
    pub outputs: &'static [(&'static str, Dimension)],
}

const PERIOD: ParamKind = ParamKind::Period { min: 2, max: 5000 };
const SHORT_PERIOD: ParamKind = ParamKind::Period { min: 1, max: 5000 };
/// The single-line shape, once per dimension. Four constants rather than one
/// because "what an indicator's `value` means" differs: an EMA is a price, an
/// RSI is a percent, an OBV is a volume.
const VALUE_PRICE: &[(&str, Dimension)] = &[("value", Dimension::Price)];
const VALUE_PERCENT: &[(&str, Dimension)] = &[("value", Dimension::Percent)];
const VALUE_VOLUME: &[(&str, Dimension)] = &[("value", Dimension::Volume)];
const VALUE_UNITLESS: &[(&str, Dimension)] = &[("value", Dimension::Unitless)];

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
        outputs: VALUE_PERCENT,
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
        outputs: &[("k", Dimension::Percent), ("d", Dimension::Percent)],
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
        outputs: &[
            ("macd", Dimension::Price),
            ("signal", Dimension::Price),
            ("histogram", Dimension::Price),
        ],
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
        outputs: &[("k", Dimension::Percent), ("d", Dimension::Percent)],
    },
    IndicatorSpec {
        id: "williams_r",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PERCENT,
    },
    IndicatorSpec {
        id: "cci",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_UNITLESS,
    },
    IndicatorSpec {
        id: "adx",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: &[
            ("adx", Dimension::Percent),
            ("plus_di", Dimension::Percent),
            ("minus_di", Dimension::Percent),
        ],
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
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "momentum",
        params: &[ParamSpec {
            name: "period",
            kind: SHORT_PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "ema",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "sma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "wma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "vwma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "hma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
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
        outputs: &[
            ("upper", Dimension::Price),
            ("middle", Dimension::Price),
            ("lower", Dimension::Price),
            // A ratio of the band width, not a price and not a percent.
            ("percent_b", Dimension::Unitless),
            // `(upper - lower) / middle * 100` — the squeeze measure.
            //
            // Percent, and scaled by 100, because that is the number the app
            // already shows: `TechnicalsPanel.svelte` renders
            // `TechnicalsPresenter.calculateBollingerBandWidth` with a `%`
            // suffix. TradingView's BBW is the bare ratio instead, and picking
            // that convention here would have been the more standard choice and
            // the wrong one: a trader reading `2.41%` off their own panel would
            // write `bandwidth < 2.41`, which against a bare ratio is true on
            // every candle. A squeeze alert that always fires is worse than no
            // squeeze alert, so the schema matches the surface the value is
            // read from. `indicatorSeries.ts` computes it on the same scale.
            ("bandwidth", Dimension::Percent),
        ],
    },
    IndicatorSpec {
        id: "atr",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PRICE,
    },
    IndicatorSpec {
        id: "choppiness",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PERCENT,
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
        outputs: &[
            ("value", Dimension::Price),
            ("upper", Dimension::Price),
            ("lower", Dimension::Price),
        ],
    },
    IndicatorSpec {
        id: "mfi",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_PERCENT,
    },
    IndicatorSpec {
        id: "obv",
        params: &[],
        outputs: VALUE_VOLUME,
    },
    IndicatorSpec {
        id: "volume_ma",
        params: &[ParamSpec {
            name: "period",
            kind: PERIOD,
        }],
        outputs: VALUE_VOLUME,
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
        // `direction` is +1 while the SAR trails below the price and -1 while
        // it stands above. The flip a trader means is the SAR changing side,
        // which "the close crosses the SAR" misses when one candle reverses it
        // and closes back beyond it; "direction crosses 0" is that flip exactly
        // (FEAT-0446 group 4). Unitless, so it pairs with a constant.
        outputs: &[
            ("value", Dimension::Price),
            ("direction", Dimension::Unitless),
        ],
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
        outputs: &[
            ("conversion", Dimension::Price),
            ("base", Dimension::Price),
            ("span_a", Dimension::Price),
            ("span_b", Dimension::Price),
        ],
    },
];

pub fn spec_for(id: &str) -> Option<&'static IndicatorSpec> {
    REGISTRY.iter().find(|s| s.id == id)
}

/// Indicators whose level is a running total from the first candle they are
/// handed, so it depends on how much history is loaded rather than on the market
/// alone. A condition may read one only against a window over itself
/// (`RefusalCode::CumulativeNeedsOwnWindow`, FEAT-0446 group 4).
const CUMULATIVE: &[&str] = &["obv"];

/// Whether `id` names a cumulative indicator; see `CUMULATIVE`.
pub fn is_cumulative(id: &str) -> bool {
    CUMULATIVE.contains(&id)
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

/// The indicators whose settings card draws them over a price the trader picks,
/// each with the price it is computed over when a reference names none
/// (FEAT-0454). `None` for every other indicator: they read several candle
/// values at once, or volume, and have no single price to swap.
///
/// The typical price for CCI, because CCI is defined over it, the CCI card
/// defaults to it, and the alert path computed CCI over it before a reference
/// could name a price at all. The close for the rest, for the same last reason.
pub fn default_field(id: &str) -> Option<PriceField> {
    match id {
        "rsi" | "macd" | "stoch_rsi" | "momentum" | "ema" | "bollinger" => Some(PriceField::Close),
        "cci" => Some(PriceField::Hlc3),
        _ => None,
    }
}

/// A named indicator with its parameters and the output line being read.
///
/// Serialised through [`IndicatorRefWire`], which carries `deny_unknown_fields`
/// — the enforcement point for "unknown fields are rejected rather than
/// ignored": a typo'd key is a refusal, not a silently defaulted rule.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(from = "IndicatorRefWire", into = "IndicatorRefWire")]
pub struct IndicatorRef {
    pub id: String,
    /// `BTreeMap`, not `HashMap`: iteration order is the serialisation order, and
    /// the serialisation is what gets hashed. A `HashMap` would give the same
    /// rule a different hash per process.
    pub params: BTreeMap<String, ParamValue>,
    /// Which line of a multi-line indicator to read. Always present after
    /// validation; `default_output` fills it for the single-line case so a
    /// document never has to spell `"output": "value"` to mean the obvious thing.
    pub output: String,
    /// The price the indicator is computed over, where its card offers a choice
    /// (`default_field`). `None` means that default.
    ///
    /// Named `field` because it is a [`PriceField`], as on a price operand; the
    /// `source` there is the last-or-mark series, which this is not: indicators
    /// are computed over the last-traded series.
    ///
    /// Naming the default is the reference that names none, both ways across the
    /// wire, so a rule armed before this field existed keeps its canonical form
    /// and its content hash, and `"field": "close"` on an RSI cannot become a
    /// second strategy in the log.
    pub field: Option<PriceField>,
}

/// The wire shape of an [`IndicatorRef`]. The conversions both ways drop a
/// `field` that names the indicator's default price.
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct IndicatorRefWire {
    id: String,
    #[serde(default)]
    params: BTreeMap<String, ParamValue>,
    #[serde(default = "default_output")]
    output: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    field: Option<PriceField>,
}

/// `field` unless it names `id`'s default price.
fn without_default(id: &str, field: Option<PriceField>) -> Option<PriceField> {
    field.filter(|f| Some(*f) != default_field(id))
}

impl From<IndicatorRefWire> for IndicatorRef {
    fn from(wire: IndicatorRefWire) -> Self {
        Self {
            field: without_default(&wire.id, wire.field),
            id: wire.id,
            params: wire.params,
            output: wire.output,
        }
    }
}

impl From<IndicatorRef> for IndicatorRefWire {
    fn from(r: IndicatorRef) -> Self {
        Self {
            field: without_default(&r.id, r.field),
            id: r.id,
            params: r.params,
            output: r.output,
        }
    }
}

fn default_output() -> String {
    "value".to_string()
}

impl IndicatorRef {
    /// The price this reference is computed over: its own `field`, else the
    /// indicator's default. `None` for an indicator with no price choice.
    pub fn effective_field(&self) -> Option<PriceField> {
        self.field.or_else(|| default_field(&self.id))
    }

    /// What this reference's chosen output line is denominated in.
    ///
    /// `None` when the id or the output is not in the registry. That case is
    /// already refused by `validate`, with a message that names what the
    /// registry does offer, so answering "unknown" here keeps one bad document
    /// to one refusal instead of two.
    pub fn output_dimension(&self) -> Option<Dimension> {
        spec_for(&self.id)?
            .outputs
            .iter()
            .find(|(name, _)| *name == self.output)
            .map(|(_, dimension)| *dimension)
    }

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

        if !spec.outputs.iter().any(|(name, _)| *name == self.output) {
            out.push(RuleRefusal::new(
                RefusalCode::UnknownIndicatorOutput,
                format!("{field}.output"),
                format!(
                    "`{}` does not produce an output named `{}`; it produces {}",
                    spec.id,
                    self.output,
                    spec
                        .outputs
                        .iter()
                        .map(|(name, _)| *name)
                        .collect::<Vec<_>>()
                        .join(", ")
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

        if self.field.is_some() && default_field(spec.id).is_none() {
            out.push(RuleRefusal::new(
                RefusalCode::InvalidIndicatorParameter,
                format!("{field}.field"),
                format!(
                    "`{}` is not computed over a single price, so it takes no `field`; \
                     the indicators that do are {}",
                    spec.id,
                    REGISTRY
                        .iter()
                        .map(|s| s.id)
                        .filter(|id| default_field(id).is_some())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            ));
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

/// The registry as JSON, for the one consumer that must not drift from it: the
/// TypeScript catalogue the alert panel's indicator builder renders from
/// (FEAT-0028).
///
/// Written by hand rather than derived, and the reason is load-bearing.
/// Deriving it would mean `Serialize` on `Dimension` and `ParamKind`, and
/// `Dimension` deliberately has none: nothing about an operand's unit may reach
/// a canonical form, or a rule already sitting in a trader's `localStorage`
/// hashes differently from the hash it was stored under. A function that writes
/// a string keeps this export outside the document's serialisation entirely.
///
/// Consumed by `indicatorCatalogue.test.ts` and nothing else. The catalogue is
/// not generated from this: labels, grouping and translations are the panel's
/// to own, and generating them from Rust would move editorial decisions into
/// the crate that computes money. What the test buys is the other direction —
/// an indicator, a parameter or an output line that exists here and not there
/// fails a test instead of quietly never appearing in the picker.
pub fn registry_json() -> String {
    let specs: Vec<serde_json::Value> = REGISTRY
        .iter()
        .map(|spec| {
            let params: Vec<serde_json::Value> = spec
                .params
                .iter()
                .map(|param| match param.kind {
                    // `min`/`max` stay in the shape their domain has: whole
                    // candles as numbers, multipliers as decimal *strings*.
                    // A factor that arrives in JavaScript as an f64 is a
                    // rounding error waiting to be compared against a price.
                    ParamKind::Period { min, max } => serde_json::json!({
                        "name": param.name,
                        "kind": "period",
                        "min": min,
                        "max": max,
                    }),
                    ParamKind::Factor { min, max } => serde_json::json!({
                        "name": param.name,
                        "kind": "factor",
                        "min": min,
                        "max": max,
                    }),
                })
                .collect();
            let outputs: Vec<serde_json::Value> = spec
                .outputs
                .iter()
                .map(|(name, dimension)| {
                    serde_json::json!({
                        "name": name,
                        "dimension": dimension.to_string(),
                    })
                })
                .collect();
            serde_json::json!({
                "id": spec.id,
                "params": params,
                "outputs": outputs,
                // So a builder offers a cumulative indicator only the one
                // pairing the core accepts, from the same list that refuses
                // the others, rather than from a copy of it.
                "cumulative": is_cumulative(spec.id),
                // The price a reference is computed over when it names none,
                // or null for an indicator that takes no price (FEAT-0454).
                "field": default_field(spec.id),
            })
        })
        .collect();
    serde_json::Value::Array(specs).to_string()
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
            field: None,
        }
    }

    fn rsi_14_over(field: Option<PriceField>) -> IndicatorRef {
        IndicatorRef {
            field,
            ..indicator("rsi", &[("period", ParamValue::Count(14))], "value")
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

    /// FEAT-0028's second schema gap: squeeze had nothing to compare, because
    /// the registry declared only the three band prices and `percent_b`.
    #[test]
    fn bollinger_declares_a_bandwidth_line_for_squeeze_conditions() {
        for line in ["upper", "middle", "lower", "percent_b", "bandwidth"] {
            let r = indicator(
                "bollinger",
                &[
                    ("period", ParamValue::Count(20)),
                    ("std_dev", ParamValue::Count(2)),
                ],
                line,
            );
            assert!(
                refusals(&r).is_empty(),
                "`{line}` should be a declared bollinger output"
            );
        }
    }

    /// The dimension is what stops `bandwidth` being read as a price. It is a
    /// percentage of the middle band, on the same 0..100-ish scale the panel
    /// shows — not the bare ratio, and not a quote-currency amount.
    #[test]
    fn bandwidth_is_a_percentage_and_the_bands_around_it_are_prices() {
        let bandwidth = indicator(
            "bollinger",
            &[
                ("period", ParamValue::Count(20)),
                ("std_dev", ParamValue::Count(2)),
            ],
            "bandwidth",
        );
        assert_eq!(bandwidth.output_dimension(), Some(Dimension::Percent));

        let upper = IndicatorRef {
            output: "upper".to_string(),
            ..bandwidth.clone()
        };
        assert_eq!(upper.output_dimension(), Some(Dimension::Price));
    }

    /// FEAT-0446 group 4: the SAR's side is its own line, unitless, so "the SAR
    /// flips" is a cross of 0 rather than a cross of the price.
    #[test]
    fn parabolic_sar_declares_its_side_beside_its_price() {
        let ratio = |s: &str| ParamValue::Ratio(Decimal::from_str(s).unwrap());
        let direction = indicator(
            "parabolic_sar",
            &[
                ("start", ratio("0.02")),
                ("increment", ratio("0.02")),
                ("max", ratio("0.2")),
            ],
            "direction",
        );
        assert!(refusals(&direction).is_empty());
        assert_eq!(direction.output_dimension(), Some(Dimension::Unitless));

        let value = IndicatorRef {
            output: "value".to_string(),
            ..direction.clone()
        };
        assert!(refusals(&value).is_empty());
        assert_eq!(value.output_dimension(), Some(Dimension::Price));
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

    // ---- FEAT-0454: the price an indicator is computed over ----------------

    /// The settings cards draw these over a price the trader picks, so a rule
    /// may name one.
    #[test]
    fn an_indicator_with_a_price_choice_accepts_every_price_field() {
        for field in [
            PriceField::Open,
            PriceField::High,
            PriceField::Low,
            PriceField::Close,
            PriceField::Hl2,
            PriceField::Hlc3,
        ] {
            for id in ["rsi", "macd", "stoch_rsi", "cci", "momentum", "ema", "bollinger"] {
                let spec = spec_for(id).unwrap();
                let r = IndicatorRef {
                    id: id.to_string(),
                    params: spec
                        .params
                        .iter()
                        .map(|p| {
                            let value = match p.kind {
                                ParamKind::Period { min, .. } => ParamValue::Count(min.max(3)),
                                ParamKind::Factor { min, .. } => {
                                    ParamValue::Ratio(Decimal::from_str(min).unwrap())
                                }
                            };
                            (p.name.to_string(), value)
                        })
                        .collect(),
                    output: spec.outputs[0].0.to_string(),
                    field: Some(field),
                };
                assert!(refusals(&r).is_empty(), "{id} over {field:?}: {:?}", refusals(&r));
            }
        }
    }

    #[test]
    fn a_named_price_travels_on_the_wire() {
        let r: IndicatorRef =
            serde_json::from_str(r#"{"id":"rsi","params":{"period":14},"field":"hl2"}"#).unwrap();
        assert_eq!(r, rsi_14_over(Some(PriceField::Hl2)));
        assert!(serde_json::to_string(&r).unwrap().contains(r#""field":"hl2""#));
    }

    /// The price an indicator is computed over when a reference names none is
    /// the close, or for CCI the typical price. Naming it anyway is the same
    /// reference, spelled once: otherwise two byte-different spellings of one
    /// rule would be two strategies in the log.
    #[test]
    fn naming_the_default_price_is_the_reference_that_names_none() {
        let explicit: IndicatorRef =
            serde_json::from_str(r#"{"id":"rsi","params":{"period":14},"field":"close"}"#)
                .unwrap();
        assert_eq!(explicit, rsi_14_over(None));

        let cci: IndicatorRef =
            serde_json::from_str(r#"{"id":"cci","params":{"period":20},"field":"hlc3"}"#).unwrap();
        assert_eq!(cci.field, None);

        let literal = rsi_14_over(Some(PriceField::Close));
        assert_eq!(
            serde_json::to_string(&literal).unwrap(),
            serde_json::to_string(&rsi_14_over(None)).unwrap()
        );
    }

    /// CCI over the close is not CCI over its default price.
    #[test]
    fn the_close_is_not_the_default_price_of_cci() {
        let cci: IndicatorRef =
            serde_json::from_str(r#"{"id":"cci","params":{"period":20},"field":"close"}"#)
                .unwrap();
        assert_eq!(cci.field, Some(PriceField::Close));
    }

    #[test]
    fn the_effective_price_fills_in_the_default() {
        assert_eq!(rsi_14_over(None).effective_field(), Some(PriceField::Close));
        assert_eq!(
            indicator("cci", &[("period", ParamValue::Count(20))], "value").effective_field(),
            Some(PriceField::Hlc3)
        );
        assert_eq!(
            indicator("atr", &[("period", ParamValue::Count(14))], "value").effective_field(),
            None
        );
    }

    /// ATR reads high, low and close together; there is no single price to
    /// swap. A price named on it would be a document claiming a choice the
    /// engine does not make.
    #[test]
    fn an_indicator_without_a_price_choice_refuses_one() {
        let atr = IndicatorRef {
            field: Some(PriceField::Close),
            ..indicator("atr", &[("period", ParamValue::Count(14))], "value")
        };
        let out = refusals(&atr);
        assert_eq!(out.len(), 1, "{out:?}");
        assert_eq!(out[0].code, RefusalCode::InvalidIndicatorParameter);
        assert_eq!(out[0].field, "conditions[0].left.indicator.field");
    }

    #[test]
    fn an_unknown_price_field_fails_to_parse() {
        let json = r#"{"id":"rsi","params":{"period":14},"field":"ohlc4"}"#;
        assert!(serde_json::from_str::<IndicatorRef>(json).is_err());
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

    /// The JSON export names every registry entry, with its parameters and its
    /// output dimensions.
    ///
    /// Asserted against `REGISTRY` itself rather than against a written-out
    /// expectation: a test that repeats the list is a third copy to keep in
    /// step, which is the failure this whole export exists to prevent.
    #[test]
    fn registry_json_names_every_spec_its_params_and_its_outputs() {
        let json: serde_json::Value =
            serde_json::from_str(&registry_json()).expect("registry_json is valid JSON");
        let entries = json.as_array().expect("registry_json is an array");
        assert_eq!(entries.len(), REGISTRY.len());

        for (entry, spec) in entries.iter().zip(REGISTRY.iter()) {
            assert_eq!(entry["id"], spec.id);
            assert_eq!(entry["cumulative"], spec.id == "obv", "{}", spec.id);
            assert_eq!(
                entry["field"],
                serde_json::json!(default_field(spec.id)),
                "{}",
                spec.id
            );

            let params = entry["params"].as_array().expect("params is an array");
            assert_eq!(params.len(), spec.params.len());
            for (param_json, param) in params.iter().zip(spec.params.iter()) {
                assert_eq!(param_json["name"], param.name);
                match param.kind {
                    ParamKind::Period { min, max } => {
                        assert_eq!(param_json["kind"], "period");
                        assert_eq!(param_json["min"], min);
                        assert_eq!(param_json["max"], max);
                    }
                    ParamKind::Factor { min, max } => {
                        assert_eq!(param_json["kind"], "factor");
                        // Strings, not numbers: a factor reaches a comparison
                        // against a price and must not round on the way.
                        assert_eq!(param_json["min"], min);
                        assert_eq!(param_json["max"], max);
                    }
                }
            }

            let outputs = entry["outputs"].as_array().expect("outputs is an array");
            assert_eq!(outputs.len(), spec.outputs.len());
            for (output_json, (name, dimension)) in outputs.iter().zip(spec.outputs.iter()) {
                assert_eq!(output_json["name"], *name);
                assert_eq!(output_json["dimension"], dimension.to_string());
            }
        }
    }

}
