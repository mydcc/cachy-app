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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0835 — the two ways a browser-direct AI request can end up somewhere the
 * app did not say it would.
 *
 * Redirects. The panel names the recipient and its base URL before the request.
 * A provider (or a user-created entry pointing at one) that answers 307/308
 * keeps the method and the body, so following it would send the same payload to
 * a second origin. The fetches therefore ask for `redirect: "manual"` and treat
 * any redirect answer as a refusal. `"manual"` rather than `"error"` because
 * `"error"` rejects with a generic TypeError that is indistinguishable from a
 * CORS or network failure; `"manual"` lets the caller tell the cases apart.
 *
 * Loopback. The hosted build's `connect-src` has no `http:` source, so a local
 * server is refused by the page's own connection policy before it is contacted.
 * The failure is a generic TypeError that looks like a CORS failure, so it is
 * recognised from the configured address, never from the error.
 */

/** A provider answered with a redirect; the request was stopped, not followed. */
export class ProviderRedirectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRedirectError";
  }
}

/**
 * True when a `redirect: "manual"` fetch ended in a redirect. A browser returns
 * an opaque response (`type: "opaqueredirect"`, status 0); other runtimes return
 * the 3xx itself.
 */
export function isRedirectResponse(res: Pick<Response, "type" | "status">): boolean {
  return res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
}

/** Scheme, host and port only: a base URL can carry a path or a key-bearing query. */
function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "the configured address";
  }
}

/**
 * The refusal shown when a provider tries to re-address the request. It names
 * the recipient the trader configured — the one the panel disclosed — and says
 * the request was stopped, so nothing past that recipient received it.
 */
export function providerRedirectRefusal(
  label: string,
  requestUrl: string,
): ProviderRedirectError {
  return new ProviderRedirectError(
    `"${label}" (${originOf(requestUrl)}) answered with a redirect, so the request was stopped instead of being sent on to another address. Check the base URL in Settings → AI.`,
  );
}

/**
 * The failure for a loopback provider the page's connection policy refused. It
 * names the policy as the cause and deliberately does not mention CORS or the
 * server relay: neither is the cause, and the relay is advice the app refuses
 * on purpose for rule authoring (ADR-0030 decision 2).
 */
export function loopbackPolicyFailure(label: string, baseUrl: string, cause: unknown): Error {
  return new Error(
    `"${label}" at ${originOf(baseUrl)} cannot be reached from this page: the connection policy (Content-Security-Policy connect-src) allows HTTPS endpoints only, so the request to a local address was blocked before it left the browser.`,
    { cause },
  );
}
