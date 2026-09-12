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
 * Main-thread frame sampler for the `auto` visual-quality tier.
 *
 * One sampler serves all renderers on purpose: the main thread's frame cadence
 * already reflects total GPU/CPU pressure, whereas each renderer judging its
 * own context would under-report a saturated GPU (every context looks fine
 * until the compositor cannot keep up). The pure tier policy lives in
 * `lib/three/quality.ts`; this file only measures and exposes it.
 */

import { browser } from "$app/environment";
import { nextQualityTier, type ConcreteQuality, type VisualQuality } from "../../../lib/three/quality";

/** Smoothing factor for the frame-time average. */
const EMA_ALPHA = 0.1;
/** Ignore gaps longer than this (tab switch, GC pause) rather than degrading. */
const MAX_SAMPLE_MS = 250;
/** Slow upward drift for the observed cadence, so a stale floor can recover. */
const REFRESH_DECAY = 0.002;

let tier = $state<ConcreteQuality>("high");
let subscribers = 0;
let rafId = 0;
let last = 0;
let ema = 16.7;
let refreshMs = 0;
let lastChangeAt = 0;

function frame(now: number): void {
  if (last !== 0) {
    const dt = now - last;
    if (dt > 0 && dt < MAX_SAMPLE_MS) {
      ema += (dt - ema) * EMA_ALPHA;
      // Track the fastest observed frame time as the display cadence: snap down
      // on a new minimum, drift up slowly so a stale value can adapt.
      refreshMs = refreshMs === 0 || dt < refreshMs
        ? dt
        : refreshMs + (dt - refreshMs) * REFRESH_DECAY;
    }
  }
  last = now;

  const next = nextQualityTier(tier, ema, now - lastChangeAt, undefined, refreshMs);
  if (next !== tier) {
    tier = next;
    lastChangeAt = now;
  }
  rafId = requestAnimationFrame(frame);
}

/**
 * Start sampling while at least one renderer holds the subscription. Returns
 * the release function (ref-counted, safe to call twice).
 */
export function retainAutoQuality(): () => void {
  if (!browser) return () => {};
  subscribers += 1;
  if (subscribers === 1) {
    last = 0;
    ema = 16.7;
    refreshMs = 0;
    lastChangeAt = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers -= 1;
    if (subscribers === 0 && rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  };
}

/** The concrete tier for a preference; reading it tracks the auto tier. */
export function concreteQuality(preference: VisualQuality): ConcreteQuality {
  return preference === "auto" ? tier : preference;
}
