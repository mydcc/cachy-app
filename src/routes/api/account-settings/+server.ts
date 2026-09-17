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

/*
 * FEAT-0068 — the account-settings write route.
 *
 * Thin transport, like every other proxy route: validate, resolve a venue,
 * hand it the payload, sanitize what comes back (FEAT-0228, ADR-0007). It
 * builds no request and knows no endpoint path.
 *
 * FEAT-0405 A5 — it no longer reads a transmitted secret either. The client
 * signs the body with the secret and sends a pre-signed envelope; this route
 * rebuilds the bytes
 * it was told were signed, compares them, and forwards the client's own string.
 * That comparison *is* the anti-drift mechanism, and it is why the route can no
 * longer sign: the secret stays on the device (ADR-0013).
 *
 * The bytes a venue signature covers here are the *venue* body, which carries
 * neither `type` nor `exchange` and so cannot be validated as a Cachy request.
 * The Cachy body therefore carries both: the payload at the top level, plus the
 * venue string under `venueBody`. The payload is what `buildVenueBody` is
 * rebuilt from — the wrapper itself is never signed, and `venueBody` is never
 * validated, only compared.
 *
 * The read half of this family stays where it already worked, in
 * `/api/leverage-margin-mode` — one working GET is not worth moving into a
 * shared route just to make the family look symmetric, and moving it would
 * put the only currently-shipping account read at risk for no behaviour
 * change.
 *
 * ADR-0001: the API key travels as the credential of a request the trader
 * initiated, and nothing else about them does. No key is stored here, and
 * none appears in a response — the catch below scrubs the key the envelope
 * carries out of upstream error text before it is returned. The secret is not
 * among the values it scrubs because the secret never reached this process.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AccountSettingsRequestSchema } from "../../../types/accountSettingsSchemas";
import { safeJsonParse } from "../../../utils/safeJson";
import { checkClientToken } from "../../../lib/server/clientToken";
import { logger } from "$lib/server/logger";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import { checkPresignedRequest } from "../../../utils/server/presignedEnvelope";
import { buildVenueBody } from "../../../utils/exchange/venueBodies";
import { ORDER_ERRORS, resolveVenue, type ExchangeError } from "../../../utils/server/venues";

/**
 * The one path this route answers to. A literal for the envelope guard rather
 * than `url.pathname`: the guard's lookup normalises a trailing slash, but a
 * path *variant* this route does not think it serves should be a miss, not a
 * silently different plan row.
 */
const CACHY_PATH = "/api/account-settings";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  const rawBody = await request.text();

  let body: unknown;
  try {
    body = safeJsonParse(rawBody);
  } catch {
    return json({ error: ORDER_ERRORS.INVALID_JSON }, { status: 400 });
  }

  const validation = AccountSettingsRequestSchema.safeParse(body);
  if (!validation.success) {
    const errors = validation.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(", ");
    return json(
      { error: ORDER_ERRORS.VALIDATION_ERROR, code: "VALIDATION_ERROR", details: errors },
      { status: 400 },
    );
  }

  const payload = validation.data;

  // Read off the raw body, not off `validation.data`: the schema strips what it
  // does not declare, and `venueBody` is deliberately not declared — it is the
  // venue's payload, not a Cachy field.
  const venueBody = (body as Record<string, unknown>).venueBody;
  if (typeof venueBody !== "string") {
    return json({ error: "Missing signed body", code: "MISSING_SIGNED_BODY" }, { status: 400 });
  }

  // The plan row names one venue, so this is checked rather than resolved. A
  // body still claiming another venue is a client the signer should already
  // have refused; forwarding it would send a Bitunix envelope the client built
  // from some other account's keys.
  const venueId = payload.exchange;
  if (venueId !== "bitunix") {
    return json({ error: "Unsupported exchange", code: "UNSUPPORTED_EXCHANGE" }, { status: 400 });
  }

  const venue = resolveVenue(venueId);
  if (!venue) {
    return json({ error: "Unsupported exchange", code: "UNSUPPORTED_EXCHANGE" }, { status: 400 });
  }

  // Assigned once the envelope has been read, so the failure path can scrub it
  // without the credential having to exist.
  let forwardedApiKey: string | undefined;

  try {
    // Both sides build through `buildVenueBody`, and both build from the payload
    // *the schema produced* rather than from the raw object. That matters:
    // `marginCoin` carries a default and `amount` a transform, so a client that
    // signed its unparsed payload would build a different string and be refused
    // as `PRESIGNED_DIVERGENCE` before anything reached Bitunix.
    const check = checkPresignedRequest(request, {
      cachyPath: CACHY_PATH,
      rebuilt: buildVenueBody(venueId, payload),
      rawBody: venueBody,
    });
    if (!check.ok) {
      return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
    }
    forwardedApiKey = check.envelope.apiKey;

    const result = await venue.executeAccountSetting(check.envelope, payload, venueBody);

    // `null` is the venue boundary saying it does not implement this family.
    // Answered as a refusal, not as a 200: a write that reports success
    // without happening is how a trader ends up sizing a position against a
    // leverage the exchange never accepted.
    if (result === null) {
      return json(
        { error: "Unsupported exchange", code: "UNSUPPORTED_EXCHANGE" },
        { status: 400 },
      );
    }

    return json({ code: 0, data: result });
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const errorCode = (e as ExchangeError).code;

    logger.error(`[API] Account setting failed: ${payload.type}`, {
      error: errorMsg,
      code: errorCode,
    });

    // The key can appear in upstream error text; the secret cannot, because it
    // never came this way. Scrub what the envelope actually carried.
    let sanitizedMsg = errorMsg;
    if (forwardedApiKey && forwardedApiKey.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(forwardedApiKey, "***");
    }

    // A venue module rejecting the payload is the client's mistake, not the
    // upstream's — answering 500 would send the client looking for an
    // exchange outage that never happened.
    const fallbackStatus = errorCode === "VALIDATION_ERROR" ? 400 : 500;
    return json(
      { error: sanitizedMsg, code: errorCode },
      { status: upstreamErrorStatus(e) ?? fallbackStatus },
    );
  }
};
