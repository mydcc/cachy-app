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

import { safeJsonParse } from "../safeJson";

/**
 * Reads an exchange response body without losing numeric precision.
 *
 * **Never use `response.json()` for exchange data.** It runs `JSON.parse`, which
 * silently rounds any numeric literal beyond `Number.MAX_SAFE_INTEGER`
 * (9007199254740991 — 16 digits). Exchange order IDs are routinely 19:
 *
 * ```
 * 1234567890123456789  ->  JSON.parse  ->  1234567890123456800
 * ```
 *
 * An order ID corrupted that way is not a rounding inconvenience: a later cancel
 * or modify request targets a different order, or none at all.
 *
 * `safeJsonParse` quotes numeric literals of 15 or more characters before
 * parsing, so they arrive as **strings** with every digit intact. Consumers must
 * therefore accept `string | number` for such fields — which the schemas in
 * `src/types/apiSchemas.ts` already do — and must not do arithmetic on them
 * without going through `Decimal` or an explicit conversion.
 *
 * `src/routes/api/klines/+server.ts` already used this pattern; this helper
 * exists so the other exchange routes state the same intent in one place.
 */
/*
 * The `any` default mirrors the native `Response.json()`, which is itself typed
 * `Promise<any>`. Keeping that single concession here avoids an explicit `<any>`
 * argument at all eleven call sites, so the type surface is no looser than the
 * `response.json()` calls this replaces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readExchangeJson<T = any>(
  response: Response,
): Promise<T> {
  return safeJsonParse<T>(await response.text());
}
