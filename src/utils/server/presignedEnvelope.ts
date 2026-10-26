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
  type Venue,
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
  /**
   * A route that calls the guard must have a row in the shared table. Arriving
   * here without one is a wiring bug, not an unmigrated route: unmigrated
   * routes never call the guard (`BUG-0723`).
   */
  ROUTE_NOT_MIGRATED: "PRESIGNED_ROUTE_NOT_MIGRATED",
  /** `x-api-timestamp` is not a millisecond epoch value. */
  TIMESTAMP_INVALID: "PRESIGNED_TIMESTAMP_INVALID",
  /** The envelope is older (or further in the future) than the window allows. */
  TIMESTAMP_STALE: "PRESIGNED_TIMESTAMP_STALE",
} as const;

/**
 * How far a signing timestamp may sit from this server's clock.
 *
 * Deliberately wider than the venue window — Bitget documents a fixed 30-second
 * window (`docs/bitget-api/01_sign.md`), Bitunix documents none. A proxy
 * stricter than the venue would refuse live trades the venue would have
 * accepted, so this check does not compete with it: it rejects captures that
 * are minutes old, and the venue remains the authority for replays inside its
 * own window.
 *
 * A per-process nonce cache was considered and deliberately not added: it
 * would only cover one instance, Bitget carries no nonce at all, and a
 * deployment behind a load balancer would get the appearance of replay
 * protection without the substance. Timestamp freshness is the half that can
 * be enforced honestly here (`BUG-0723`).
 */
export const PRESIGNED_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Rejects an envelope whose timestamp is malformed or outside the window.
 *
 * `nowMs` is injectable so the tests can pin a clock; routes never pass it.
 */
export function assertFreshTimestamp(
  envelope: Pick<PresignedEnvelope, "timestamp">,
  nowMs: number = Date.now(),
): void {
  // Signers emit `Date.now().toString()`, i.e. a 13-digit millisecond epoch.
  // The ten-digit seconds form some venue documents use for WebSocket logins
  // parses as 1970 here and is rejected as stale — which is the right outcome,
  // because forwarding it would only reach a venue rejection later.
  if (!/^\d{1,16}$/.test(envelope.timestamp)) {
    throw new Error(PRESIGNED_ERRORS.TIMESTAMP_INVALID);
  }
  const signedAt = Number(envelope.timestamp);
  if (!Number.isSafeInteger(signedAt) || signedAt <= 0) {
    throw new Error(PRESIGNED_ERRORS.TIMESTAMP_INVALID);
  }
  if (Math.abs(nowMs - signedAt) > PRESIGNED_TIMESTAMP_WINDOW_MS) {
    throw new Error(PRESIGNED_ERRORS.TIMESTAMP_STALE);
  }
}

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
  /**
   * The venue this request is for, read off the validated payload. Decides
   * the nonce requirement on mixed-venue routes: Bitunix folds a nonce into
   * its prehash, Bitget has no such field and its signer sends none. Absent,
   * the plan-level rule applies (a Bitunix-reachable route asks for one) —
   * which is what single-venue callers get without passing anything.
   */
  venue?: Venue;
  /**
   * Clock for the freshness check, in epoch milliseconds. Injectable so tests
   * can pin a timestamp; routes leave it out and the server clock applies.
   */
  nowMs?: number;
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

  // Fail closed. A route that calls this guard has declared itself migrated, so
  // arriving with no plan row means the route and the shared table disagree —
  // and the old silent return turned that wiring bug into "accept any envelope
  // without comparing a byte" (BUG-0723). A route that is genuinely not cut
  // over does not call this guard at all; that is what keeps the migration
  // incremental, not a permissive miss here.
  if (!plan) throw new Error(PRESIGNED_ERRORS.ROUTE_NOT_MIGRATED);

  // Freshness before credentials: a captured envelope must not reach the venue
  // merely because its passphrase and nonce are well-formed.
  assertFreshTimestamp(input.envelope, input.nowMs);

  if (!routeTakesPassphrase(plan)) {
    const { passphrase } = input.envelope;
    if (passphrase !== undefined) {
      throw new Error(PRESIGNED_ERRORS.UNEXPECTED_PASSPHRASE);
    }
  }

  // Checked after the passphrase so that a request carrying a credential this
  // route may not have is reported as that, not as a missing nonce.
  //
  // Venue-aware on mixed-venue routes: the route passes the venue off its
  // validated payload, and only the Bitunix half is asked for a nonce. Bitget
  // has no nonce field — its signer sends none — so a plan-level requirement
  // would refuse every Bitget request with a missing envelope before any byte
  // was compared. Callers that pass no venue keep the plan-level rule.
  const needsNonce = input.venue ? input.venue === "bitunix" : routeTakesNonce(plan);
  if (needsNonce && input.envelope.nonce === undefined) {
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
 * Reads the envelope and checks it against the server's rebuild and the
 * freshness window in one step, reporting a `PRESIGNED_ERRORS` code instead of
 * throwing.
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

/**
 * The five headers a forwarded Bitget call carries, built from the client's
 * envelope. The counterpart of `bitunixCallHeaders`, and for the same reason:
 * these literals are copied from `generateBitgetSignature`'s callers
 * (`venues/bitget.ts`), and a hand-built copy that drifts is a venue rejection
 * mid-trade.
 *
 * `ACCESS-PASSPHRASE` is the ADR-0013 named exception and the only credential
 * here besides `ACCESS-KEY` — the secret never appears, because it is the HMAC
 * key and stayed client-side. Narrowed like the nonce above: a Bitget request
 * that reached this point has already passed `routeTakesPassphrase`, so the
 * throw is unreachable from a route that called `checkPresignedRequest` first.
 */
export function bitgetCallHeaders(envelope: PresignedEnvelope): Record<string, string> {
  if (envelope.passphrase === undefined) throw new Error(PRESIGNED_ERRORS.MISSING_ENVELOPE);

  return {
    "ACCESS-KEY": envelope.apiKey,
    "ACCESS-SIGN": envelope.signature,
    "ACCESS-TIMESTAMP": envelope.timestamp,
    "ACCESS-PASSPHRASE": envelope.passphrase,
    "Content-Type": "application/json",
  };
}
