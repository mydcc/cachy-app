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

/**
 * FEAT-0405 A3 — a request shaped exactly like the one `exchangeSignedFetch`
 * sends, for the route tests.
 *
 * Deliberately not a hand-built header block. The property under test is that
 * the browser and the handler agree about the bytes, and a fixture that spelled
 * the envelope out by hand would assert only that the fixture matches itself.
 * The envelope comes from the same function the browser runs, so a handler that
 * rejects it is a real disagreement and not a stale fixture.
 */

import { signCachyRequest } from "../../utils/exchange/browserSigning";

/** Stand-ins with no relation to a real credential, so a leak is obvious. */
export const TEST_SIGNING_KEYS = {
  apiKey: "test-api-key-0123456789",
  apiSecret: "test-api-secret-0123456789",
};

/**
 * Fixed so the envelope is reproducible across runs. The timestamp inside it is
 * forwarded to the venue verbatim and never recomputed, so nothing downstream
 * depends on the clock being real.
 */
const FIXED_NOW = 1_700_000_000_000;

export interface SignedEnvelopeRequest {
  request: Request;
  /** The same path parsed, which is what a handler reads `action` from. */
  url: URL;
}

export async function signedEnvelopeRequest(
  cachyPath: string,
  payload: unknown,
  queryParams: Record<string, string> = {},
): Promise<SignedEnvelopeRequest> {
  const signed = await signCachyRequest({
    cachyPath,
    keys: TEST_SIGNING_KEYS,
    payload,
    queryParams,
    now: () => FIXED_NOW,
  });

  const url = new URL(`http://localhost${cachyPath}`);
  const request = new Request(url, {
    method: "POST",
    headers: signed.headers,
    body: signed.body ?? JSON.stringify(payload ?? {}),
  });

  return { request, url };
}
