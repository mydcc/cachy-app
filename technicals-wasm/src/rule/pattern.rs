//! Candlestick pattern detection (FEAT-0394).
//!
//! The single implementation. `src/services/candlestickPatterns.ts` is Academy
//! teaching material — idealised example candles and drawing instructions — and
//! holds no detection logic; nothing here mirrors anything there beyond the
//! pattern ids, which the UI reuses to pick an illustration.
//!
//! Every threshold is expressed as a share of the candle's own range rather than
//! as a ratio between body and shadow. Two reasons: a ratio needs a division
//! whose denominator is zero on a perfect doji, and a body measured against the
//! full range stays comparable across instruments whose typical candle size
//! differs by orders of magnitude.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::evaluate::Candle;

/// A body at or below this share of the range counts as "small" — the pin-bar
/// family (hammer, shooting star) is defined by a body that is dwarfed by one
/// shadow.
const SMALL_BODY_MAX_SHARE: (i64, u32) = (30, 2); // 0.30

/// A shadow at or above this share of the range is the "long" one.
const LONG_SHADOW_MIN_SHARE: (i64, u32) = (55, 2); // 0.55

/// The shadow opposite the long one must stay at or below this share, otherwise
/// the candle is a spinning top (indecision) rather than a directional pin bar.
const OPPOSITE_SHADOW_MAX_SHARE: (i64, u32) = (15, 2); // 0.15

/// A body at or above this share of the range counts as "full" — the marubozu
/// end of the scale, required by the three-soldiers family.
const FULL_BODY_MIN_SHARE: (i64, u32) = (60, 2); // 0.60

/// The star of a morning/evening star must be small relative to the candle that
/// precedes it, otherwise the three candles are just a wide range.
const STAR_BODY_MAX_SHARE_OF_FIRST: (i64, u32) = (50, 2); // 0.50

/// How many closed candles the trend check looks back over, on top of the
/// pattern's own candles. See [`preceding_trend`].
const TREND_LOOKBACK: usize = 5;

fn share(value: (i64, u32)) -> Decimal {
    Decimal::new(value.0, value.1)
}

/// A candlestick pattern a rule can fire on.
///
/// Serde's snake_case tagging is what refuses an unknown pattern *by name*
/// (FEAT-0394 acceptance criterion): `"pattern": "hamer"` fails to deserialise
/// and surfaces as a parse refusal, rather than matching something close by or
/// being dropped.
///
/// Engulfing and harami carry their direction in the name, where the reference
/// table in FEAT-0394 left it out. A direction-less engulfing alert is not
/// actionable — the bullish and bearish cases call for opposite trades, and a
/// trader who armed "engulfing" and got the other one would be handed a reason
/// to enter the wrong side.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum CandlePattern {
    // Single
    Hammer,
    InvertedHammer,
    ShootingStar,
    HangingMan,
    // Multiple
    BullishEngulfing,
    BearishEngulfing,
    PiercingLine,
    DarkCloudCover,
    BullishHarami,
    BearishHarami,
    // Structural
    MorningStar,
    EveningStar,
    ThreeWhiteSoldiers,
    ThreeBlackCrows,
}

/// Which way the candles before a pattern were heading.
///
/// A hammer and a hanging man are the same shape; so are an inverted hammer and
/// a shooting star. Only the preceding trend separates each pair. Detecting them
/// without that context would report both names for every occurrence, and half
/// of those reports would point a trader the wrong way.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trend {
    Up,
    Down,
    Sideways,
}

impl CandlePattern {
    /// Candles the pattern itself spans, ignoring trend context.
    pub fn candles_spanned(&self) -> usize {
        match self {
            Self::Hammer | Self::InvertedHammer | Self::ShootingStar | Self::HangingMan => 1,
            Self::BullishEngulfing
            | Self::BearishEngulfing
            | Self::PiercingLine
            | Self::DarkCloudCover
            | Self::BullishHarami
            | Self::BearishHarami => 2,
            Self::MorningStar
            | Self::EveningStar
            | Self::ThreeWhiteSoldiers
            | Self::ThreeBlackCrows => 3,
        }
    }

    /// Whether this pattern's meaning depends on the trend that preceded it.
    pub fn needs_trend_context(&self) -> bool {
        matches!(
            self,
            Self::Hammer | Self::InvertedHammer | Self::ShootingStar | Self::HangingMan
        )
    }

    /// Closed candles required before this pattern can be evaluated at all.
    ///
    /// Feeds `Condition::warmup_candles`, so a rule that asks for a morning star
    /// is not evaluated against two candles and reported as "did not fire".
    pub fn warmup_candles(&self) -> u32 {
        let own = self.candles_spanned() as u32;
        if self.needs_trend_context() {
            own + TREND_LOOKBACK as u32
        } else {
            own
        }
    }

    /// The pattern's stable id, shared with the Academy illustration library so
    /// the alert UI can show the drawing that belongs to the name.
    pub fn id(&self) -> &'static str {
        match self {
            Self::Hammer => "hammer",
            Self::InvertedHammer => "inverted_hammer",
            Self::ShootingStar => "shooting_star",
            Self::HangingMan => "hanging_man",
            Self::BullishEngulfing => "bullish_engulfing",
            Self::BearishEngulfing => "bearish_engulfing",
            Self::PiercingLine => "piercing_line",
            Self::DarkCloudCover => "dark_cloud_cover",
            Self::BullishHarami => "bullish_harami",
            Self::BearishHarami => "bearish_harami",
            Self::MorningStar => "morning_star",
            Self::EveningStar => "evening_star",
            Self::ThreeWhiteSoldiers => "three_white_soldiers",
            Self::ThreeBlackCrows => "three_black_crows",
        }
    }
}

/// Geometry of one candle, computed once per detection rather than per rule.
struct Shape {
    body: Decimal,
    range: Decimal,
    upper_shadow: Decimal,
    lower_shadow: Decimal,
    is_bullish: bool,
    body_low: Decimal,
    body_high: Decimal,
}

impl Shape {
    fn of(candle: &Candle) -> Self {
        let body_low = candle.open.min(candle.close);
        let body_high = candle.open.max(candle.close);
        Self {
            body: body_high - body_low,
            range: candle.high - candle.low,
            upper_shadow: candle.high - body_high,
            lower_shadow: body_low - candle.low,
            is_bullish: candle.close > candle.open,
            body_low,
            body_high,
        }
    }

    /// A candle with no range at all — every price identical. No pattern claims
    /// anything about it, and treating it as one would make every share test
    /// trivially true against zero.
    fn is_flat(&self) -> bool {
        self.range <= Decimal::ZERO
    }

    fn body_at_most(&self, of_range: (i64, u32)) -> bool {
        self.body <= self.range * share(of_range)
    }

    fn body_at_least(&self, of_range: (i64, u32)) -> bool {
        self.body >= self.range * share(of_range)
    }

    /// The midpoint of the body — the level a piercing or a star has to reclaim.
    fn body_mid(&self) -> Decimal {
        (self.body_low + self.body_high) / Decimal::TWO
    }

    /// Long lower shadow, small body, negligible upper shadow: the hammer
    /// silhouette, before any trend context decides what to call it.
    fn is_lower_pin(&self) -> bool {
        !self.is_flat()
            && self.body_at_most(SMALL_BODY_MAX_SHARE)
            && self.lower_shadow >= self.range * share(LONG_SHADOW_MIN_SHARE)
            && self.upper_shadow <= self.range * share(OPPOSITE_SHADOW_MAX_SHARE)
    }

    /// The mirror silhouette: long upper shadow, small body, negligible lower.
    fn is_upper_pin(&self) -> bool {
        !self.is_flat()
            && self.body_at_most(SMALL_BODY_MAX_SHARE)
            && self.upper_shadow >= self.range * share(LONG_SHADOW_MIN_SHARE)
            && self.lower_shadow <= self.range * share(OPPOSITE_SHADOW_MAX_SHARE)
    }
}

/// Direction of the candles leading up to a pattern.
///
/// Compares the first and last close of the lookback window against the size of
/// that window's own swing, so "up" means the move is large relative to the
/// noise in it rather than merely non-zero. A window that ends where it started
/// is sideways, and a sideways market produces neither a hammer nor a hanging
/// man — both names claim a reversal, and there is nothing to reverse.
pub fn preceding_trend(candles: &[Candle]) -> Trend {
    let (Some(first), Some(last)) = (candles.first(), candles.last()) else {
        return Trend::Sideways;
    };

    let high = candles.iter().map(|c| c.high).max().unwrap_or(last.close);
    let low = candles.iter().map(|c| c.low).min().unwrap_or(last.close);
    let swing = high - low;
    if swing <= Decimal::ZERO {
        return Trend::Sideways;
    }

    let net = last.close - first.close;
    // Half the window's own swing: enough that a drift inside the noise does not
    // qualify, low enough that an ordinary pullback inside a trend still does.
    let threshold = swing / Decimal::TWO;

    if net >= threshold {
        Trend::Up
    } else if net <= -threshold {
        Trend::Down
    } else {
        Trend::Sideways
    }
}

impl CandlePattern {
    /// Does this pattern print on `window`?
    ///
    /// `window` holds exactly [`candles_spanned`](Self::candles_spanned) closed
    /// candles, oldest first, and `trend` describes the candles before them. A
    /// window of the wrong length is a caller bug and answers `false` rather
    /// than indexing past the end.
    pub fn detect(&self, window: &[Candle], trend: Trend) -> bool {
        if window.len() != self.candles_spanned() {
            return false;
        }

        match self {
            Self::Hammer => Shape::of(&window[0]).is_lower_pin() && trend == Trend::Down,
            Self::HangingMan => Shape::of(&window[0]).is_lower_pin() && trend == Trend::Up,
            Self::InvertedHammer => Shape::of(&window[0]).is_upper_pin() && trend == Trend::Down,
            Self::ShootingStar => Shape::of(&window[0]).is_upper_pin() && trend == Trend::Up,

            Self::BullishEngulfing => two(window, |prev, cur| {
                !prev.is_bullish
                    && cur.is_bullish
                    && cur.body_low <= prev.body_low
                    && cur.body_high >= prev.body_high
                    && cur.body > prev.body
            }),
            Self::BearishEngulfing => two(window, |prev, cur| {
                prev.is_bullish
                    && !cur.is_bullish
                    && cur.body_low <= prev.body_low
                    && cur.body_high >= prev.body_high
                    && cur.body > prev.body
            }),

            // Opens below the prior low and closes back inside the prior body,
            // past its midpoint but short of its open -- a close beyond the open
            // would be an engulfing, which is a different claim.
            Self::PiercingLine => two_raw(window, |prev_c, cur_c| {
                let (prev, cur) = (Shape::of(prev_c), Shape::of(cur_c));
                !prev.is_bullish
                    && cur.is_bullish
                    && cur_c.open < prev_c.low
                    && cur_c.close > prev.body_mid()
                    && cur_c.close < prev_c.open
            }),
            Self::DarkCloudCover => two_raw(window, |prev_c, cur_c| {
                let (prev, cur) = (Shape::of(prev_c), Shape::of(cur_c));
                prev.is_bullish
                    && !cur.is_bullish
                    && cur_c.open > prev_c.high
                    && cur_c.close < prev.body_mid()
                    && cur_c.close > prev_c.open
            }),

            Self::BullishHarami => two(window, |prev, cur| {
                !prev.is_bullish
                    && cur.is_bullish
                    && cur.body_low > prev.body_low
                    && cur.body_high < prev.body_high
            }),
            Self::BearishHarami => two(window, |prev, cur| {
                prev.is_bullish
                    && !cur.is_bullish
                    && cur.body_low > prev.body_low
                    && cur.body_high < prev.body_high
            }),

            Self::MorningStar => three(window, |first, star, last| {
                !first.is_bullish
                    && star.body <= first.body * share(STAR_BODY_MAX_SHARE_OF_FIRST)
                    && star.body_high < first.body_low
                    && last.is_bullish
                    && last.body_high > first.body_mid()
            }),
            Self::EveningStar => three(window, |first, star, last| {
                first.is_bullish
                    && star.body <= first.body * share(STAR_BODY_MAX_SHARE_OF_FIRST)
                    && star.body_low > first.body_high
                    && !last.is_bullish
                    && last.body_low < first.body_mid()
            }),

            Self::ThreeWhiteSoldiers => three(window, |a, b, c| {
                [&a, &b, &c]
                    .iter()
                    .all(|s| s.is_bullish && !s.is_flat() && s.body_at_least(FULL_BODY_MIN_SHARE))
                    && b.body_high > a.body_high
                    && c.body_high > b.body_high
                    // Each opens inside the one before: a gap up is a different
                    // formation, and three unconnected candles are not a march.
                    && b.body_low > a.body_low
                    && b.body_low < a.body_high
                    && c.body_low > b.body_low
                    && c.body_low < b.body_high
            }),
            Self::ThreeBlackCrows => three(window, |a, b, c| {
                [&a, &b, &c]
                    .iter()
                    .all(|s| !s.is_bullish && !s.is_flat() && s.body_at_least(FULL_BODY_MIN_SHARE))
                    && b.body_low < a.body_low
                    && c.body_low < b.body_low
                    && b.body_high < a.body_high
                    && b.body_high > a.body_low
                    && c.body_high < b.body_high
                    && c.body_high > b.body_low
            }),
        }
    }
}

fn two(window: &[Candle], test: impl Fn(Shape, Shape) -> bool) -> bool {
    test(Shape::of(&window[0]), Shape::of(&window[1]))
}

fn two_raw(window: &[Candle], test: impl Fn(&Candle, &Candle) -> bool) -> bool {
    test(&window[0], &window[1])
}

fn three(window: &[Candle], test: impl Fn(Shape, Shape, Shape) -> bool) -> bool {
    test(
        Shape::of(&window[0]),
        Shape::of(&window[1]),
        Shape::of(&window[2]),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn candle(open: Decimal, high: Decimal, low: Decimal, close: Decimal) -> Candle {
        Candle {
            open_time_ms: 0,
            open,
            high,
            low,
            close,
            volume: Decimal::ZERO,
        }
    }

    /// A textbook hammer: body in the top fifth, lower shadow most of the range.
    fn hammer_candle() -> Candle {
        candle(dec!(100), dec!(102), dec!(90), dec!(101))
    }

    /// The same silhouette turned over.
    fn inverted_candle() -> Candle {
        candle(dec!(100), dec!(112), dec!(99), dec!(101))
    }

    fn downtrend() -> Vec<Candle> {
        (0..TREND_LOOKBACK)
            .map(|i| {
                let top = Decimal::from(200 - (i as i64 * 10));
                candle(top, top + dec!(1), top - dec!(11), top - dec!(10))
            })
            .collect()
    }

    fn uptrend() -> Vec<Candle> {
        (0..TREND_LOOKBACK)
            .map(|i| {
                let base = Decimal::from(100 + (i as i64 * 10));
                candle(base, base + dec!(11), base - dec!(1), base + dec!(10))
            })
            .collect()
    }

    #[test]
    fn hammer_and_hanging_man_are_the_same_shape_told_apart_by_trend() {
        let shape = [hammer_candle()];

        assert!(CandlePattern::Hammer.detect(&shape, Trend::Down));
        assert!(!CandlePattern::Hammer.detect(&shape, Trend::Up));

        assert!(CandlePattern::HangingMan.detect(&shape, Trend::Up));
        assert!(!CandlePattern::HangingMan.detect(&shape, Trend::Down));

        // Neither name is claimed when there was no trend to reverse.
        assert!(!CandlePattern::Hammer.detect(&shape, Trend::Sideways));
        assert!(!CandlePattern::HangingMan.detect(&shape, Trend::Sideways));
    }

    #[test]
    fn inverted_hammer_and_shooting_star_are_told_apart_the_same_way() {
        let shape = [inverted_candle()];

        assert!(CandlePattern::InvertedHammer.detect(&shape, Trend::Down));
        assert!(CandlePattern::ShootingStar.detect(&shape, Trend::Up));
        assert!(!CandlePattern::InvertedHammer.detect(&shape, Trend::Up));
        assert!(!CandlePattern::ShootingStar.detect(&shape, Trend::Down));
    }

    #[test]
    fn a_spinning_top_is_not_a_hammer() {
        // Small body, but shadows on both sides: indecision, not a pin bar.
        let spinning_top = [candle(dec!(100), dec!(110), dec!(90), dec!(101))];
        assert!(!CandlePattern::Hammer.detect(&spinning_top, Trend::Down));
        assert!(!CandlePattern::InvertedHammer.detect(&spinning_top, Trend::Down));
    }

    #[test]
    fn a_flat_candle_matches_nothing() {
        let flat = [candle(dec!(100), dec!(100), dec!(100), dec!(100))];
        assert!(!CandlePattern::Hammer.detect(&flat, Trend::Down));
        assert!(!CandlePattern::InvertedHammer.detect(&flat, Trend::Down));
        assert!(!CandlePattern::ShootingStar.detect(&flat, Trend::Up));
        assert!(!CandlePattern::HangingMan.detect(&flat, Trend::Up));
    }

    #[test]
    fn engulfing_needs_the_body_to_cover_the_one_before() {
        let bullish = [
            candle(dec!(105), dec!(106), dec!(99), dec!(100)),
            candle(dec!(99), dec!(107), dec!(98), dec!(106)),
        ];
        assert!(CandlePattern::BullishEngulfing.detect(&bullish, Trend::Down));
        assert!(!CandlePattern::BearishEngulfing.detect(&bullish, Trend::Down));

        // One tick short of covering the prior body is not an engulfing.
        let short = [
            candle(dec!(105), dec!(106), dec!(99), dec!(100)),
            candle(dec!(100), dec!(107), dec!(99), dec!(104)),
        ];
        assert!(!CandlePattern::BullishEngulfing.detect(&short, Trend::Down));
    }

    #[test]
    fn bearish_engulfing_is_the_mirror() {
        let bearish = [
            candle(dec!(100), dec!(106), dec!(99), dec!(105)),
            candle(dec!(106), dec!(107), dec!(98), dec!(99)),
        ];
        assert!(CandlePattern::BearishEngulfing.detect(&bearish, Trend::Up));
        assert!(!CandlePattern::BullishEngulfing.detect(&bearish, Trend::Up));
    }

    #[test]
    fn piercing_stops_short_of_the_prior_open() {
        let piercing = [
            candle(dec!(110), dec!(111), dec!(100), dec!(101)),
            candle(dec!(99), dec!(108), dec!(98), dec!(107)),
        ];
        assert!(CandlePattern::PiercingLine.detect(&piercing, Trend::Down));

        // Closing past the prior open is an engulfing, and must not also report
        // as a piercing -- two names for one candle is how a rule fires twice.
        let past_open = [
            candle(dec!(110), dec!(111), dec!(100), dec!(101)),
            candle(dec!(99), dec!(112), dec!(98), dec!(111)),
        ];
        assert!(!CandlePattern::PiercingLine.detect(&past_open, Trend::Down));
    }

    #[test]
    fn dark_cloud_cover_is_the_mirror_of_piercing() {
        let dark = [
            candle(dec!(100), dec!(110), dec!(99), dec!(109)),
            candle(dec!(111), dec!(112), dec!(101), dec!(102)),
        ];
        assert!(CandlePattern::DarkCloudCover.detect(&dark, Trend::Up));
    }

    #[test]
    fn harami_sits_inside_the_body_before_it() {
        let bullish = [
            candle(dec!(110), dec!(111), dec!(99), dec!(100)),
            candle(dec!(103), dec!(108), dec!(102), dec!(106)),
        ];
        assert!(CandlePattern::BullishHarami.detect(&bullish, Trend::Down));

        // Touching the prior body's edge is not inside it.
        let touching = [
            candle(dec!(110), dec!(111), dec!(99), dec!(100)),
            candle(dec!(100), dec!(108), dec!(99), dec!(106)),
        ];
        assert!(!CandlePattern::BullishHarami.detect(&touching, Trend::Down));
    }

    #[test]
    fn morning_star_needs_a_small_middle_and_a_recovery_past_the_midpoint() {
        let star = [
            candle(dec!(110), dec!(111), dec!(99), dec!(100)),
            candle(dec!(98), dec!(99), dec!(96), dec!(97)),
            candle(dec!(99), dec!(108), dec!(98), dec!(107)),
        ];
        assert!(CandlePattern::MorningStar.detect(&star, Trend::Down));

        // A third candle that recovers only to below the first body's midpoint
        // has not reversed anything.
        let weak = [
            candle(dec!(110), dec!(111), dec!(99), dec!(100)),
            candle(dec!(98), dec!(99), dec!(96), dec!(97)),
            candle(dec!(99), dec!(103), dec!(98), dec!(102)),
        ];
        assert!(!CandlePattern::MorningStar.detect(&weak, Trend::Down));
    }

    #[test]
    fn evening_star_is_the_mirror() {
        let star = [
            candle(dec!(100), dec!(111), dec!(99), dec!(110)),
            candle(dec!(112), dec!(114), dec!(111), dec!(113)),
            candle(dec!(111), dec!(112), dec!(101), dec!(102)),
        ];
        assert!(CandlePattern::EveningStar.detect(&star, Trend::Up));
    }

    #[test]
    fn three_white_soldiers_march_and_overlap() {
        let soldiers = [
            candle(dec!(100), dec!(110), dec!(99), dec!(109)),
            candle(dec!(105), dec!(116), dec!(104), dec!(115)),
            candle(dec!(111), dec!(122), dec!(110), dec!(121)),
        ];
        assert!(CandlePattern::ThreeWhiteSoldiers.detect(&soldiers, Trend::Up));

        // A gap up breaks the march: the third opens above the second's body.
        let gapped = [
            candle(dec!(100), dec!(110), dec!(99), dec!(109)),
            candle(dec!(105), dec!(116), dec!(104), dec!(115)),
            candle(dec!(118), dec!(129), dec!(117), dec!(128)),
        ];
        assert!(!CandlePattern::ThreeWhiteSoldiers.detect(&gapped, Trend::Up));
    }

    #[test]
    fn three_black_crows_are_the_mirror() {
        let crows = [
            candle(dec!(120), dec!(121), dec!(110), dec!(111)),
            candle(dec!(115), dec!(116), dec!(105), dec!(106)),
            candle(dec!(110), dec!(111), dec!(100), dec!(101)),
        ];
        assert!(CandlePattern::ThreeBlackCrows.detect(&crows, Trend::Down));
    }

    #[test]
    fn a_window_of_the_wrong_length_answers_false_rather_than_panicking() {
        let one = [hammer_candle()];
        assert!(!CandlePattern::MorningStar.detect(&one, Trend::Down));
        assert!(!CandlePattern::BullishEngulfing.detect(&one, Trend::Down));
        assert!(!CandlePattern::Hammer.detect(&[], Trend::Down));
    }

    #[test]
    fn trend_reads_the_direction_of_the_candles_before() {
        assert_eq!(preceding_trend(&downtrend()), Trend::Down);
        assert_eq!(preceding_trend(&uptrend()), Trend::Up);
        assert_eq!(preceding_trend(&[]), Trend::Sideways);
    }

    #[test]
    fn a_range_bound_window_is_sideways_not_a_trend() {
        let chop: Vec<Candle> = (0..TREND_LOOKBACK)
            .map(|i| {
                let drift = Decimal::from(i as i64 % 2);
                candle(
                    dec!(100) + drift,
                    dec!(110),
                    dec!(90),
                    dec!(100) + drift,
                )
            })
            .collect();
        assert_eq!(preceding_trend(&chop), Trend::Sideways);
    }

    #[test]
    fn warmup_covers_the_trend_lookback_only_where_trend_decides_the_name() {
        assert_eq!(
            CandlePattern::Hammer.warmup_candles(),
            1 + TREND_LOOKBACK as u32
        );
        assert_eq!(CandlePattern::BullishEngulfing.warmup_candles(), 2);
        assert_eq!(CandlePattern::MorningStar.warmup_candles(), 3);
    }

    #[test]
    fn an_unknown_pattern_name_is_refused_by_name() {
        let ok: Result<CandlePattern, _> = serde_json::from_str("\"hammer\"");
        assert_eq!(ok.unwrap(), CandlePattern::Hammer);

        let typo: Result<CandlePattern, _> = serde_json::from_str("\"hamer\"");
        assert!(typo.is_err(), "a near-miss must not match something close by");

        let camel: Result<CandlePattern, _> = serde_json::from_str("\"morningStar\"");
        assert!(camel.is_err(), "only snake_case ids are accepted");
    }
}
