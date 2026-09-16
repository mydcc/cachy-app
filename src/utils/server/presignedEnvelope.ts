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
 * Server-side guard for the pre-signed envelope (FEAT-0405, ADR-0013).
 *
 * A migrated route does not sign. It reads the envelope, rebuilds the bytes the
 * client claims to have signed, compares, and forwards verbatim. The comparison
 * *is* the anti-drift mechanism — a faithful server-side replica of the client
 * serialiser is explicitly not the design, because a replica that drifts is
 * invisible until an order is rejected mid-trade.
 *
 * There is no fallback branch. A migrated route with no valid envelope answers
 * `400`; it never re-signs with a transmitted secret. That is the hard cutover
 * recorded on the item, and the reason this module has no "legacy" path.
 *
 * Nothing here validates `x-api-key` or `x-api-sign` cryptographically. It
 * cannot — the secret is client-side, which is the point. The venue rejects a
 * bad signature; this module only ensures the bytes the client signed are the
 * bytes Cachy forwards, and that no credential rides where it may not.
 */

import { planForRoute, routeTakesPassphrase } from "../exchange/restSigningPlan";

export interface PresignedEnvelope {
  apiKey: string;
  signature: string;
  timestamp: string;
  /** Bitunix only. */
  nonce?: string;
  /** The canonical query string that was signed, on query-signed routes. */
  query?: string;
  /** Bitget only, under the ADR-0013 named exception. */
  passphrase?: string;
}

/**
 * Distinct codes on purpose. "No envelope" means an old client or a wiring bug;
 * "divergence" means the two sides disagree about serialisation. They are
 * different incidents and a shared `400` would hide which one is happening.
 */
export const PRESIGNED_ERRORS = {
  MISSING_ENVELOPE: "PRESIGNED_ENVELOPE_MISSING",
  DIVERGENCE: "PRESIGNED_DIVERGENCE",
  UNEXPECTED_PASSPHRASE: "PRESIGNED_UNEXPECTED_PASSPHRASE",
} as const;

function header(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  return value === null || value === "" ? undefined : value;
}

/**
 * Reads the envelope from request headers.
 *
 * Headers only. `extractApiCredentials` also accepts a body fallback, which was
 * the right shape while the secret travelled that way; an envelope in the body
 * would mean the signed bytes and the payload could disagree, so this reader
 * deliberately does not look there.
 *
 * Returns `null` when any of the three mandatory fields is absent, which the
 * caller maps to `PRESIGNED_ERRORS.MISSING_ENVELOPE`.
 */
export function readPresignedEnvelope(request: Request): PresignedEnvelope | null {
  const apiKey = header(request, "x-api-key");
  const signature = header(request, "x-api-sign");
  const timestamp = header(request, "x-api-timestamp");

  if (!apiKey || !signature || !timestamp) return null;

  return {
    apiKey,
    signature,
    timestamp,
    nonce: header(request, "x-api-nonce"),
    query: header(request, "x-api-query"),
    passphrase: header(request, "x-api-passphrase"),
  };
}

export interface PresignedConsistencyInput {
  /** Cachy route, e.g. `/api/orders`. Used to look up the shared plan row. */
  cachyPath: string;
  envelope: PresignedEnvelope;
  /** The server's own rebuild of the signed bytes for this route. */
  rebuilt: string;
  /** Raw request body text. Required for body-signed routes. */
  rawBody?: string;
}

/**
 * Checks the envelope against the server's rebuild and against the route's
 * credential rules. Throws an `Error` carrying a `PRESIGNED_ERRORS` code.
 *
 * On a query-signed route a missing `x-api-query` is a missing envelope, not a
 * divergence: the client never told us what it signed, so there is nothing to
 * compare. Note that this makes an empty query string unrepresentable — a
 * future route that signs no parameters at all needs the header sent as an
 * explicit empty value, which is a deliberate trip rather than an oversight.
 */
export function assertPresignedConsistency(input: PresignedConsistencyInput): void {
  const plan = planForRoute(input.cachyPath);

  // A route absent from the table has not been cut over. Returning quietly
  // rather than throwing keeps the migration incremental: the guard can sit in
  // a route before that route is fully wired, and unmigrated routes are still
  // free to carry a secret until their own PR removes it.
  if (!plan) return;

  if (!routeTakesPassphrase(plan)) {
    const { passphrase } = input.envelope;
    if (passphrase !== undefined) {
      throw new Error(PRESIGNED_ERRORS.UNEXPECTED_PASSPHRASE);
    }
  }

  const sent = plan.signed === "query" ? input.envelope.query : input.rawBody;

  if (sent === undefined) {
    throw new Error(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  }
  if (sent !== input.rebuilt) {
    throw new Error(PRESIGNED_ERRORS.DIVERGENCE);
  }
}
