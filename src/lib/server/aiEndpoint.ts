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
/**
 * Returns the flavor path without its version prefix when the base URL
 * already ends in the same version family ("" for plain vN, "beta" for
 * v1beta, ...), so neither `/v1/v1` nor `/v2/v1` is ever doubled. Returns
 * null when no strip applies. Cross-family combos return null and append
 * unchanged, mirroring `stripVersionPrefix` in
 * `src/lib/ai/directRequest.ts` (kept as a separate copy: the
 * browser-direct builder must not import server code).
 */
function stripVersionPrefix(rel: string, base: string): string | null {
  const relMatch = rel.match(/^(?:api\/)?v\d+([a-z]*)\//);
  if (!relMatch) return null;
  const baseMatch = base.match(/(?:\/api)?\/v\d+([a-z]*)$/);
  if (!baseMatch || baseMatch[1] !== relMatch[1]) return null;
  const prefix = rel.match(/^(?:api\/v\d+[a-z]*\/|v\d+[a-z]*\/)/);
  if (!prefix) return null;
  return rel.slice(prefix[0].length);
}

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

    // Same-family version rule: the base version wins, cross-family combos
    // append unchanged (see stripVersionPrefix).
    const stripped = stripVersionPrefix(relPathOnly, pathname);
    const subPath = stripped !== null ? stripped : relPathOnly;

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

    // Same version-segment rule as above: the base version wins.
    const strippedFallback = stripVersionPrefix(relPathOnly, cleanBase);
    const resolvedPath =
      strippedFallback !== null ? `${cleanBase}/${strippedFallback}` : `${cleanBase}/${relPathOnly}`;

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
