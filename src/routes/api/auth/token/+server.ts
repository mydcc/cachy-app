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
import { issueToken } from "../../../../lib/server/clientToken";
import { createRateLimiter } from "../../../../lib/server/rateLimit";

/**
 * Deliberately unguarded (BUG-0052): this is where a client gets its first
 * token, so it cannot itself require one. The only protection is a per-IP
 * ceiling. A bot challenge (e.g. Turnstile) here is a reasonable follow-up if
 * IP limiting alone proves insufficient, not required to ship.
 *
 * `getClientAddress()` behind a reverse proxy (this app's own documented
 * deployment shape, see DEPLOYMENT.md) returns the proxy's own address unless
 * `ADDRESS_HEADER`/`XFF_DEPTH` are set for adapter-node — see .env.example.
 * Until that's configured, every visitor shares one bucket here, so this
 * stays generous rather than the originally-shipped 1/hour, which locked out
 * every visitor after the first token request on exactly that kind of
 * deployment.
 */
export const _issuanceLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
});

export const POST: RequestHandler = async ({ getClientAddress }) => {
  if (!_issuanceLimiter.consume(getClientAddress())) {
    return json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429 },
    );
  }

  const token = issueToken();
  return json({ token });
};
