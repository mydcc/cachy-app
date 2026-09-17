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

import {
  cachyAction,
  planForRoute,
  routeTakesNonce,
  routeTakesPassphrase,
  signatureShapeFor,
} from "../exchange/restSigningPlan";

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

  // Read as *present or absent*, not as truthy or not. A route that signs no
  // parameters at all (`/api/sync/positions-pending`) has an empty query string,
  // and an empty string is therefore what its client sends; collapsing that to
  // "absent" would make the empty query unrepresentable and that route
  // unmigratable. Absent still means absent — `null`, not `""`.
  const rawQuery = request.headers.get("x-api-query");

  return {
    apiKey,
    signature,
    timestamp,
    nonce: header(request, "x-api-nonce"),
    query: rawQuery === null ? undefined : rawQuery,
    passphrase: header(request, "x-api-passphrase"),
  };
}

export interface PresignedConsistencyInput {
  /**
   * Cachy route, e.g. `/api/orders`. Used to look up the shared plan row, and —
   * on a route whose shape varies with the action it carries — to resolve that
   * shape from the URL. A caller on such a route passes the URL it received,
   * query string included; every other route passes its bare path.
   */
  cachyPath: string;
  envelope: PresignedEnvelope;
  /** The server's own rebuild of the signed bytes for this route. */
  rebuilt: string;
  /** Raw request body text. Required for body-signed routes. */
  rawBody?: string;
}

/**
 * What `checkPresignedRequest` accepts: everything `assertPresignedConsistency`
 * needs except the envelope, which the request carries and the caller therefore
 * has no way to supply. Split from `PresignedConsistencyInput` rather than
 * making `envelope` optional, so the guard that *does* need it cannot be called
 * without one. A1 shipped with the field required and no caller, which is why
 * the mismatch only surfaced when A3 wired the first route up.
 */
export type PresignedCheckInput = Omit<PresignedConsistencyInput, "envelope">;

/**
 * Checks the envelope against the server's rebuild and against the route's
 * credential rules. Throws an `Error` carrying a `PRESIGNED_ERRORS` code.
 *
 * On a query-signed route a missing `x-api-query` is a missing envelope, not a
 * divergence: the client never told us what it signed, so there is nothing to
 * compare. An empty query string is representable — `readPresignedEnvelope`
 * reads the header as present-or-absent, so an explicit empty value arrives as
 * `""` and only a truly absent header is `undefined`. `/api/sync/positions-pending`
 * signs no parameters at all and proves the path works.
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

  // Checked after the passphrase so that a request carrying a credential this
  // route may not have is reported as that, not as a missing nonce.
  if (routeTakesNonce(plan) && input.envelope.nonce === undefined) {
    throw new Error(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  }

  const shape = signatureShapeFor(plan, cachyAction(input.cachyPath));
  const sent = shape === "query" ? input.envelope.query : input.rawBody;

  if (sent === undefined) {
    throw new Error(PRESIGNED_ERRORS.MISSING_ENVELOPE);
  }
  if (sent !== input.rebuilt) {
    throw new Error(PRESIGNED_ERRORS.DIVERGENCE);
  }
}

/** A request that may proceed, and the envelope the route forwards upstream. */
export type PresignedCheck =
  | { ok: true; envelope: PresignedEnvelope }
  | { ok: false; code: string };

/**
 * Reads the envelope and checks it against the server's rebuild in one step,
 * reporting a `PRESIGNED_ERRORS` code instead of throwing.
 *
 * The route handlers share this so that "no envelope" and "divergent bytes"
 * cannot be mapped to different statuses on different routes — a migrated route
 * answers `400` and never falls back to signing with a transmitted secret.
 */
export function checkPresignedRequest(
  request: Request,
  input: PresignedCheckInput,
): PresignedCheck {
  const envelope = readPresignedEnvelope(request);
  if (!envelope) return { ok: false, code: PRESIGNED_ERRORS.MISSING_ENVELOPE };

  try {
    assertPresignedConsistency({ ...input, envelope });
  } catch (error) {
    return {
      ok: false,
      code: error instanceof Error ? error.message : PRESIGNED_ERRORS.DIVERGENCE,
    };
  }

  return { ok: true, envelope };
}

/**
 * The five headers a forwarded Bitunix call carries, built from the client's
 * envelope rather than from a signature this server computed.
 *
 * One place, because both halves matter and both are easy to get wrong by hand:
 * the venue sees exactly the credential material the client signed with, and
 * `api-key` is the only credential among them — there is no secret to leak here,
 * and none to add.
 *
 * `nonce` is narrowed here rather than at each call site because
 * `assertPresignedConsistency` has already refused a Bitunix request that
 * arrived without one; the throw is unreachable from a route that called
 * `checkPresignedRequest` first, and keeps the header from silently going out
 * empty if that ever stops being true.
 */
export function bitunixCallHeaders(envelope: PresignedEnvelope): Record<string, string> {
  if (envelope.nonce === undefined) throw new Error(PRESIGNED_ERRORS.MISSING_ENVELOPE);

  return {
    "api-key": envelope.apiKey,
    timestamp: envelope.timestamp,
    nonce: envelope.nonce,
    sign: envelope.signature,
    "Content-Type": "application/json",
  };
}
