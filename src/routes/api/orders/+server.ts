/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */
/*
 * The order route (FEAT-0068, FEAT-0071).
 *
 * FEAT-0405 A5 — it no longer reads a transmitted secret. The client signs the
 * bytes for the action it is about to send and posts a pre-signed envelope;
 * this route rebuilds those bytes, compares, and forwards the client's own
 * string. The comparison *is* the anti-drift mechanism (ADR-0013), and it is
 * why the route can no longer sign: the secret stays on the device.
 *
 * The route is the one place where the signature covers a *query* for some
 * actions and a *body* for others, so the shape is resolved through
 * `signatureShapeFor` off the `?action=` the URL carries — the same call the
 * browser makes, from the same table, so neither side can declare a shape the
 * other disagrees with.
 *
 * On a body-signed action the bytes a venue signature covers are the *venue*
 * body, which carries neither `type` nor `exchange` and so cannot be validated
 * as a Cachy request. The Cachy body therefore carries both: the payload at the
 * top level, plus the venue string under `venueBody`. The payload is what the
 * rebuild starts from — the wrapper itself is never signed, and `venueBody` is
 * never validated, only compared.
 *
 * ADR-0001: the API key travels as the credential of a request the trader
 * initiated, and nothing else about them does. The secret is not among the
 * values scrubbed from upstream error text because it never reached this
 * process.
 */
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { OrderRequestSchema, type OrderRequestPayload } from "../../../types/orderSchemas";
import { safeJsonParse } from "../../../utils/safeJson";
import { checkClientToken } from "../../../lib/server/clientToken";
import { logger } from "$lib/server/logger";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import {
  checkPresignedRequest,
  PRESIGNED_ERRORS,
} from "../../../utils/server/presignedEnvelope";
import { buildVenueBody } from "../../../utils/exchange/venueBodies";
import {
  buildOrderDetailQueryParams,
  buildOrdersHistoryQueryParams,
  buildPendingOrdersQueryParams,
} from "../../../utils/exchange/venueQueries";
import {
  planForRoute,
  queryStringForVenue,
  signatureShapeFor,
  type Venue,
} from "../../../utils/exchange/restSigningPlan";
import {
  ORDER_ERRORS,
  resolveVenue,
  type ExchangeError,
} from "../../../utils/server/venues";

/**
 * The one path this route answers to. A literal for the envelope guard rather
 * than `url.pathname`: the guard's lookup normalises a trailing slash, but a
 * path *variant* this route does not think it serves should be a miss, not a
 * silently different plan row.
 */
const CACHY_PATH = "/api/orders";

const PLAN = planForRoute(CACHY_PATH);

/**
 * The server's own rebuild of the query a query-signed action was signed over.
 *
 * Built from the *validated* payload, the same way the body rebuild is: the
 * schema applies defaults and clamps, so a client that signed its unparsed
 * payload would produce a different string and be refused as
 * `PRESIGNED_DIVERGENCE` before anything reached the venue.
 *
 * Throws on a query-shaped action with no builder, which is a wiring bug rather
 * than a user error — the plan and this switch are edited together.
 */
function rebuiltQuery(
  venue: Venue,
  action: string,
  payload: OrderRequestPayload,
): string {
  // Dispatched off `payload.type`, not `action`: the route has already refused
  // a request whose URL action disagrees with its payload type, so the two
  // name the same action — and only the discriminant narrows the union for
  // the builders below.
  if (action === "pending" && payload.type === "pending") {
    return queryStringForVenue(venue, buildPendingOrdersQueryParams(venue));
  }
  if (action === "history" && payload.type === "history") {
    return queryStringForVenue(venue, buildOrdersHistoryQueryParams(venue, payload));
  }
  if (action === "order-detail" && payload.type === "order-detail") {
    return queryStringForVenue(venue, buildOrderDetailQueryParams(payload));
  }
  throw new Error(ORDER_ERRORS.VALIDATION_ERROR);
}

export const POST: RequestHandler = async ({ request, getClientAddress, url }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;
  const rawBody = await request.text();
  let body: unknown;
  try {
    body = safeJsonParse(rawBody);
  } catch {
    return json({ error: ORDER_ERRORS.INVALID_JSON }, { status: 400 });
  }
  // 1. Zod Validation
  const validation = OrderRequestSchema.safeParse(body);
  if (!validation.success) {
    // Format Zod errors
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return json({ error: ORDER_ERRORS.VALIDATION_ERROR, code: "VALIDATION_ERROR", details: errors }, { status: 400 });
  }
  const payload = validation.data;
  const { exchange } = payload;

  const venue = resolveVenue(exchange);
  // Unreachable through Zod's ExchangeEnum. Answering `null` with 200 is what
  // the inline venue branches did when none of them matched.
  if (!venue) return json(null);
  if (!PLAN) {
    // The route is in the table or it is not migrated; arriving here means the
    // table was edited without this file, and signing nothing is not an option.
    return json({ error: ORDER_ERRORS.VALIDATION_ERROR }, { status: 500 });
  }

  // 2. Read the `type` and `action` fields over the raw body: the discriminator
  // the shape is resolved from is the URL's, and the payload's own `type` has
  // to name the same action or the client signed a shape this route will not
  // forward.
  const action = url.searchParams.get("action") ?? undefined;
  if (action !== undefined && action !== payload.type) {
    return json(
      { error: `Signature envelope rejected: ${PRESIGNED_ERRORS.DIVERGENCE}` },
      { status: 400 },
    );
  }
  const shape = signatureShapeFor(PLAN, action);

  // Read off the raw body, not off `validation.data`: the schema strips what it
  // does not declare, and `venueBody` is deliberately not declared — it is the
  // venue's payload, not a Cachy field. A query-signed action has none: its
  // signature covers the query, and the transport body is the Cachy payload.
  const venueBody = (body as Record<string, unknown>).venueBody;
  if (shape === "body" && typeof venueBody !== "string") {
    return json({ error: "Missing signed body", code: "MISSING_SIGNED_BODY" }, { status: 400 });
  }

  // Assigned once the envelope has been read, so the failure path can scrub it
  // without the credential having to exist.
  let forwardedApiKey: string | undefined;
  let forwardedPassphrase: string | undefined;

  try {
    const check = checkPresignedRequest(request, {
      cachyPath: `${url.pathname}${url.search}`,
      rebuilt:
        shape === "query" && action !== undefined
          ? rebuiltQuery(exchange, action, payload)
          : buildVenueBody(exchange, payload),
      rawBody: typeof venueBody === "string" ? venueBody : undefined,
      // Venue-aware nonce requirement: Bitget sends no nonce (its prehash has
      // no such field), so the guard must not ask its half for one.
      venue: exchange,
    });
    if (!check.ok) {
      return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
    }
    forwardedApiKey = check.envelope.apiKey;
    forwardedPassphrase = check.envelope.passphrase;

    const result = await venue.executeOrder(
      check.envelope,
      payload,
      typeof venueBody === "string" ? venueBody : "",
    );
    return json(result);
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const errorCode = (e as ExchangeError).code;
    const details = (e as ExchangeError).details;
    // Enhanced Logging (automatically redacted by logger)
    logger.error(`[API] Order failed: ${payload.type}`, {
      error: errorMsg,
      code: errorCode,
      body,
    });
    // The key can appear in upstream error text; the secret cannot, because it
    // never came this way. Scrub what the envelope actually carried — before
    // the log line as well as before the response. The passphrase rides the
    // same path on Bitget (ADR-0013 named exception), so it is scrubbed too.
    let sanitizedMsg = errorMsg;
    let sanitizedDetails = details ? String(details) : undefined;
    if (forwardedApiKey && forwardedApiKey.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(forwardedApiKey, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(forwardedApiKey, "***");
    }
    if (forwardedPassphrase && forwardedPassphrase.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(forwardedPassphrase, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(forwardedPassphrase, "***");
    }
    return json(
      { error: sanitizedMsg, code: errorCode, details: sanitizedDetails },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};
