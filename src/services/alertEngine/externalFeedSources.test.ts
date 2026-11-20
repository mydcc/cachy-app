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
 * FEAT-0816 — the open-interest change is derived from samples this session
 * took, because nobody publishes a replayable history of it. These are the
 * claims that derivation makes.
 */

import { describe, it, expect, vi } from "vitest";
import {
  OI_MAX_SPAN_MS,
  OI_MIN_SPAN_MS,
  openInterestChangePercent,
  type OpenInterestSample,
} from "./externalFeedSources";

vi.mock("$app/env", () => ({ browser: true, dev: false }));
vi.mock("../logger", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const NOW_MS = 1_770_000_000_000;

function sample(ageMs: number, size: string): OpenInterestSample {
  return { asOfMs: NOW_MS - ageMs, size };
}

describe("openInterestChangePercent", () => {
  it("reports nothing from a single sample", () => {
    expect(openInterestChangePercent([sample(0, "1000")])).toBeUndefined();
  });

  it("reports nothing until two samples span the minimum window", () => {
    const samples = [sample(OI_MIN_SPAN_MS - 1000, "1000"), sample(0, "1100")];

    expect(openInterestChangePercent(samples)).toBeUndefined();
  });

  it("gives the change in percent once the span is wide enough", () => {
    const samples = [sample(OI_MIN_SPAN_MS, "1000"), sample(0, "1100")];

    expect(openInterestChangePercent(samples)?.value).toBe("10");
  });

  it("reads a fall as a negative percentage", () => {
    const samples = [sample(OI_MIN_SPAN_MS, "1000"), sample(0, "750")];

    expect(openInterestChangePercent(samples)?.value).toBe("-25");
  });

  it("measures against the newest sample that is already old enough", () => {
    const samples = [
      sample(OI_MAX_SPAN_MS, "500"),
      sample(OI_MIN_SPAN_MS, "1000"),
      sample(0, "1100"),
    ];

    // Against the half-hour-old 1000, not the two-hour-old 500: the number is
    // about the recent move, not about the whole retention window.
    expect(openInterestChangePercent(samples)?.value).toBe("10");
  });

  it("ignores a reference older than the window it is allowed to span", () => {
    const samples = [sample(OI_MAX_SPAN_MS + 1000, "1000"), sample(0, "1100")];

    expect(openInterestChangePercent(samples)).toBeUndefined();
  });

  it("refuses a zero reference instead of dividing by it", () => {
    const samples = [sample(OI_MIN_SPAN_MS, "0"), sample(0, "1100")];

    expect(openInterestChangePercent(samples)).toBeUndefined();
  });

  it("refuses an unreadable size rather than reporting a calm market", () => {
    const samples = [sample(OI_MIN_SPAN_MS, "1000"), sample(0, "not-a-number")];

    expect(openInterestChangePercent(samples)).toBeUndefined();
  });

  it("dates the reading at the newest sample, not at the moment it was computed", () => {
    const newest = sample(90_000, "1100");
    const samples = [sample(OI_MIN_SPAN_MS + 90_000, "1000"), newest];

    expect(openInterestChangePercent(samples)?.asOfMs).toBe(newest.asOfMs);
  });

  it("does not depend on the order the samples arrived in", () => {
    const older = sample(OI_MIN_SPAN_MS, "1000");
    const newer = sample(0, "1100");

    expect(openInterestChangePercent([newer, older])).toEqual(
      openInterestChangePercent([older, newer]),
    );
  });

  it("keeps full precision rather than rounding a small move away", () => {
    const samples = [sample(OI_MIN_SPAN_MS, "1000000"), sample(0, "1000001")];

    expect(openInterestChangePercent(samples)?.value).toBe("0.0001");
  });
});
