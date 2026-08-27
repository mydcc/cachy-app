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
 * The read half of this family stays where it already worked, in
 * `/api/leverage-margin-mode` — one working GET is not worth moving into a
 * shared route just to make the family look symmetric, and moving it would
 * put the only currently-shipping account read at risk for no behaviour
 * change. Both speak the same internal contract (`exchange` in the body,
 * credentials in headers), which is the part that matters.
 *
 * ADR-0001: the API key travels as the credential of a request the trader
 * initiated, and nothing else about them does. No key is stored here, and
 * none appears in a response — the catch below scrubs them out of upstream
 * error text before it is returned.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AccountSettingsRequestSchema } from "../../../types/accountSettingsSchemas";
import { safeJsonParse } from "../../../utils/safeJson";
import { checkClientToken } from "../../../lib/server/clientToken";
import { extractApiCredentials } from "../../../utils/server/requestUtils";
import { logger } from "$lib/server/logger";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import { ORDER_ERRORS, resolveVenue, type ExchangeError } from "../../../utils/server/venues";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    body = safeJsonParse(await request.text());
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
  const creds = extractApiCredentials(request, payload);
  const { apiKey, apiSecret, passphrase } = creds;

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing API Credentials" }, { status: 401 });
  }

  const venue = resolveVenue(payload.exchange);
  if (!venue) {
    return json({ error: "Unsupported exchange", code: "UNSUPPORTED_EXCHANGE" }, { status: 400 });
  }

  if (venue.requiresPassphrase && !passphrase) {
    return json({ error: ORDER_ERRORS.PASSPHRASE_REQUIRED }, { status: 400 });
  }
  const keyError = venue.validateKeys({ apiKey, apiSecret, passphrase });
  if (keyError) return json({ error: keyError }, { status: 400 });

  try {
    const result = await venue.executeAccountSetting({ apiKey, apiSecret, passphrase }, payload);

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

    let sanitizedMsg = errorMsg;
    for (const secret of [apiKey, apiSecret, passphrase]) {
      if (secret && secret.length > 3) sanitizedMsg = sanitizedMsg.replaceAll(secret, "***");
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
