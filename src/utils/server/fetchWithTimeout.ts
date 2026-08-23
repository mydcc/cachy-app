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
 * Single source of truth for server-side upstream timeouts (BUG-0267).
 *
 * Every outbound fetch to a venue API (Bitunix, Bitget — market data and
 * credentialed trading alike) MUST go through `fetchWithTimeout`. A hanging
 * exchange connection must never hold a request — and the user's credentials
 * captured in its closure scope — indefinitely.
 *
 * Budget rationale: 8s bounds the slowest legitimate exchange response
 * (kline history queries) with headroom, while staying well below typical
 * reverse-proxy/client timeouts so we fail with a typed JSON error instead
 * of a raw gateway 502. If a venue route ever needs a different budget,
 * add a named constant here and document why — do not inline a magic number
 * at the call site.
 */
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000;

/** Error carrying an HTTP status for the route's JSON error response. */
export interface UpstreamApiError extends Error {
  status?: number;
}

/**
 * Bounds an exchange fetch so a slow/unreachable upstream fails fast with a
 * proper typed error instead of hanging forever. On timeout the returned
 * rejection carries `.status = 504`; routes propagate that into their JSON
 * error response via `upstreamErrorStatus`.
 *
 * `fetchImpl` lets SvelteKit routes pass their per-event `fetch` through so
 * request-scoped behaviour (dedup, caching, tracking) is preserved; it
 * defaults to the global fetch used by non-event callers and tests.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_UPSTREAM_TIMEOUT_MS,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      const error = new Error("Upstream exchange API timed out") as UpstreamApiError;
      error.status = 504;
      throw error;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the HTTP status an error carries (if any), so route handlers can
 * respond with the upstream status instead of a blanket 500. Returns
 * `undefined` when the error carries no numeric status.
 */
export function upstreamErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === "object" && "status" in e) {
    const status = (e as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}
