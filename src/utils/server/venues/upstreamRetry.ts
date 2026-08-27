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


// Bitunix occasionally answers a perfectly valid request with a transient
// 5xx or lets the connection hang. One bounded retry turns those blips into
// success instead of surfacing a 5xx (and an error toast) to the chart.
// BUG-0296: the backoff is staged rather than flat, and 429 responses are
// retried too — honoring Retry-After within a small ceiling so we back off
// when asked instead of hammering through a rate-limit window.
export const UPSTREAM_RETRY_ATTEMPTS = 3;
const UPSTREAM_RETRY_BACKOFF_BASE_MS = 250;
const UPSTREAM_RETRY_BACKOFF_MAX_MS = 2000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableUpstreamStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function upstreamRetryDelayMs(attempt: number): number {
  return Math.min(
    UPSTREAM_RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1),
    UPSTREAM_RETRY_BACKOFF_MAX_MS,
  );
}

/** Numeric `Retry-After` in seconds, clamped to the retry-delay ceiling. */
export function retryAfterHeaderMs(response: Response): number | null {
  const raw = response.headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, UPSTREAM_RETRY_BACKOFF_MAX_MS);
}
