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
 * One jitter contract for every scheduled retry.
 *
 * A fixed backoff makes every client reconnect on the same millisecond, which
 * spikes the venue exactly when it recovers. The factor and the cap order match
 * `src/utils/retryPolicy.ts` (jitter first, cap second), so the documented
 * ceiling stays a ceiling instead of drifting to 1.2× of it.
 */
export function jitteredDelay(delayMs: number, maxDelayMs: number): number {
  const factor = 0.8 + Math.random() * 0.4;
  return Math.min(Math.round(delayMs * factor), maxDelayMs);
}
