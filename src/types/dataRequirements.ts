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
 * Data Requirements System
 * 
 * Defines what data each UI component needs. This is the SINGLE SOURCE OF
 * TRUTH for component data dependencies.
 *
 * Pattern: Components declare requirements → marketWatcher subscribes to channels
 *
 * FEAT-0227: the requirement → channel-name mapping used to live here too,
 * spelled Bitunix's way (`depth_book5`, `price`) and handed to both venues.
 * It now sits on each adapter as `marketData.channelsForRequirement`, because
 * Bitget answers to `books5` and has no price channel at all. What stays here
 * is venue-neutral: which requirements a component has.
 */

/**
 * Data requirements for UI components.
 * Each component declares what data it needs.
 * 
 * CRITICAL: Do not remove items without updating corresponding components!
 */
export const DATA_REQUIREMENTS = {
  /** Market Overview Tile - needs ticker (price/24h stats) and depth (bid/ask) */
  MARKET_OVERVIEW: ['ticker', 'depth'] as const,
  
  /** Chart Component - needs ticker (klines are registered separately via marketWatcher) */
  CHART: ['ticker'] as const,
  
  /** Order Book Component - needs depth only */
  ORDER_BOOK: ['depth'] as const,
  
  /** Positions Panel - needs positions from private WebSocket */
  POSITIONS: ['positions'] as const,
  
  /** Dashboard - needs ticker for multiple symbols */
  DASHBOARD: ['ticker'] as const,
} as const;

/**
 * Valid data requirement types.
 * Use this for type-safe component declarations.
 */
export type DataRequirement = 
  | 'ticker' 
  | 'price'
  | 'depth' 
  | 'positions'
  | 'orders'
  | `kline_${string}`;
