import { extractApiCredentials } from "../../../utils/server/requestUtils";
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { OrderRequestSchema } from "../../../types/orderSchemas";
import { safeJsonParse } from "../../../utils/safeJson";
import { checkClientToken } from "../../../lib/server/clientToken";
import { logger } from "$lib/server/logger";
import { upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import {
  ORDER_ERRORS,
  resolveVenue,
  type ExchangeError,
} from "../../../utils/server/venues";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;
  let body: unknown;
  try {
    const text = await request.text();
    body = safeJsonParse(text);
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
  const creds = extractApiCredentials(request, payload);
  const apiKey = creds.apiKey;
  const apiSecret = creds.apiSecret;
  const passphrase = creds.passphrase;

  if (!apiKey || !apiSecret) {
      return json({ error: "Missing API Credentials" }, { status: 401 });
  }

  const venue = resolveVenue(exchange);
  // Unreachable through Zod's ExchangeEnum. Answering `null` with 200 is what
  // the inline venue branches did when none of them matched.
  if (!venue) return json(null);

  // 2. Key Validation (Additional Check)
  if (venue.requiresPassphrase && !passphrase) {
    return json({ error: ORDER_ERRORS.PASSPHRASE_REQUIRED }, { status: 400 });
  }
  const keyError = venue.validateKeys({ apiKey, apiSecret, passphrase });
  if (keyError) return json({ error: keyError }, { status: 400 });

  try {
    const result = await venue.executeOrder({ apiKey, apiSecret, passphrase }, payload);

    return json(result);

  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    const errorCode = (e as ExchangeError).code;
    const details = (e as ExchangeError).details;

    // Enhanced Logging (automatically redacted by logger)
    logger.error(`[API] Order failed: ${(body as { type?: unknown } | undefined)?.type}`, {
      error: errorMsg,
      code: errorCode,
      body,
    });

    // Redact response message and details
    let sanitizedMsg = errorMsg;
    let sanitizedDetails = details ? String(details) : undefined;

    if (apiKey && apiKey.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(apiKey, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(apiKey, "***");
    }
    if (apiSecret && apiSecret.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(apiSecret, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(apiSecret, "***");
    }
    if (passphrase && passphrase.length > 3) {
      sanitizedMsg = sanitizedMsg.replaceAll(passphrase, "***");
      if (sanitizedDetails) sanitizedDetails = sanitizedDetails.replaceAll(passphrase, "***");
    }

    return json(
      { error: sanitizedMsg, code: errorCode, details: sanitizedDetails },
      { status: upstreamErrorStatus(e) ?? 500 },
    );
  }
};
