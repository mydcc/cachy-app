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

/**
 * Clock-drift tracker for client-side signing (FEAT-0405, ADR-0013 failure
 * mode 1).
 *
 * Exchanges reject signatures whose timestamp falls outside a short window. A
 * browser clock that is off by more than that window fails every signed
 * request, and the failure is intermittent rather than obvious. This module
 * estimates the offset between the local clock and a trusted time source and
 * hands the corrected time to the signers.
 *
 * Failure policy is **fail open**: with no usable samples this returns
 * `Date.now()`. A self-hosted instance with no observable server time must
 * still trade. An exchange-side "timestamp expired" is a visible, recoverable
 * error the user can act on; a client-side refusal to sign is not, and the user
 * cannot distinguish it from the app being broken.
 *
 * Browser-safe: no `node:*` imports, no SvelteKit-only modules.
 */

export interface DriftSample {
  /** estimated `server - client` offset, in milliseconds. */
  offsetMs: number;
  /** client clock at the moment of the observation. */
  at: number;
}

/** One observation further out than this is treated as corrupt, not as drift. */
export const MAX_SAMPLE_OFFSET_MS = 5 * 60 * 1000;

/** Samples older than this are stale; drift is not assumed to persist. */
export const MAX_SAMPLE_AGE_MS = 10 * 60 * 1000;

/** Below this count there is no median to take, so nothing is trusted. */
export const MIN_SAMPLES = 3;

/** Kept small on purpose: the median exists to drop one bad sample. */
const MAX_SAMPLES = 3;

let samples: DriftSample[] = [];

/**
 * Records a trusted timestamp observed from the server.
 *
 * Sources are the `Date` header of any `/api/*` response and the market
 * WebSocket frame timestamps already flowing through `bitunixWs.ts`. Samples
 * outside `MAX_SAMPLE_OFFSET_MS` are dropped rather than stored — a one-second
 * misparsed unit is a corrupt reading, not a clock that jumped five minutes.
 */
export function observeServerTime(epochMs: number, clientNow: number = Date.now()): void {
  if (!Number.isFinite(epochMs)) return;

  const offsetMs = epochMs - clientNow;
  if (Math.abs(offsetMs) > MAX_SAMPLE_OFFSET_MS) return;

  samples.push({ offsetMs, at: clientNow });
  if (samples.length > MAX_SAMPLES) {
    samples = samples.slice(-MAX_SAMPLES);
  }
}

/**
 * The current time with any known drift applied.
 *
 * Returns the raw client clock when fewer than `MIN_SAMPLES` observations
 * exist or when the newest is stale — see the fail-open note above. The median
 * of the retained samples is used so that a single outlier cannot move the
 * result; with `MAX_SAMPLES` at 3, two consistent readings outvote one.
 */
export function correctedNow(clientNow: number = Date.now()): number {
  if (samples.length < MIN_SAMPLES) return clientNow;

  const newest = samples[samples.length - 1];
  if (clientNow - newest.at > MAX_SAMPLE_AGE_MS) return clientNow;

  const offsets = samples.map((sample) => sample.offsetMs).sort((a, b) => a - b);
  const median = offsets[Math.floor(offsets.length / 2)];

  return clientNow + median;
}

/** Current drift state, for diagnostics and tests. Defensive copy. */
export function getClockDrift(): { offsetMs: number; sampleCount: number } {
  if (samples.length === 0) return { offsetMs: 0, sampleCount: 0 };

  const offsets = samples.map((sample) => sample.offsetMs).sort((a, b) => a - b);
  return {
    offsetMs: offsets[Math.floor(offsets.length / 2)],
    sampleCount: samples.length,
  };
}

/** Drops all observations. Called on account switch and between tests. */
export function resetClockDrift(): void {
  samples = [];
}
