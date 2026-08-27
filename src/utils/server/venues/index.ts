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

import { bitunixVenue } from "./bitunix";
import { bitgetVenue } from "./bitget";
import type { VenueId, VenueModule } from "./types";

export type {
  ExchangeAccountData,
  KlineQuery,
  VenueCredentials,
  VenueId,
  VenueKline,
  VenueModule,
} from "./types";
export { ORDER_ERRORS, type ExchangeError } from "./orderErrors";

/**
 * The venue registry (FEAT-0228). Adding a venue means adding one module
 * and one entry here — no proxy route changes.
 */
export const VENUES: Record<VenueId, VenueModule> = {
  bitunix: bitunixVenue,
  bitget: bitgetVenue,
};

/**
 * The venue the klines route falls back to for an unrecognised `provider`
 * query parameter. That fallback predates this registry: an unknown provider
 * has always been served Bitunix data rather than rejected with a 400.
 */
export const DEFAULT_VENUE_ID: VenueId = "bitunix";

/**
 * Resolves a venue by id, or `undefined` when the id is not a known venue.
 *
 * `Object.hasOwn` rather than a plain lookup: the klines and tickers routes
 * pass an unfiltered `provider` query parameter through here, and a plain
 * `VENUES[id]` also reaches Object.prototype — `?provider=toString` would
 * return a truthy function, skip the default-venue fallback, and turn a
 * request that used to serve Bitunix data into a 500.
 */
export function resolveVenue(id: string | null | undefined): VenueModule | undefined {
  if (!id) return undefined;
  if (!Object.hasOwn(VENUES, id)) return undefined;
  return VENUES[id as VenueId];
}
