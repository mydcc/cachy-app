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
import type { AccountSettingsPayload } from "../../../types/accountSettingsSchemas";
import type { PresignedEnvelope } from "../presignedEnvelope";

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

/**
 * Which price series a candle request wants.
 *
 * On a perpetual the last traded price and the mark price differ, and a rule
 * that keys off one must not be answered from the other. Absent means `last`,
 * which is what every caller before FEAT-0390 asked for.
 */
export type KlinePriceSource = "last" | "mark";

export interface KlineQuery {
  symbol: string;
  interval: string;
  limit: number;
  start?: number;
  end?: number;
  /** Defaults to `last`. Only meaningful where `supportsMarkKlines` is true. */
  priceSource?: KlinePriceSource;
}

export interface VenueModule {
  readonly id: VenueId;

  /**
   * Whether this venue's REST auth needs a passphrase next to key and
   * secret. The routes ask instead of testing the venue name, which is the
   * whole point of the boundary.
   */
  readonly requiresPassphrase: boolean;

  fetchAccount(envelope: PresignedEnvelope): Promise<ExchangeAccountData>;

  fetchBalance(envelope: PresignedEnvelope): Promise<string>;

  /**
   * Whether this venue can serve mark-price candles.
   *
   * Asked rather than assumed, the same way `requiresPassphrase` is: Bitunix
   * takes a `type` parameter on its kline endpoint, Bitget's mix candles
   * endpoint is last-price only and would answer a mark request with last-price
   * data. Returning those silently is the failure FEAT-0390 exists to remove, so
   * the caller checks this and refuses instead.
   */
  readonly supportsMarkKlines: boolean;

  fetchKlines(query: KlineQuery): Promise<VenueKline[]>;

  fetchPositions(envelope: PresignedEnvelope): Promise<NormalizedPosition[]>;

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
   *
   * `envelope` is the pre-signed credential the client sent and `venueBody` the
   * exact bytes it signed; the venue forwards both and computes no signature of
   * its own, which is what keeps the secret off this process (ADR-0013). On the
   * route's three query-signed read actions (`pending`, `history`,
   * `order-detail`) there is no body: the signature covers `envelope.query`, and
   * `venueBody` is unused.
   */
  executeOrder(
    envelope: PresignedEnvelope,
    payload: OrderRequestPayload,
    venueBody: string,
  ): Promise<unknown>;

  /**
   * Runs one account-settings write (FEAT-0068): leverage, margin mode,
   * position mode or an isolated position's margin.
   *
   * `envelope` is the pre-signed credential the client sent and `venueBody` the
   * exact bytes it signed; the venue forwards both and computes no signature of
   * its own, which is what keeps the secret off this process (ADR-0013).
   *
   * Resolves to `null` for a venue that has none of these wired, and the
   * route answers 400 rather than 200 — unlike `executeOrder`, whose `null`
   * predates this contract and has to stay a 200 for compatibility. A write
   * that answered "success, nothing happened" would let a trader believe
   * their leverage moved when it did not, which is the one outcome this
   * family must never produce.
   */
  executeAccountSetting(
    envelope: PresignedEnvelope,
    payload: AccountSettingsPayload,
    venueBody: string,
  ): Promise<unknown>;
}
