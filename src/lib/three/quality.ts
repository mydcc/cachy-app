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

/**
 * Adaptive visual-quality policy for the WebGL layer.
 *
 * All five renderers currently hard-code `Math.min(devicePixelRatio, 2)`. On
 * a weak GPU (or a 3x phone) that is four to nine times the pixels of DPR 1,
 * so the background stutters. This module holds the pure policy; the
 * `qualityController` does the frame sampling and the renderers apply the
 * resolved pixel ratio.
 *
 * Tier changes are hysteretic: a downshift reacts immediately once the moving
 * average crosses `downshiftMs`, an upshift only below the lower `upshiftMs`,
 * and a cooldown keeps the two from ping-ponging on a borderline GPU.
 */

/** The persisted user choice; `auto` delegates to the frame sampler. */
export type VisualQuality = "auto" | "high" | "balanced" | "low";

export type ConcreteQuality = Exclude<VisualQuality, "auto">;

export const VISUAL_QUALITY_VALUES: readonly VisualQuality[] = [
  "auto",
  "high",
  "balanced",
  "low",
];

/** Ordered from cheapest to most expensive — the hysteresis walks this axis. */
const ORDER: readonly ConcreteQuality[] = ["low", "balanced", "high"];

const PIXEL_RATIO_CAPS: Record<ConcreteQuality, number> = {
  high: 2,
  balanced: 1.25,
  low: 1,
};

export interface QualityThresholds {
  /** Sustained frame time above this degrades one tier. */
  downshiftMs: number;
  /** Sustained frame time below this upgrades one tier. */
  upshiftMs: number;
  /** Minimum time between two tier changes. */
  cooldownMs: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  downshiftMs: 22, // ~45 fps
  upshiftMs: 13, // ~77 fps
  cooldownMs: 5000,
};

/** The pixel-ratio ceiling a concrete tier allows. */
export function pixelRatioCapFor(tier: ConcreteQuality): number {
  return PIXEL_RATIO_CAPS[tier] ?? PIXEL_RATIO_CAPS.balanced;
}

/** The ratio to hand to `renderer.setPixelRatio` for a tier and device. */
export function effectivePixelRatio(tier: ConcreteQuality, dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, pixelRatioCapFor(tier));
}

/**
 * Next tier for a frame-time average. Returns `current` while the cooldown is
 * active or the average sits between the two thresholds.
 */
export function nextQualityTier(
  current: ConcreteQuality,
  avgFrameMs: number,
  elapsedSinceChangeMs: number,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): ConcreteQuality {
  if (!Number.isFinite(avgFrameMs) || avgFrameMs <= 0) return current;
  if (elapsedSinceChangeMs < thresholds.cooldownMs) return current;

  const index = ORDER.indexOf(current);
  if (avgFrameMs > thresholds.downshiftMs) return ORDER[Math.max(0, index - 1)];
  if (avgFrameMs < thresholds.upshiftMs) return ORDER[Math.min(ORDER.length - 1, index + 1)];
  return current;
}

/** Coerce a persisted/unknown value to a known tier. */
export function normalizeQuality(value: unknown): VisualQuality {
  return VISUAL_QUALITY_VALUES.includes(value as VisualQuality)
    ? (value as VisualQuality)
    : "auto";
}
