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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkClientToken } from "../../../lib/server/clientToken";
import { TpSlRequestSchema, sanitizeErrorMessage } from "../../../types/apiSchemas";
import { redactString } from "../../../utils/redact";
import { safeJsonParse } from "../../../utils/safeJson";
import { readExchangeJson } from "../../../utils/server/exchangeResponse";
import { fetchWithTimeout, upstreamErrorStatus } from "../../../utils/server/fetchWithTimeout";
import {
  bitunixCallHeaders,
  checkPresignedRequest,
  type PresignedEnvelope,
} from "../../../utils/server/presignedEnvelope";
import {
  ROUTE_SIGNING_PLAN,
  canonicalQueryString,
  signatureShapeFor,
} from "../../../utils/exchange/restSigningPlan";
import {
  buildTpslReadQueryParams,
  buildTpslWriteBody,
} from "../../../utils/exchange/venueQueries";

const CACHY_PATH = "/api/tpsl";
const BASE_URL = "https://fapi.bitunix.com";

/**
 * The two read actions reach Bitunix as a signed GET and carry no body of their
 * own, so their Cachy body stays what it always was — the validated
 * `{ exchange, action, params }` wrapper — and the route rebuilds the signed
 * query from `params`.
 */
const READ_PATHS: Record<string, string> = {
  pending: "/api/v1/futures/tpsl/get_pending_orders",
  history: "/api/v1/futures/tpsl/get_history_orders",
};

/**
 * The four write actions POST a signed body, which on this route *is* the Cachy
 * request body: there is nowhere else for the signed bytes to travel. The
 * `action` therefore rides in the request URL, which is what tells the route
 * which of these paths to post to and, through `ROUTE_SIGNING_PLAN`, that this
 * request is body-signed at all.
 *
 * FEAT-0070 splits the create case in two: one position-wide plan that tracks
 * the position's size and closes at market (max one per position), and any
 * number of partial plans with an explicit quantity.
 */
const WRITE_PATHS: Record<string, string> = {
  cancel: "/api/v1/futures/tpsl/cancel_order",
  modify: "/api/v1/futures/tpsl/modify_order",
  "place-position": "/api/v1/futures/tpsl/position/place_order",
  place: "/api/v1/futures/tpsl/place_order",
};

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;
  // Wrap the entire parsing logic in try-catch to handle malformed JSON
  try {
    const rawBody = await request.text();
    const action = url.searchParams.get("action");

    if (!action) {
      return json({ error: "Missing action" }, { status: 400 });
    }

    const readPath = READ_PATHS[action];
    const writePath = WRITE_PATHS[action];
    if (!readPath && !writePath) {
      return json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // The route does not decide its own shape: it asks the shared table, which
    // is the same row the client signed against.
    const cachyPath = `${url.pathname}${url.search}`;
    const shape = signatureShapeFor(ROUTE_SIGNING_PLAN[CACHY_PATH], action);

    if (shape === "query") {
      const validation = TpSlRequestSchema.safeParse(safeJsonParse(rawBody));
      if (!validation.success) {
        return json(
          { error: "Validation Error", details: validation.error.issues },
          { status: 400 }
        );
      }

      const check = checkPresignedRequest(request, {
        cachyPath,
        rebuilt: canonicalQueryString(
          buildTpslReadQueryParams(validation.data.params ?? {}),
        ),
      });
      if (!check.ok) {
        return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
      }

      return json(await getBitunixTpSl(check.envelope, readPath));
    }

    // Body-signed: the request body is the bytes the venue signature covers, so
    // it is forwarded verbatim rather than re-serialised.
    const parsed = safeJsonParse(rawBody);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return json({ error: "Invalid request body" }, { status: 400 });
    }

    // The body is the venue's own body, but it is still held to the same
    // per-action schemas the read actions are: the wrapper those schemas
    // discriminate on is rebuilt here instead of being transmitted, because
    // `exchange` is fixed by this route and `action` arrives in the URL. Omit
    // it and a write would reach Bitunix with nothing having checked it.
    const validation = TpSlRequestSchema.safeParse({
      exchange: "bitunix",
      action,
      params: parsed,
    });
    if (!validation.success) {
      return json(
        { error: "Validation Error", details: validation.error.issues },
        { status: 400 }
      );
    }

    const check = checkPresignedRequest(request, {
      cachyPath,
      rebuilt: buildTpslWriteBody(parsed as Record<string, unknown>),
      rawBody,
    });
    if (!check.ok) {
      return json({ error: `Signature envelope rejected: ${check.code}` }, { status: 400 });
    }

    return json(await postBitunixTpSl(check.envelope, writePath, rawBody));
  } catch (e) {
    let rawMsg = e instanceof Error ? e.message : String(e);
    if (typeof e === "object" && e !== null && !("message" in e)) {
      try {
        rawMsg = JSON.stringify(e);
      } catch {
        // Non-serialisable (circular) error object — keep the String(e) fallback.
      }
    }
    const safeMsg = sanitizeErrorMessage(redactString(rawMsg), 1000);
    console.error(`Error processing TP/SL request:`, safeMsg);

    // Determine appropriate status code
    let status = upstreamErrorStatus(e) ?? 500;
    let message = e instanceof Error ? e.message : "Internal Server Error";

    if (message.includes("Bitunix API error")) {
      status = 502; // Bad Gateway (upstream error)
      // Or 400 if it's a client error from Bitunix that we want to pass through
      if (message.includes("code:")) {
        // If it has a specific code, it might be a logic error (e.g. invalid price)
        status = 400;
      }
    } else if (message.includes("JSON")) {
      status = 400; // Malformed JSON in request
    }

    return json(
      {
        error: safeMsg || "Internal Server Error",
        stack: process.env.NODE_ENV === "development" && e instanceof Error ? e.stack : undefined,
      },
      { status },
    );
  }
};

/** The read actions: a signed GET over the query the envelope carries. */
async function getBitunixTpSl(envelope: PresignedEnvelope, path: string) {
  const { query } = envelope;
  const url = query ? `${BASE_URL}${path}?${query}` : `${BASE_URL}${path}`;

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: bitunixCallHeaders(envelope),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const res = await readExchangeJson(response);
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}

/** The write actions: the signed body goes out unchanged. */
async function postBitunixTpSl(
  envelope: PresignedEnvelope,
  path: string,
  body: string,
) {
  const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
    method: "POST",
    headers: bitunixCallHeaders(envelope),
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text.slice(0, 200)}`);
  }

  const res = await readExchangeJson(response);
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  return res.data;
}
