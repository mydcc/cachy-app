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

/**
 * The third-party feeds a veto can name (FEAT-0814), by the ids FEAT-0816
 * wires into `EvaluationContext.feeds`. One list for the editor and the
 * sentence, so a feed the editor offers is always one the sentence can name.
 *
 * A feed with no fresh reading is unavailable, and FEAT-0816 decided what that
 * means: the veto is dropped for that evaluation and the trader is told
 * (ADR-0029 decision 3). A feed id outside this list has no source at all and
 * is therefore always unavailable; the editor says so.
 */
export const EXTERNAL_FEEDS = ["funding_rate", "open_interest_change", "fear_greed"] as const;

export type ExternalFeedId = (typeof EXTERNAL_FEEDS)[number];

export function isKnownFeed(feed: string): feed is ExternalFeedId {
  return (EXTERNAL_FEEDS as readonly string[]).includes(feed);
}

/** The translation key of a known feed's name. */
export function feedNameKey(feed: ExternalFeedId): string {
  return `rules.sentence.feed.${feed}`;
}
