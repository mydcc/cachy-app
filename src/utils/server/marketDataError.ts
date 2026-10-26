/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Error boundary for the public market-data proxies (BUG-0727).
 *
 * The routes used to forward the upstream body verbatim: a venue or an operator
 * gateway could put internal hosts, paths or an echoed credential into a
 * response that every unauthenticated visitor can read. The status code is still
 * the upstream one — clients depend on it — but the text is ours, and the body
 * goes to the server log only.
 */

import { json } from "@sveltejs/kit";
import { isStatusError } from "./httpErrors";

export const MARKET_DATA_ERROR = "Upstream market data request failed";

export function marketDataErrorResponse(error: unknown, scope: string): Response {
  // `console` rather than `logger`: the logger emits to the authenticated log
  // stream only, so with no stream client attached the raw body would go
  // nowhere. `hooks.server.ts` patches console into both stdout and that
  // stream, which is the server-side sink this detail is meant for.
  if (isStatusError(error)) {
    console.warn(`[${scope}] upstream ${error.status}: ${error.message}`);
    return json({ message: MARKET_DATA_ERROR }, { status: error.status });
  }

  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${scope}] ${detail}`);
  return json({ message: "Internal server error" }, { status: 500 });
}
