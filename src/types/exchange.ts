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

/*
 * The one internal shape orders and positions take once they are past an
 * exchange — FEAT-0016's second acceptance criterion.
 *
 * These lived in `types/bitunix.ts` until FEAT-0016, while their own comments
 * already said both exchanges' routes map into them. A shared shape filed
 * under one venue's name is how a reader learns the wrong thing: it invites
 * the next field to be added "because Bitunix sends it", which is the shape of
 * BUG-0001. The venue-specific wire types stay in `types/bitunix.ts` and
 * `types/bitget.ts`; what survives normalisation lives here.
 */

/** Normalized Internal Order Interface */
export interface NormalizedOrder {
  id: string;
  orderId: string;
  clientId?: string;
  symbol: string;
  type: string;
  side: string;
  price: string | null; // High-precision string or null
  amount: string; // High-precision string
  filled: string; // High-precision string
  status: string;
  time: number;
  mtime?: number;
  leverage?: string;
  marginMode?: string;
  positionMode?: string;
  reduceOnly?: boolean;
  fee: string; // High-precision string
  realizedPNL: string; // High-precision string
  tpPrice?: string;
  tpStopType?: string;
  tpOrderType?: string;
  slPrice?: string;
  slStopType?: string;
  slOrderType?: string;
  avgPrice?: string; // High-precision string
  role?: string;
}

// Normalized Internal Position Interface — shared shape both exchanges'
// /api/positions routes map their raw responses into.
export interface NormalizedPosition {
  positionId?: string;
  symbol: string;
  side: string;
  size?: string;
  entryPrice?: string;
  liquidationPrice?: string;
  markPrice?: string;
  margin?: string;
  unrealizedPnL?: string;
  leverage?: string;
  marginMode: string;
  // Bitunix-only (`marginRate`/`realizedPNL` on Get Pending Positions,
  // docs/bitunix-api/05_position.md:103-129). Not mapped for Bitget — no
  // verified field name for either, and BUG-0001 is the standing reminder
  // not to guess an exchange's wire format.
  marginRate?: string;
  realizedPnl?: string;
}
