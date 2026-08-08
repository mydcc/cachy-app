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

import { settingsState } from "../stores/settings.svelte";

/**
 * The single way client code reaches an API route guarded by `checkClientToken`.
 *
 * Since ADR-0002 those routes fail closed: without the `x-app-access-token`
 * header they answer 401, and the app cannot talk to its own backend. The
 * header was previously spelled out at each call site, which is how several of
 * them ended up never sending it at all — see `src/tests/security/
 * app_auth_headers.test.ts`, which fails the build if a raw `fetch` reappears.
 *
 * The token is Class A data under ADR-0001. It lives in `localStorage` (as part
 * of the encrypted settings blob) and travels only to this app's own proxy, as
 * the credential of a user-initiated request.
 */

/**
 * Headers for a request to a guarded route, merged over `extra`.
 *
 * The token is omitted when empty rather than sent as an empty string. An empty
 * header is not a credential, and `settingsState` holds `""` both before the
 * user has configured a token and while the settings are locked — neither is a
 * request worth labelling as authenticated.
 */
export function appAuthHeaders(
  extra?: HeadersInit,
): Record<string, string> {
  const headers: Record<string, string> = {};

  // Normalise Headers / [key, value][] / Record alike, so callers can pass
  // whatever shape they already had.
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers[key] = value;
    });
  }

  const token = settingsState.appAccessToken;
  if (token) {
    headers["x-app-access-token"] = token;
  }

  return headers;
}

// In-flight issuance request, shared across concurrent callers so a burst of
// guarded requests with no token yet (e.g. every onMount fetch firing at
// once) triggers one POST /api/auth/token, not one per caller.
let issuingToken: Promise<void> | null = null;

/**
 * Requests a fresh client token from the deliberately unguarded
 * `POST /api/auth/token` and stores it, so a caller never needs to know this
 * happened.
 *
 * `checkClientToken`'s token store is in-memory and resets on server restart
 * (see the ADR-0002 amendment for BUG-0052) — "acceptable friction for v1 (a
 * background fetch, not a user-facing flow)". This is that background fetch:
 * without it, a client whose token the server no longer recognises is stuck
 * showing "Unauthorized: Invalid or missing client access token" on every
 * guarded route until someone finds the manual "Create access token" button
 * in Settings → Connections.
 */
function issueAccessToken(): Promise<void> {
  if (!issuingToken) {
    issuingToken = (async () => {
      try {
        const res = await fetch("/api/auth/token", { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data?.token) settingsState.appAccessToken = data.token;
        }
      } catch {
        // Network error: leave appAccessToken as-is, the caller's request
        // will fail on its own and can be retried later.
      } finally {
        issuingToken = null;
      }
    })();
  }
  return issuingToken;
}

function isClientTokenError(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string" &&
    (body as { error: string }).error.includes("client access token")
  );
}

/**
 * `fetch` with the app access token attached.
 *
 * A drop-in replacement: everything else in `init` — method, body, signal —
 * is passed through untouched.
 *
 * Waits for `settingsState.secretsReady` first. The token is restored from
 * localStorage by an asynchronous decryption, so a request fired during
 * startup — the account, positions, orders and balance fetches all run from
 * `onMount` — would otherwise read an empty token and take a 401 that a later,
 * hand-clicked retry of the same request does not. The headers are built after
 * the await, never before.
 *
 * Two self-healing steps around that: if there is no token yet, one is issued
 * before the first attempt; if the request still comes back 401 for "invalid
 * or missing client access token" (the server no longer recognises this
 * token, e.g. it restarted), a fresh one is issued and the request is retried
 * once. Neither step touches other 401s (a route-specific auth failure) or
 * 429s (rate limiting, where retrying immediately would only make it worse).
 */
export async function appFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  await settingsState.secretsReady;
  if (!settingsState.appAccessToken) {
    await issueAccessToken();
  }

  const response = await fetch(input, { ...init, headers: appAuthHeaders(init.headers) });
  if (response.status !== 401) return response;

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  if (!isClientTokenError(body)) return response;

  await issueAccessToken();
  return fetch(input, { ...init, headers: appAuthHeaders(init.headers) });
}
