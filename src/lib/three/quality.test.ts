/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
  pixelRatioCapFor,
  effectivePixelRatio,
  nextQualityTier,
  normalizeQuality,
  DEFAULT_QUALITY_THRESHOLDS,
} from "./quality";

const PAST_COOLDOWN = DEFAULT_QUALITY_THRESHOLDS.cooldownMs + 1;

describe("pixelRatioCapFor", () => {
  it("maps each tier to its ceiling", () => {
    expect(pixelRatioCapFor("high")).toBe(2);
    expect(pixelRatioCapFor("balanced")).toBe(1.25);
    expect(pixelRatioCapFor("low")).toBe(1);
  });
});

describe("effectivePixelRatio", () => {
  it("caps a high-DPR display", () => {
    expect(effectivePixelRatio("high", 3)).toBe(2);
    expect(effectivePixelRatio("balanced", 3)).toBe(1.25);
    expect(effectivePixelRatio("low", 3)).toBe(1);
  });

  it("never exceeds the device ratio", () => {
    expect(effectivePixelRatio("high", 1)).toBe(1);
    expect(effectivePixelRatio("balanced", 1)).toBe(1);
  });

  it("falls back to 1 for a missing/invalid ratio", () => {
    expect(effectivePixelRatio("high", Number.NaN)).toBe(1);
    expect(effectivePixelRatio("high", 0)).toBe(1);
  });
});

describe("nextQualityTier", () => {
  it("degrades one tier when frames are slow", () => {
    expect(nextQualityTier("high", 30, PAST_COOLDOWN)).toBe("balanced");
    expect(nextQualityTier("balanced", 30, PAST_COOLDOWN)).toBe("low");
  });

  it("does not degrade past the lowest tier", () => {
    expect(nextQualityTier("low", 30, PAST_COOLDOWN)).toBe("low");
  });

  it("upgrades one tier when frames are fast", () => {
    expect(nextQualityTier("low", 10, PAST_COOLDOWN)).toBe("balanced");
    expect(nextQualityTier("balanced", 10, PAST_COOLDOWN)).toBe("high");
  });

  it("does not upgrade past the highest tier", () => {
    expect(nextQualityTier("high", 10, PAST_COOLDOWN)).toBe("high");
  });

  it("stays put inside the hysteresis band", () => {
    expect(nextQualityTier("balanced", 18, PAST_COOLDOWN)).toBe("balanced");
  });

  it("recovers on a 60 Hz panel after a downshift", () => {
    // 16.7 ms is the vsync floor; a fixed 13 ms gate could never clear it.
    expect(nextQualityTier("low", 16.7, PAST_COOLDOWN, DEFAULT_QUALITY_THRESHOLDS, 16.7)).toBe(
      "balanced",
    );
  });

  it("does not upgrade while frames sit above the scaled gate", () => {
    expect(nextQualityTier("low", 20, PAST_COOLDOWN, DEFAULT_QUALITY_THRESHOLDS, 16.7)).toBe("low");
  });

  it("keeps the fixed gate when the cadence is unknown", () => {
    expect(nextQualityTier("low", 10, PAST_COOLDOWN)).toBe("balanced");
  });

  it("does not ping-pong on a 30 Hz panel", () => {
    // refreshMs 33.3 would scale the gate to ~38; it is clamped under downshift.
    expect(nextQualityTier("low", 33.3, PAST_COOLDOWN, DEFAULT_QUALITY_THRESHOLDS, 33.3)).toBe(
      "low",
    );
  });

  it("stays put during the cooldown", () => {
    expect(nextQualityTier("high", 40, 10)).toBe("high");
  });

  it("ignores a non-finite average", () => {
    expect(nextQualityTier("balanced", Number.NaN, PAST_COOLDOWN)).toBe("balanced");
    expect(nextQualityTier("balanced", 0, PAST_COOLDOWN)).toBe("balanced");
  });
});

describe("normalizeQuality", () => {
  it("keeps known values", () => {
    expect(normalizeQuality("high")).toBe("high");
    expect(normalizeQuality("auto")).toBe("auto");
  });

  it("defaults unknown values to auto", () => {
    expect(normalizeQuality("ultra")).toBe("auto");
    expect(normalizeQuality(undefined)).toBe("auto");
  });
});
