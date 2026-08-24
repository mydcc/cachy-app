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

import { env } from "$env/dynamic/private";

/**
 * Shared base-URL resolution for the Ollama proxy routes (/api/ai/ollama and
 * /api/ai/ollama/models).
 *
 * BUG-0295: requests without a baseUrl used to default to the hardcoded
 * loopback literal http://localhost:11434. Once the SSRF guard (BUG-0291)
 * started rejecting reserved IPs, that implicit default silently turned into
 * a 403 for every self-hosted setup where Cachy is hosted and Ollama runs on
 * the operator's machine. The default is now explicit and operator-owned:
 * OLLAMA_PROXY_BASE_URL points at an Ollama instance reachable FROM THE
 * SERVER. Whatever URL comes out here — env default or user-supplied — is
 * validated by the same reserved-IP filter in urlValidator.ts; the operator
 * default never bypasses the guard.
 */

export const MISSING_BASE_URL_ERROR =
  "No Ollama base URL configured. The former localhost default is no longer " +
  "forwarded because the proxy blocks loopback targets (SSRF guard). Set " +
  "OLLAMA_PROXY_BASE_URL in the server environment to an Ollama host reachable " +
  "from it, or configure an explicit base URL in Settings > AI.";

export function resolveBaseUrl(raw: string | null | undefined): string | null {
  const candidate = (raw ?? env.OLLAMA_PROXY_BASE_URL ?? "").trim();
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return candidate.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** True when the caller omitted baseUrl entirely (as opposed to sending garbage). */
export function usesConfiguredDefault(raw: string | null | undefined): boolean {
  return !raw || raw.trim() === "";
}
