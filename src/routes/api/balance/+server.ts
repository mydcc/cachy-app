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
import { extractApiCredentials } from "../../../utils/server/requestUtils";
import { safeJsonParse } from "../../../utils/safeJson";
import { logger } from "$lib/server/logger";
import { redactString } from "../../../utils/redact";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import { resolveVenue } from "../../../utils/server/venues";

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
  const creds = extractApiCredentials(request, validation.data);
  const apiKey = creds.apiKey;
  const apiSecret = creds.apiSecret;
  const passphrase = creds.passphrase;

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing API credentials" }, { status: 400 });
  }

  try {
    const venue = resolveVenue(exchange);
    if (!venue) {
      return json({ error: "Unsupported exchange" }, { status: 400 });
    }
    if (venue.requiresPassphrase && !passphrase) {
      return json({ error: "Missing passphrase" }, { status: 400 });
    }

    const balance = await venue.fetchBalance({ apiKey, apiSecret, passphrase });

    return json({ balance });
  } catch (e) {
    const rawMsg = e instanceof Error ? e.message : String(e);
    logger.error(`[Balance] Error fetching balance from ${exchange}: ${redactString(rawMsg)}`);
    return json(
      { error: (e instanceof Error ? e.message : null) || "Failed to fetch balance" },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};
