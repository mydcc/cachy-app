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

import { describe, it, expect } from "vitest";
import {
  MAX_FEED_AGE_MS,
  feedsNamedBy,
  freshReadings,
  unavailableVetoFeeds,
  withoutVeto,
  type FeedReading,
} from "./feedReadings";
import type { Condition, RuleDocument } from "./types";

const NOW_MS = 1_770_000_000_000;

function reading(overrides: Partial<FeedReading> = {}): FeedReading {
  return {
    feed: "funding_rate",
    source: "bitunix:funding_rate/batch",
    value: "0.0004",
    asOfMs: NOW_MS,
    ...overrides,
  };
}

const priceAbove100: Condition = {
  kind: "compare",
  left: { kind: "price", field: "close" },
  op: "gt",
  right: { kind: "constant", value: "100" },
  timeframe: "4h",
};

function ruleWith(veto?: Condition): RuleDocument {
  const rule: RuleDocument = {
    schema_version: 1,
    id: "rule-1",
    name: "funding guard",
    symbol: "BTCUSDT",
    trigger_timeframe: "4h",
    conditions: priceAbove100,
    action: { consequence_level: "notify" },
    provenance: { source: "human", created_at_ms: NOW_MS },
  };
  return veto === undefined ? rule : { ...rule, veto };
}

const fundingVeto: Condition = {
  kind: "external_feed",
  feed: "funding_rate",
  op: "gt",
  value: "0.01",
};

/** What the engine ends up putting into `EvaluationContext.feeds`. */
function valuesOf(readings: readonly FeedReading[], nowMs: number): Record<string, string> {
  return Object.fromEntries(freshReadings(readings, nowMs).map((r) => [r.feed, r.value]));
}

describe("freshReadings", () => {
  it("passes a reading that is inside its feed's age limit", () => {
    const values = valuesOf([reading({ asOfMs: NOW_MS - 1000 })], NOW_MS);

    expect(values).toEqual({ funding_rate: "0.0004" });
  });

  it("leaves out a reading past its age limit rather than passing it as a value", () => {
    const tooOld = NOW_MS - MAX_FEED_AGE_MS.funding_rate - 1;

    expect(valuesOf([reading({ asOfMs: tooOld })], NOW_MS)).toEqual({});
  });

  it("leaves out a reading dated further ahead than its own age limit", () => {
    const skewed = NOW_MS + MAX_FEED_AGE_MS.funding_rate + 1;

    expect(valuesOf([reading({ asOfMs: skewed })], NOW_MS)).toEqual({});
  });

  it("holds each feed to its own age limit", () => {
    const age = MAX_FEED_AGE_MS.funding_rate + 1;
    const readings = [
      reading({ asOfMs: NOW_MS - age }),
      reading({ feed: "fear_greed", value: "18", asOfMs: NOW_MS - age }),
    ];

    expect(valuesOf(readings, NOW_MS)).toEqual({ fear_greed: "18" });
  });

  it("keeps the source and the timestamp a suppression record has to cite", () => {
    const fresh = reading({ asOfMs: NOW_MS - 1000 });

    expect(freshReadings([fresh], NOW_MS)).toEqual([fresh]);
  });

  it("takes the newest reading when one feed is supplied twice", () => {
    const readings = [
      reading({ value: "0.0001", asOfMs: NOW_MS - 2000 }),
      reading({ value: "0.0009", asOfMs: NOW_MS - 1000 }),
    ];

    expect(valuesOf(readings, NOW_MS)).toEqual({ funding_rate: "0.0009" });
  });
});

describe("feedsNamedBy", () => {
  it("names the feed a bare leaf reads", () => {
    expect(feedsNamedBy(fundingVeto)).toEqual(["funding_rate"]);
  });

  it("names every feed a nested group reads, once each", () => {
    const veto: Condition = {
      kind: "group",
      op: "any",
      of: [
        fundingVeto,
        {
          kind: "group",
          op: "all",
          of: [
            { kind: "external_feed", feed: "fear_greed", op: "lt", value: "20" },
            fundingVeto,
            { kind: "position", side: "long", open: true },
          ],
        },
      ],
    };

    expect([...feedsNamedBy(veto)].sort()).toEqual(["fear_greed", "funding_rate"]);
  });

  it("names nothing for a condition tree that reads no feed", () => {
    expect(feedsNamedBy({ kind: "position", side: "long", open: false })).toEqual([]);
  });
});

describe("unavailableVetoFeeds", () => {
  it("reports the feed a veto reads but nothing supplies", () => {
    expect(unavailableVetoFeeds(ruleWith(fundingVeto), {})).toEqual(["funding_rate"]);
  });

  it("reports nothing when every feed the veto reads has a value", () => {
    expect(unavailableVetoFeeds(ruleWith(fundingVeto), { funding_rate: "0.0004" })).toEqual([]);
  });

  it("treats a feed id no source can supply as unavailable", () => {
    const veto: Condition = {
      kind: "external_feed",
      feed: "liquidation_heatmap",
      op: "gt",
      value: "0.9",
    };

    expect(unavailableVetoFeeds(ruleWith(veto), { funding_rate: "0.0004" })).toEqual([
      "liquidation_heatmap",
    ]);
  });

  it("reports nothing for a rule that has no veto at all", () => {
    expect(unavailableVetoFeeds(ruleWith(), {})).toEqual([]);
  });

  it("ignores a feed named outside the veto", () => {
    const rule: RuleDocument = { ...ruleWith(), conditions: fundingVeto };

    expect(unavailableVetoFeeds(rule, {})).toEqual([]);
  });
});

describe("withoutVeto", () => {
  it("returns a document the core can answer, leaving the original untouched", () => {
    const rule = ruleWith(fundingVeto);

    const dropped = withoutVeto(rule);

    expect("veto" in dropped).toBe(false);
    expect(rule.veto).toEqual(fundingVeto);
    expect(dropped.id).toBe(rule.id);
    expect(dropped.conditions).toEqual(rule.conditions);
  });
});
