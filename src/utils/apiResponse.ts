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

import { json } from "@sveltejs/kit";
import { upstreamErrorStatus } from "./server/fetchWithTimeout";

/**
 * Reads the venue's own diagnosis off an error raised by a venue adapter.
 *
 * `ExchangeError.venueCode` is set when the venue answered with a readable
 * envelope — which is the only case where the code and message mean anything.
 * Returns undefined for every other error, including a plain `Error` and a
 * network failure, so the caller falls through to the ordinary mapping.
 */
interface VenueRejection {
  venueCode: string;
  venueMessage: string;
}

function venueRejection(e: unknown): VenueRejection | undefined {
  if (!e || typeof e !== "object" || !("venueCode" in e)) return undefined;
  const { venueCode, venueMessage } = e as {
    venueCode?: unknown;
    venueMessage?: unknown;
  };
  if (typeof venueCode !== "string" || venueCode === "") return undefined;
  return {
    venueCode,
    venueMessage: typeof venueMessage === "string" ? venueMessage : "",
  };
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard Success Response
 * { success: true, data: ... }
 */
export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return json({ success: true, data }, init);
}

/**
 * Standard Error Response
 * { success: false, error: { code, message, details } }
 */
export function jsonError(
  message: string,
  code: string = "INTERNAL_ERROR",
  status: number = 500,
  details?: unknown
) {
  return json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

/**
 * Maps common error types to standard JSON responses
 */
export function handleApiError(e: unknown) {
  const message = e instanceof Error ? e.message : String(e);

  if (message.includes("Validation Error") || message.includes("Zod")) {
    return jsonError(message, "VALIDATION_ERROR", 400);
  }

  if (message.includes("Unauthorized") || message.includes("401")) {
    return jsonError("Unauthorized", "AUTH_ERROR", 401);
  }

  // A venue rejection is not an internal fault, and must not be reported as
  // one. Bitget pairs a business error with a 4xx — `30032` V1 decommissioned,
  // `40085` UTA account on a Classic path, `400172` parameter verification —
  // so before this branch the venue's own diagnosis arrived as a bare string
  // and every one of them collapsed into an opaque 500, indistinguishable from
  // a bug in Cachy. 502 says "the exchange refused" and hands the venue's code
  // and message through, so the client can tell a refusal from a bad request
  // and a support log carries the reason.
  //
  // This must precede the upstreamStatus branch below: a venue error also
  // carries the venue's HTTP status, and 4xx is not the right thing to hand a
  // browser for a request Cachy itself got wrong at the exchange.
  const venue = venueRejection(e);
  if (venue) {
    return jsonError(message, "UPSTREAM_REJECTED", 502, venue);
  }

  // Errors carrying an upstream HTTP status (e.g. the 504 a hung exchange
  // fetch produces via fetchWithTimeout) keep their status instead of
  // collapsing into a blanket 500.
  const upstreamStatus = upstreamErrorStatus(e);
  if (upstreamStatus !== undefined) {
    return jsonError(
      message,
      upstreamStatus === 504 ? "UPSTREAM_TIMEOUT" : "UPSTREAM_ERROR",
      upstreamStatus,
    );
  }

  console.error("API Error:", e);
  return jsonError(message, "INTERNAL_ERROR", 500);
}
