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
 * Defines what data each UI component needs and maps requirements to WebSocket channels.
 * This is the SINGLE SOURCE OF TRUTH for component data dependencies.
 * 
 * Pattern: Components declare requirements → marketWatcher subscribes to channels
 */

/**
 * Data requirements for UI components.
 * Each component declares what data it needs.
 * 
 * CRITICAL: Do not remove items without updating corresponding components!
 */
export const DATA_REQUIREMENTS = {
  /** Market Overview Tile - needs price, depth (bid/ask), and funding */
  MARKET_OVERVIEW: ['ticker', 'depth'] as const,
  
  /** Chart Component - needs price and klines */
  CHART: ['ticker'] as const,
  
  /** Order Book Component - needs depth only */
  ORDER_BOOK: ['depth'] as const,
  
  /** Positions Panel - needs positions from private WebSocket */
  POSITIONS: ['positions'] as const,
  
  /** Dashboard - needs ticker for multiple symbols */
  DASHBOARD: ['ticker'] as const,
} as const;

/**
 * Maps data requirements to WebSocket channels.
 * 
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for channel mapping.
 * If you modify this, update corresponding WebSocket handlers in bitunixWs.ts
 */
export const REQUIREMENT_TO_CHANNELS: Record<string, string[]> = {
  // Public channels
  'ticker': ['ticker'],
  'depth': ['depth_book5'],
  
  // Private channels
  'positions': ['positions'],
  'orders': ['orders'],
  
  // Kline channels are handled separately (timeframe-specific)
  // e.g., 'kline_1h', 'kline_5m', etc.
};

/**
 * Valid data requirement types.
 * Use this for type-safe component declarations.
 */
export type DataRequirement = 
  | 'ticker' 
  | 'depth' 
  | 'positions'
  | 'orders'
  | `kline_${string}`;

/**
 * Helper to get WebSocket channels for a requirement.
 * @param requirement Data requirement (e.g., 'ticker', 'depth', 'kline_1h')
 * @returns Array of WebSocket channel names
 */
export function getChannelsForRequirement(requirement: string): string[] {
  // Handle kline specially (timeframe-specific)
  if (requirement.startsWith('kline_')) {
    return [requirement]; // e.g., 'kline_1h', 'kline_5m'
  }
  
  // Use mapping for standard requirements
  return REQUIREMENT_TO_CHANNELS[requirement] || [];
}
