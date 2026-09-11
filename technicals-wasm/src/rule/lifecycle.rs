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

//! Per-rule lifecycle: how often it announces, until when, on which channels,
//! and the note saying why it was armed.
//!
//! None of this is part of what the rule *means*. Two rules that differ only in
//! how loudly they announce themselves are the same strategy, and
//! [`super::document::EXCLUDED_FROM_HASH`] says so. What lives here is the
//! difference between an alarm a trader keeps and one they mute.
//!
//! Kept out of `evaluate` proper because that function is pure by design — it
//! reads no clock and holds no state. Frequency and expiry both need those, so
//! they arrive as arguments ([`RuleState`], and the anchor candle's close
//! instant) rather than being read from the environment. A backtest and a live
//! session therefore reach the same verdict from the same inputs.

use serde::{Deserialize, Serialize};

use super::refusal::{RefusalCode, RuleRefusal};

/// The longest a note may be, in characters.
///
/// Class A free text that is rendered into an OS notification and into Manage.
/// Bounded so a paste of a whole trading plan cannot make a rule unreadable in
/// either surface, or bloat every document that carries one.
pub const NOTE_MAX_CHARS: usize = 280;

/// How often an armed rule is allowed to announce itself.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TriggerFrequency {
    /// Fire once, then disarm. The behaviour every rule had before this field
    /// existed, and therefore the default a migrated document lands on.
    #[default]
    Once,
    /// Fire on every evaluation whose conditions hold. A support level a trader
    /// wants to hear about every time it is touched.
    EveryTime,
    /// Fire at most once per closed **trigger** candle.
    ///
    /// The trigger timeframe, explicitly — a rule reading three timeframes has
    /// three candidate answers and this is the one that matches how the rule is
    /// evaluated at all: `evaluate` anchors on the trigger timeframe's last
    /// closed candle, so that is the candle a frequency limit can be counted
    /// against without inventing a second notion of "now".
    OncePerCandleClose,
}

/// A channel a trigger is announced on.
///
/// Only the channels that exist. `Sound` is named because
/// [`FEAT-0392`](../../../docs/backlog/features/FEAT-0392-notification-sound-channel.md)
/// is the next item and the shape is known; external channels are deliberately
/// absent, because FEAT-0397 has three unresolved constraints and a schema
/// invented for a feature that may not ship in that shape is a migration owed
/// for nothing.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum TriggerMethod {
    /// The in-app toast. Always available, needs no permission.
    InApp,
    /// The OS notification, subject to browser permission.
    Browser,
    /// An audible cue. Owned by FEAT-0392.
    Sound,
}

/// Whether a rule may still announce itself, and why not when it may not.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Announce {
    /// Announce it.
    Yes,
    /// The validity period has passed. The rule expires **without** firing —
    /// distinct from having fired, because a trader reading Manage needs to
    /// know the setup lapsed rather than triggered.
    Expired,
    /// Conditions held, but the frequency has already been spent.
    AlreadyAnnounced,
}

/// What a rule has already done, supplied by the caller that owns the store.
///
/// Passed in rather than held here so that evaluation stays a pure function of
/// its inputs: the same document, market and state give the same answer in a
/// backtest, in a test, and on a live session.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RuleState {
    /// How many times this rule has announced. Zero for a freshly armed rule.
    #[serde(default)]
    pub fired_count: u32,
    /// The close instant of the trigger candle the last announcement was
    /// anchored on. `None` until the first announcement.
    #[serde(default)]
    pub last_fired_anchor_ms: Option<i64>,
}

impl RuleState {
    /// The state after announcing on the candle closing at `anchor_close_ms`.
    ///
    /// Returns a new value rather than mutating: the caller owns the store, and
    /// a rule's history is not this module's to edit in place.
    #[must_use]
    pub fn after_firing(self, anchor_close_ms: i64) -> Self {
        Self {
            fired_count: self.fired_count.saturating_add(1),
            last_fired_anchor_ms: Some(anchor_close_ms),
        }
    }
}

/// Whether a rule whose conditions hold may announce on this candle.
///
/// `anchor_close_ms` is the close instant of the trigger candle being evaluated
/// — not a wall clock. Expiry is therefore decided by the candle the rule would
/// fire on, which keeps a replay of yesterday's candles reaching yesterday's
/// answer instead of expiring everything against today's date.
pub fn may_announce(
    frequency: TriggerFrequency,
    valid_until_ms: Option<i64>,
    state: RuleState,
    anchor_close_ms: i64,
) -> Announce {
    // Expiry is checked first and independently of the frequency: a lapsed rule
    // is lapsed whether or not it had budget left to fire.
    if let Some(until) = valid_until_ms {
        if anchor_close_ms > until {
            return Announce::Expired;
        }
    }

    match frequency {
        TriggerFrequency::EveryTime => Announce::Yes,
        TriggerFrequency::Once => {
            if state.fired_count == 0 {
                Announce::Yes
            } else {
                Announce::AlreadyAnnounced
            }
        }
        TriggerFrequency::OncePerCandleClose => match state.last_fired_anchor_ms {
            Some(last) if last == anchor_close_ms => Announce::AlreadyAnnounced,
            _ => Announce::Yes,
        },
    }
}

/// Reject a note that is blank-but-present or longer than [`NOTE_MAX_CHARS`].
///
/// `Some("")` is rejected rather than silently normalised to `None`: a caller
/// that sends an empty string has a bug in its form handling, and swallowing it
/// here means the bug ships.
pub fn validate_note(note: Option<&str>, field: &str, out: &mut Vec<RuleRefusal>) {
    let Some(note) = note else { return };

    if note.trim().is_empty() {
        out.push(RuleRefusal::new(
            RefusalCode::UnknownField,
            field,
            "a note that is present must say something; omit it instead",
        ));
        return;
    }
    // Counted in characters, not bytes: a note in German or with an emoji is
    // not shorter because UTF-8 spends more bytes on it.
    let chars = note.chars().count();
    if chars > NOTE_MAX_CHARS {
        out.push(RuleRefusal::new(
            RefusalCode::UnknownField,
            field,
            format!("note is {chars} characters, the limit is {NOTE_MAX_CHARS}"),
        ));
    }
}

/// Reject a validity period that has already passed at the moment it is set.
///
/// `created_at_ms` rather than a clock read, for the same reason evaluation
/// takes its instant from the anchor candle: a document must validate the same
/// way tomorrow as it does today, or importing a saved rule becomes a lottery.
pub fn validate_validity(
    valid_until_ms: Option<i64>,
    created_at_ms: i64,
    field: &str,
    out: &mut Vec<RuleRefusal>,
) {
    let Some(until) = valid_until_ms else { return };

    if until <= created_at_ms {
        out.push(RuleRefusal::new(
            RefusalCode::UnknownField,
            field,
            "a validity period that ends at or before the rule was authored \
             would expire the rule without it ever being evaluated",
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CANDLE_A: i64 = 1_700_000_000_000;
    const CANDLE_B: i64 = 1_700_000_060_000;

    #[test]
    fn every_time_announces_however_often_it_has_already_fired() {
        let spent = RuleState {
            fired_count: 99,
            last_fired_anchor_ms: Some(CANDLE_A),
        };
        assert_eq!(
            may_announce(TriggerFrequency::EveryTime, None, spent, CANDLE_A),
            Announce::Yes
        );
    }

    #[test]
    fn once_announces_exactly_one_time() {
        let fresh = RuleState::default();
        assert_eq!(
            may_announce(TriggerFrequency::Once, None, fresh, CANDLE_A),
            Announce::Yes
        );

        let after = fresh.after_firing(CANDLE_A);
        assert_eq!(
            may_announce(TriggerFrequency::Once, None, after, CANDLE_B),
            Announce::AlreadyAnnounced,
            "a `once` rule stays spent on a later candle too"
        );
    }

    #[test]
    fn once_per_candle_close_announces_again_on_the_next_candle() {
        let after_a = RuleState::default().after_firing(CANDLE_A);

        assert_eq!(
            may_announce(
                TriggerFrequency::OncePerCandleClose,
                None,
                after_a,
                CANDLE_A
            ),
            Announce::AlreadyAnnounced,
            "the same closed candle must not announce twice"
        );
        assert_eq!(
            may_announce(
                TriggerFrequency::OncePerCandleClose,
                None,
                after_a,
                CANDLE_B
            ),
            Announce::Yes
        );
    }

    #[test]
    fn a_candle_past_the_validity_period_expires_instead_of_announcing() {
        assert_eq!(
            may_announce(
                TriggerFrequency::EveryTime,
                Some(CANDLE_A),
                RuleState::default(),
                CANDLE_B
            ),
            Announce::Expired
        );
    }

    #[test]
    fn the_candle_closing_exactly_at_the_expiry_still_announces() {
        assert_eq!(
            may_announce(
                TriggerFrequency::EveryTime,
                Some(CANDLE_A),
                RuleState::default(),
                CANDLE_A
            ),
            Announce::Yes,
            "the validity period is inclusive of its final instant"
        );
    }

    #[test]
    fn expiry_wins_over_a_frequency_that_still_had_budget() {
        assert_eq!(
            may_announce(
                TriggerFrequency::Once,
                Some(CANDLE_A),
                RuleState::default(),
                CANDLE_B
            ),
            Announce::Expired,
            "a lapsed rule reports as lapsed, not as never-fired"
        );
    }

    #[test]
    fn a_present_but_blank_note_is_refused_rather_than_normalised_away() {
        let mut out = Vec::new();
        validate_note(Some("   "), "note", &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].field, "note");
    }

    #[test]
    fn an_absent_note_is_fine() {
        let mut out = Vec::new();
        validate_note(None, "note", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn a_note_is_measured_in_characters_not_bytes() {
        let mut out = Vec::new();
        // Each 'ä' is two bytes; at the limit in characters it must pass.
        validate_note(Some(&"ä".repeat(NOTE_MAX_CHARS)), "note", &mut out);
        assert!(
            out.is_empty(),
            "{NOTE_MAX_CHARS} characters is the limit, not over it"
        );

        validate_note(Some(&"ä".repeat(NOTE_MAX_CHARS + 1)), "note", &mut out);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn a_validity_period_already_past_at_authoring_is_refused() {
        let mut out = Vec::new();
        validate_validity(Some(CANDLE_A), CANDLE_B, "valid_until_ms", &mut out);
        assert_eq!(out.len(), 1);

        out.clear();
        validate_validity(Some(CANDLE_B), CANDLE_A, "valid_until_ms", &mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn after_firing_returns_a_new_state_and_leaves_the_old_one_alone() {
        let before = RuleState::default();
        let after = before.after_firing(CANDLE_A);

        assert_eq!(before.fired_count, 0, "the caller's value is not mutated");
        assert_eq!(after.fired_count, 1);
        assert_eq!(after.last_fired_anchor_ms, Some(CANDLE_A));
    }

    #[test]
    fn the_default_frequency_is_the_behaviour_rules_had_before_this_field() {
        assert_eq!(TriggerFrequency::default(), TriggerFrequency::Once);
    }
}
