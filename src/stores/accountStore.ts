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

import { writable } from "svelte/store";
import { Decimal } from "decimal.js";
import { parseTimestamp } from "../utils/utils";

export interface Position {
  positionId: string;
  symbol: string;
  side: "long" | "short";
  size: Decimal;
  entryPrice: Decimal;
  leverage: Decimal;
  unrealizedPnl: Decimal;
  margin: Decimal;
  marginMode: string;
  liquidationPrice: Decimal;
  markPrice: Decimal;
  breakEvenPrice: Decimal;
}

export interface OpenOrder {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  type: "limit" | "market";
  price: Decimal;
  amount: Decimal;
  filled: Decimal;
  status: string;
  timestamp: number;
}

export interface Asset {
  currency: string;
  available: Decimal;
  margin: Decimal;
  frozen: Decimal;
  total: Decimal;
}

export interface AccountState {
  positions: Position[];
  openOrders: OpenOrder[];
  assets: Asset[];
}

const initialState: AccountState = {
  positions: [],
  openOrders: [],
  assets: [],
};

function createAccountStore() {
  const { subscribe, set, update } = writable<AccountState>(initialState);

  return {
    subscribe,
    set,
    update, // Expose update
    reset: () => set(initialState),

    // WS Actions
    updatePositionFromWs: (data: any) => {
      update((store) => {
        const currentPositions = [...store.positions];
        const index = currentPositions.findIndex(
          (p) => String(p.positionId) === String(data.positionId),
        );

        // Robust check for close event or zero quantity
        const isClose =
          data.event === "CLOSE" ||
          (data.qty !== undefined && Number(data.qty) === 0);

        if (isClose) {
          if (index !== -1) {
            currentPositions.splice(index, 1);
          }
        } else {
          // OPEN or UPDATE
          // Prepare partial data, defaulting only if this is a NEW position
          const existing = index !== -1 ? currentPositions[index] : null;

          // Safety: If it's a new position, we need a side. If missing, we skip.
          // If it's an update, we use existing side if data.side is missing.
          let side = data.side
            ? data.side.toLowerCase()
            : existing
              ? existing.side
              : null;

          if (!side) {
            console.warn(
              "Bitunix WS: Ignored position update due to missing side",
              data,
            );
            return store;
          }

          if (existing) {
            // Merge logic: Only overwrite if field is present in data
            // For numerical strings like '0', '0.0', checking for undefined is safer than truthy check
            const safeDecimal = (val: any, fallback: Decimal) =>
              val !== undefined && val !== null ? new Decimal(val) : fallback;
            const safeString = (val: any, fallback: string) =>
              val !== undefined && val !== null ? String(val) : fallback;

            const newPos: Position = {
              positionId: data.positionId, // Key
              symbol: data.symbol, // Key
              side: side,
              size: safeDecimal(data.qty, existing.size),
              entryPrice: safeDecimal(
                data.averagePrice || data.avgOpenPrice,
                existing.entryPrice,
              ),
              leverage: safeDecimal(data.leverage, existing.leverage),
              unrealizedPnl: safeDecimal(
                data.unrealizedPNL,
                existing.unrealizedPnl,
              ),
              margin: safeDecimal(data.margin, existing.margin),
              marginMode: data.marginMode
                ? data.marginMode.toLowerCase()
                : existing.marginMode,
              // These fields are rarely in WS partial updates, preserve existing
              liquidationPrice: existing.liquidationPrice,
              markPrice: existing.markPrice,
              breakEvenPrice: existing.breakEvenPrice,
            };
            currentPositions[index] = newPos;
          } else {
            // New Position: Use data or safe defaults (0)
            const newPos: Position = {
              positionId: data.positionId,
              symbol: data.symbol,
              side: side,
              size: new Decimal(data.qty || 0),
              entryPrice: new Decimal(
                data.averagePrice || data.avgOpenPrice || 0,
              ),
              leverage: new Decimal(data.leverage || 0),
              unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
              margin: new Decimal(data.margin || 0),
              marginMode: data.marginMode
                ? data.marginMode.toLowerCase()
                : "cross",
              liquidationPrice: new Decimal(0),
              markPrice: new Decimal(0),
              breakEvenPrice: new Decimal(0),
            };
            currentPositions.push(newPos);
          }
        }
        return { ...store, positions: currentPositions };
      });
    },
    updateOrderFromWs: (data: any) => {
      update((store) => {
        const currentOrders = [...store.openOrders];
        const index = currentOrders.findIndex(
          (o) => String(o.orderId) === String(data.orderId),
        );

        const isClosed = [
          "FILLED",
          "CANCELED",
          "PART_FILLED_CANCELED",
        ].includes(data.orderStatus);

        if (isClosed) {
          if (index !== -1) {
            currentOrders.splice(index, 1);
          }
        } else {
          // Update or Create
          const existing = index !== -1 ? currentOrders[index] : null;

          if (existing) {
            const safeDecimal = (val: any, fallback: Decimal) =>
              val !== undefined && val !== null ? new Decimal(val) : fallback;

            const newOrder: OpenOrder = {
              orderId: data.orderId,
              symbol: data.symbol,
              side: data.side ? data.side.toLowerCase() : existing.side,
              type: data.type ? data.type.toLowerCase() : existing.type,
              price: safeDecimal(data.price, existing.price),
              amount: safeDecimal(data.qty, existing.amount),
              filled: safeDecimal(data.dealAmount, existing.filled),
              status: data.orderStatus || existing.status,
              timestamp: parseTimestamp(data.ctime) || existing.timestamp,
            };
            currentOrders[index] = newOrder;
          } else {
            const newOrder: OpenOrder = {
              orderId: data.orderId,
              symbol: data.symbol,
              side: data.side ? data.side.toLowerCase() : "buy",
              type: data.type ? data.type.toLowerCase() : "limit",
              price: new Decimal(data.price || 0),
              amount: new Decimal(data.qty || 0),
              filled: new Decimal(data.dealAmount || 0),
              status: data.orderStatus,
              timestamp: parseTimestamp(data.ctime) || Date.now(),
            };
            currentOrders.push(newOrder);
          }
        }
        return { ...store, openOrders: currentOrders };
      });
    },
    updateBalanceFromWs: (data: any) => {
      update((store) => {
        if (data.coin === "USDT") {
          const currentAssets = [...store.assets];
          const idx = currentAssets.findIndex((a) => a.currency === "USDT");

          const newAsset = {
            currency: "USDT",
            available: new Decimal(data.available || 0),
            margin: new Decimal(data.margin || 0),
            frozen: new Decimal(data.frozen || 0),
            total: new Decimal(data.available || 0)
              .plus(new Decimal(data.margin || 0))
              .plus(new Decimal(data.frozen || 0)),
          };

          if (idx !== -1) {
            currentAssets[idx] = newAsset;
          } else {
            currentAssets.push(newAsset);
          }

          return { ...store, assets: currentAssets };
        }
        return store;
      });
    },

    // --- Batch Updates for Performance ---
    updatePositionsBatch: (dataList: any[]) => {
      if (!Array.isArray(dataList) || dataList.length === 0) return;

      update((store) => {
        const currentPositions = [...store.positions];

        for (const data of dataList) {
          const index = currentPositions.findIndex(
            (p) => String(p.positionId) === String(data.positionId),
          );

          // Robust check for close event or zero quantity
          const isClose =
            data.event === "CLOSE" ||
            (data.qty !== undefined && Number(data.qty) === 0);

          if (isClose) {
            if (index !== -1) {
              currentPositions.splice(index, 1);
            }
          } else {
            // OPEN or UPDATE
            const existing = index !== -1 ? currentPositions[index] : null;

            let side = data.side
              ? data.side.toLowerCase()
              : existing
                ? existing.side
                : null;

            if (!side) {
              // Skip invalid updates
              continue;
            }

            // Safe Decimal helpers
            const safeDecimal = (val: any, fallback: Decimal) =>
              val !== undefined && val !== null ? new Decimal(val) : fallback;

            if (existing) {
              const newPos: Position = {
                positionId: data.positionId,
                symbol: data.symbol,
                side: side,
                size: safeDecimal(data.qty, existing.size),
                entryPrice: safeDecimal(
                  data.averagePrice || data.avgOpenPrice,
                  existing.entryPrice,
                ),
                leverage: safeDecimal(data.leverage, existing.leverage),
                unrealizedPnl: safeDecimal(
                  data.unrealizedPNL,
                  existing.unrealizedPnl,
                ),
                margin: safeDecimal(data.margin, existing.margin),
                marginMode: data.marginMode
                  ? data.marginMode.toLowerCase()
                  : existing.marginMode,
                liquidationPrice: existing.liquidationPrice,
                markPrice: existing.markPrice,
                breakEvenPrice: existing.breakEvenPrice,
              };
              currentPositions[index] = newPos;
            } else {
              const newPos: Position = {
                positionId: data.positionId,
                symbol: data.symbol,
                side: side,
                size: new Decimal(data.qty || 0),
                entryPrice: new Decimal(
                  data.averagePrice || data.avgOpenPrice || 0,
                ),
                leverage: new Decimal(data.leverage || 0),
                unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
                margin: new Decimal(data.margin || 0),
                marginMode: data.marginMode
                  ? data.marginMode.toLowerCase()
                  : "cross",
                liquidationPrice: new Decimal(0),
                markPrice: new Decimal(0),
                breakEvenPrice: new Decimal(0),
              };
              currentPositions.push(newPos);
            }
          }
        }
        return { ...store, positions: currentPositions };
      });
    },

    updateOrdersBatch: (dataList: any[]) => {
      if (!Array.isArray(dataList) || dataList.length === 0) return;

      update((store) => {
        const currentOrders = [...store.openOrders];

        for (const data of dataList) {
          const index = currentOrders.findIndex(
            (o) => String(o.orderId) === String(data.orderId),
          );

          const isClosed = [
            "FILLED",
            "CANCELED",
            "PART_FILLED_CANCELED",
          ].includes(data.orderStatus);

          if (isClosed) {
            if (index !== -1) {
              currentOrders.splice(index, 1);
            }
          } else {
            const existing = index !== -1 ? currentOrders[index] : null;

            if (existing) {
              const safeDecimal = (val: any, fallback: Decimal) =>
                val !== undefined && val !== null ? new Decimal(val) : fallback;

              const newOrder: OpenOrder = {
                orderId: data.orderId,
                symbol: data.symbol,
                side: data.side ? data.side.toLowerCase() : existing.side,
                type: data.type ? data.type.toLowerCase() : existing.type,
                price: safeDecimal(data.price, existing.price),
                amount: safeDecimal(data.qty, existing.amount),
                filled: safeDecimal(data.dealAmount, existing.filled),
                status: data.orderStatus || existing.status,
                timestamp: parseTimestamp(data.ctime) || existing.timestamp,
              };
              currentOrders[index] = newOrder;
            } else {
              const newOrder: OpenOrder = {
                orderId: data.orderId,
                symbol: data.symbol,
                side: data.side ? data.side.toLowerCase() : "buy",
                type: data.type ? data.type.toLowerCase() : "limit",
                price: new Decimal(data.price || 0),
                amount: new Decimal(data.qty || 0),
                filled: new Decimal(data.dealAmount || 0),
                status: data.orderStatus,
                timestamp: parseTimestamp(data.ctime) || Date.now(),
              };
              currentOrders.push(newOrder);
            }
          }
        }
        return { ...store, openOrders: currentOrders };
      });
    },

    updateBalanceBatch: (dataList: any[]) => {
      if (!Array.isArray(dataList) || dataList.length === 0) return;

      update((store) => {
        const currentAssets = [...store.assets];

        for (const data of dataList) {
          if (data.coin === "USDT") {
            const idx = currentAssets.findIndex((a) => a.currency === "USDT");

            const newAsset = {
              currency: "USDT",
              available: new Decimal(data.available || 0),
              margin: new Decimal(data.margin || 0),
              frozen: new Decimal(data.frozen || 0),
              total: new Decimal(data.available || 0)
                .plus(new Decimal(data.margin || 0))
                .plus(new Decimal(data.frozen || 0)),
            };

            if (idx !== -1) {
              currentAssets[idx] = newAsset;
            } else {
              currentAssets.push(newAsset);
            }
          }
        }
        return { ...store, assets: currentAssets };
      });
    }
  };
}

export const accountStore = createAccountStore();
