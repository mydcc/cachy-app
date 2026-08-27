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

import type { NormalizedPosition } from "../../../types/exchange";
import type { OrderRequestPayload } from "../../../types/orderSchemas";

/**
 * The server-side venue boundary (FEAT-0228, ADR-0007).
 *
 * One module per venue holds request construction, signing and response
 * mapping; the proxy routes stay thin transport that validates, resolves a
 * venue and returns. Nothing here knows about the browser — the client-side
 * adapter is a separate layer on purpose, because it depends on Class A
 * state (ADR-0001) that must never reach the server bundle.
 */

export type VenueId = "bitunix" | "bitget";

/** Credentials as the routes extract them; `passphrase` is venue-dependent. */
export interface VenueCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

export interface ExchangeAccountData {
  available?: string;
  margin?: string;
  totalUnrealizedPnL?: string;
  marginCoin?: string;
  frozen?: string;
  transfer?: string;
  bonus?: string;
  positionMode?: string;
  crossUnrealizedPNL?: string;
  isolationUnrealizedPNL?: string;
  equity?: string;
}

/**
 * A candle as the klines route hands it to the client. The venues disagree
 * on whether the numbers arrive as strings or numbers, and the route has
 * always passed that through untouched — narrowing it here would be a
 * contract change, not a refactor.
 */
export interface VenueKline {
  timestamp: string | number;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}

export interface TickersQuery {
  /** Raw `symbols` query parameter; null asks for every ticker. */
  symbols: string | null;
}

export interface KlineQuery {
  symbol: string;
  interval: string;
  limit: number;
  start?: number;
  end?: number;
}

export interface VenueModule {
  readonly id: VenueId;

  /**
   * Whether this venue's REST auth needs a passphrase next to key and
   * secret. The routes ask instead of testing the venue name, which is the
   * whole point of the boundary.
   */
  readonly requiresPassphrase: boolean;

  /**
   * Venue-specific credential shape check. Returns null when the
   * credentials look usable, otherwise the message the route reports.
   * Kept separate from `requiresPassphrase` because the balance route has
   * never run this check and gaining it would change its behaviour.
   */
  validateKeys(creds: VenueCredentials): string | null;

  fetchAccount(creds: VenueCredentials): Promise<ExchangeAccountData>;

  fetchBalance(creds: VenueCredentials): Promise<string>;

  fetchKlines(query: KlineQuery): Promise<VenueKline[]>;

  fetchPositions(creds: VenueCredentials): Promise<NormalizedPosition[]>;

  /** Upstream URL for the public tickers endpoint. Needs no credentials. */
  tickersUrl(query: TickersQuery): string;

  /**
   * Whether an otherwise-successful body is this venue's way of saying the
   * symbol does not exist. Bitunix answers 200 with `code: 2` or a "system
   * error" message; Bitget does not, and never had this check applied.
   */
  isSymbolNotFoundBody(data: unknown): boolean;

  /**
   * Runs one order-route action. Resolves to `null` for an action this
   * venue does not implement — the route then answers `null` with 200,
   * exactly as the inline branches did.
   */
  executeOrder(
    creds: VenueCredentials,
    payload: OrderRequestPayload,
  ): Promise<unknown>;
}
