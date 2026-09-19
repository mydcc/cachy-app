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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkClientToken } from "../../../lib/server/clientToken";
import { BaseRequestSchema } from "../../../types/orderSchemas";
import { checkPresignedRequest, readPresignedEnvelope } from "../../../utils/server/presignedEnvelope";
import { buildBalanceQueryParams } from "../../../utils/exchange/venueQueries";
import { queryStringForVenue } from "../../../utils/exchange/restSigningPlan";
import { safeJsonParse } from "../../../utils/safeJson";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../utils/redact";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import { resolveVenue } from "../../../utils/server/venues";

const CACHY_PATH = "/api/balance";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let body: unknown;
  try {
    const text = await request.text();
    body = safeJsonParse(text);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = BaseRequestSchema.safeParse(body);
  if (!validation.success) {
    const errors = validation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return json({ error: "Validation Error", details: errors }, { status: 400 });
  }

  const { exchange } = validation.data;

  try {
    const venue = resolveVenue(exchange);
    if (!venue) {
      return json({ error: "Unsupported exchange" }, { status: 400 });
    }

    // The bytes the client signed are this venue's parameters, serialised the
    // way this venue serialises them. Rebuilding through the shared builder and
    // the venue-aware serialiser is the whole comparison — a bitget request
    // rebuilt with Bitunix's sort order would answer DIVERGENCE on every call.
    const rebuilt = queryStringForVenue(exchange, buildBalanceQueryParams(exchange));
    const check = checkPresignedRequest(request, {
      cachyPath: CACHY_PATH,
      rebuilt,
      // Venue-aware nonce requirement: Bitget sends no nonce (its prehash has
      // no such field), so the guard must not ask its half for one.
      venue: exchange,
    });
    if (!check.ok) {
      return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
    }
    // Checked here rather than in the shared guard, which cannot tell a missing
    // passphrase from a Bitunix request that rightly carries none — the route
    // is the level that knows which venue this is.
    if (venue.requiresPassphrase && check.envelope.passphrase === undefined) {
      return json({ error: "Missing passphrase" }, { status: 400 });
    }

    const balance = await venue.fetchBalance(check.envelope);

    return json({ balance });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    logger.error(`[Balance] Error fetching balance from ${exchange}: ${redactString(rawMsg)}`);
    // Exact-value scrub for what the envelope carried: redactString above
    // covers labeled shapes, but a bare credential echoed in upstream text
    // needs its value matched (FEAT-0405 review).
    const envelope = readPresignedEnvelope(request);
    let message = (e instanceof Error ? e.message : null) || "Failed to fetch balance";
    for (const value of [envelope?.apiKey, envelope?.passphrase]) {
      if (value && value.length > 3) message = message.replaceAll(value, "***");
    }
    return json(
      { error: message },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};
