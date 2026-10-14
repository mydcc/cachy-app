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
 * Resolves a target endpoint URL given an optional custom base URL and a default full URL.
 *
 * Normalizes baseUrl by:
 * - Trimming leading/trailing whitespace and trailing slashes.
 * - Appending the relative endpoint path.
 * - Handling whether baseUrl already contains version prefixes like `/v1`.
 */
export function resolveProviderEndpoint(
  customBaseUrl: string | null | undefined,
  defaultEndpoint: string,
  relativePath: string,
): string {
  const trimmed = customBaseUrl?.trim();
  if (!trimmed) return defaultEndpoint;

  // If customBaseUrl has no scheme (e.g. localhost:8000?token=abc), prepend http:// so new URL() parses it properly
  const normalizedInput =
    !trimmed.startsWith("http://") && !trimmed.startsWith("https://")
      ? `http://${trimmed}`
      : trimmed;

  try {
    const baseObj = new URL(normalizedInput);
    let pathname = baseObj.pathname.replace(/\/+$/, "");
    const cleanRelative = relativePath.replace(/^\/+/, "");

    // Split relative path and any query parameters attached to relativePath
    const [relPathOnly, relQuery] = cleanRelative.split("?");

    // Handle version-segment deduplication on the pathname: the flavor path
    // carries its own version (v1/, api/v1/, v1beta/), and when the base
    // already ends in any version segment the base wins — otherwise a /v2
    // base would produce a bogus /v2/v1/... path.
    let subPath = relPathOnly;
    const relVersion = relPathOnly.match(/^(api\/v\d+\/|v\d+[a-z]*\/)/)?.[1];
    if (relVersion && /(\/api\/v\d+|\/v\d+[a-z]*)$/.test(pathname)) {
      subPath = relPathOnly.slice(relVersion.length);
    }

    baseObj.pathname = `${pathname}/${subPath}`.replace(/\/+/g, "/");

    // If relative path had query params (e.g. models?limit=100 or key=...), merge them into searchParams
    if (relQuery) {
      const extraParams = new URLSearchParams(relQuery);
      extraParams.forEach((val, key) => {
        baseObj.searchParams.set(key, val);
      });
    }

    return baseObj.toString();
  } catch {
    // Fallback if URL parsing completely fails
    const [baseWithoutQuery, baseQuery] = trimmed.split("?");
    const cleanBase = baseWithoutQuery.replace(/\/+$/, "");
    const [relPathOnly, relQuery] = relativePath.replace(/^\/+/, "").split("?");

    let resolvedPath = `${cleanBase}/${relPathOnly}`;
    // Same version-segment rule as above: the base version wins.
    const fallbackRelVersion = relPathOnly.match(/^(api\/v\d+\/|v\d+[a-z]*\/)/)?.[1];
    if (
      fallbackRelVersion &&
      /(\/api\/v\d+|\/v\d+[a-z]*)$/.test(cleanBase)
    ) {
      resolvedPath = `${cleanBase}/${relPathOnly.slice(fallbackRelVersion.length)}`;
    }

    const mergedParams = new URLSearchParams(baseQuery || "");
    if (relQuery) {
      new URLSearchParams(relQuery).forEach((val, key) => {
        mergedParams.set(key, val);
      });
    }

    const qs = mergedParams.toString();
    return qs ? `${resolvedPath}?${qs}` : resolvedPath;
  }
}
