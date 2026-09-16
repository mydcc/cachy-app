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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_SAMPLE_AGE_MS,
  MAX_SAMPLE_OFFSET_MS,
  correctedNow,
  getClockDrift,
  observeServerTime,
  resetClockDrift,
} from "./clockDrift";

const CLIENT_NOW = 1_700_000_000_000;

beforeEach(() => {
  resetClockDrift();
});

describe("correctedNow", () => {
  it("returns the raw clock with no observations (fail open)", () => {
    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW);
  });

  it("returns the raw clock below the sample minimum", () => {
    observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);

    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW);
  });

  it("applies the offset once three samples agree", () => {
    for (let i = 0; i < 3; i++) {
      observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    }

    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW + 30_000);
  });

  it("ignores a single outlier in the median", () => {
    observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 6_000, CLIENT_NOW);

    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW + 30_000);
  });

  it("fails open when the newest sample is stale", () => {
    for (let i = 0; i < 3; i++) {
      observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    }

    const later = CLIENT_NOW + MAX_SAMPLE_AGE_MS + 1;
    expect(correctedNow(later)).toBe(later);
  });

  it("still trusts a sample that has not aged past the limit", () => {
    for (let i = 0; i < 3; i++) {
      observeServerTime(CLIENT_NOW + 30_000, CLIENT_NOW);
    }

    const later = CLIENT_NOW + MAX_SAMPLE_AGE_MS;
    expect(correctedNow(later)).toBe(later + 30_000);
  });
});

describe("observeServerTime", () => {
  it("drops a sample outside the plausible-drift window", () => {
    observeServerTime(CLIENT_NOW + MAX_SAMPLE_OFFSET_MS + 1, CLIENT_NOW);

    expect(getClockDrift().sampleCount).toBe(0);
  });

  it("keeps a sample exactly at the window edge", () => {
    observeServerTime(CLIENT_NOW + MAX_SAMPLE_OFFSET_MS, CLIENT_NOW);

    expect(getClockDrift().sampleCount).toBe(1);
  });

  it("handles a negative offset", () => {
    for (let i = 0; i < 3; i++) {
      observeServerTime(CLIENT_NOW - 12_000, CLIENT_NOW);
    }

    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW - 12_000);
  });

  it("ignores a non-finite reading", () => {
    observeServerTime(Number.NaN, CLIENT_NOW);

    expect(getClockDrift().sampleCount).toBe(0);
  });

  it("retains only the most recent three samples", () => {
    observeServerTime(CLIENT_NOW + 1_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 2_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 3_000, CLIENT_NOW);
    observeServerTime(CLIENT_NOW + 40_000, CLIENT_NOW);

    expect(getClockDrift().sampleCount).toBe(3);
    expect(correctedNow(CLIENT_NOW)).toBe(CLIENT_NOW + 3_000);
  });
});

describe("getClockDrift", () => {
  it("reports zero with no samples", () => {
    expect(getClockDrift()).toEqual({ offsetMs: 0, sampleCount: 0 });
  });
});
