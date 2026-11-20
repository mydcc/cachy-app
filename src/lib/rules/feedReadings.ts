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
 * FEAT-0816 — what a third-party feed reading is, when it is too old to use,
 * and what the engine does with a veto whose feed nobody can supply.
 *
 * Pure: no clock, no network, no store. The caller passes `nowMs`, so a test
 * can place a reading exactly one millisecond past its limit.
 *
 * The policy these helpers implement is ADR-0029: a reading carries its source
 * and its age (decisions 1 and 2), and a veto that reads an unavailable feed is
 * dropped for that evaluation rather than answered with a stale number
 * (decision 3). The core itself never guesses -- it answers an unreadable veto
 * with `indeterminate` -- so the drop happens here, before the question is
 * asked (decision 4).
 */

import type { ExternalFeedId } from "./externalFeeds";
import type { Condition, DecimalString, RuleDocument } from "./types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** One feed's current value, with where it came from and when it was current. */
export interface FeedReading {
  feed: ExternalFeedId;
  /**
   * Which source produced the number, recorded alongside it so a suppression
   * can be read back years later (ADR-0029 decision 1). Spelled
   * `<provider>:<endpoint>`, e.g. `bitget:mix/market/open-interest`.
   */
  source: string;
  value: DecimalString;
  /** When the source says the value was current, epoch ms. */
  asOfMs: number;
}

/**
 * How old a reading may be before it stops counting as the current value.
 *
 * Each limit follows its source's own publication rhythm, not one global
 * number: funding is a predicted rate that moves continuously, open interest
 * is sampled, and a fear-and-greed aggregate is published once a day -- a
 * twelve-hour limit there would make a perfectly current index unavailable
 * every afternoon.
 */
export const MAX_FEED_AGE_MS: Record<ExternalFeedId, number> = {
  funding_rate: 15 * MINUTE_MS,
  open_interest_change: 10 * MINUTE_MS,
  fear_greed: 26 * HOUR_MS,
};

/**
 * Whether a reading may be used at `nowMs`.
 *
 * A reading dated ahead of `nowMs` is tolerated up to the same limit, because
 * the source's clock is not ours; past that it is as untrustworthy as a stale
 * one and is refused rather than silently accepted.
 */
export function isFresh(reading: FeedReading, nowMs: number): boolean {
  const limit = MAX_FEED_AGE_MS[reading.feed];
  if (limit === undefined) return false;
  const age = nowMs - reading.asOfMs;
  return age <= limit && age >= -limit;
}

/**
 * The usable readings: one per feed, the newest of them, and only while fresh.
 *
 * A stale reading is dropped rather than returned marked, because downstream
 * it becomes a value in `EvaluationContext.feeds`, and inside that map a stale
 * number is indistinguishable from a current one -- the core sees a value, not
 * an age (ADR-0029 decision 2). Dropped means the core reads the feed as
 * unavailable, which is the truth.
 *
 * The readings rather than their values, for the record a suppression keeps:
 * `source` and `asOfMs` are the difference between "funding was 0.012" and
 * "funding was 0.012 according to this endpoint at this moment", and only the
 * second can be checked later (decisions 1 and 6).
 */
export function freshReadings(readings: readonly FeedReading[], nowMs: number): FeedReading[] {
  const newest = new Map<ExternalFeedId, FeedReading>();

  for (const reading of readings) {
    if (!isFresh(reading, nowMs)) continue;
    const previous = newest.get(reading.feed);
    if (previous === undefined || reading.asOfMs > previous.asOfMs) {
      newest.set(reading.feed, reading);
    }
  }

  return [...newest.values()];
}

/**
 * Every feed id a condition tree reads, once each, in the order it meets them.
 *
 * Ids are returned as written, not narrowed to the known ones: a document may
 * carry a feed no source supplies, and that feed is unavailable rather than
 * invisible.
 */
export function feedsNamedBy(condition: Condition | undefined): string[] {
  if (condition === undefined) return [];
  const feeds = new Set<string>();
  collectFeeds(condition, feeds);
  return [...feeds];
}

function collectFeeds(condition: Condition, into: Set<string>): void {
  if (condition.kind === "external_feed") {
    into.add(condition.feed);
    return;
  }
  if (condition.kind === "group") {
    for (const child of condition.of) collectFeeds(child, into);
  }
}

/**
 * The feeds this rule's veto reads that `available` cannot answer.
 *
 * Only the veto is inspected: a feed is refused inside `conditions` and
 * `exits` by the core, so a feed found there is a validation problem and not
 * this function's business.
 */
export function unavailableVetoFeeds(
  rule: RuleDocument,
  available: Readonly<Record<string, DecimalString>>,
): string[] {
  return feedsNamedBy(rule.veto).filter((feed) => available[feed] === undefined);
}

/**
 * The same rule without its veto, as a new document.
 *
 * The whole veto goes, not the feed leaf that could not be read: a group whose
 * feed leaf was removed means something its author never wrote, while "your
 * veto did not apply" is a sentence a trader can act on (ADR-0029 decision 3).
 * The stored document is untouched -- this is what one evaluation is asked, not
 * an edit.
 */
export function withoutVeto(rule: RuleDocument): RuleDocument {
  const { veto: _dropped, ...withNoVeto } = rule;
  return withNoVeto;
}
