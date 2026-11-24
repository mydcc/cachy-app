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
 * FEAT-0819 stage 4 — pure lifecycle projection and `(symbol, side)` slot
 * reservation for grid bots (ADR-0027, ADR-0028).
 */

import type { GridDocument, GridSide } from "../../lib/rules/types";
import type { PaperOrder, PaperPosition } from "../../stores/paperTrading.svelte";
import { gridAccountUnavailable, type BotAccount } from "./botAccount";
import { slotKey } from "./botState";
import type { GridLifecycleStatus, GridRuntimeRecord, GridStopReason } from "./gridStore";

export type GridLifeStatus = GridLifecycleStatus | "account_unavailable";

export interface GridBook {
  executingAccount: BotAccount | null;
  positions: readonly PaperPosition[];
  orders: readonly PaperOrder[];
  activeGrids?: readonly { grid: GridDocument; status: GridLifecycleStatus }[];
  bookUnreadable?: boolean;
}

export interface GridLifeState {
  status: GridLifeStatus;
  hasPosition: boolean;
  openOrderCount: number;
  counterOrderCount: number;
  stopReason?: GridStopReason;
}

export interface GridSlotConflict {
  reason: "manual-position" | "manual-order" | "bot-position" | "other-grid";
  ownerId?: string;
}

function normSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** True for any reduce-only / close order, including protective TP/SL plan legs. */
export function isClosingOrder(order: Pick<PaperOrder, "tradeSide" | "reduceOnly">): boolean {
  return order.tradeSide === "CLOSE" || order.reduceOnly;
}

/**
 * True ONLY for standalone reduce-only grid counter-orders, excluding attached
 * TP/SL plan legs (`planGroupId !== undefined`) so plans never inflate
 * `allocatedCloseQty` or `counterOrderCount`.
 */
export function isCounterOrder(
  order: Pick<PaperOrder, "tradeSide" | "reduceOnly" | "planGroupId">,
): boolean {
  return order.planGroupId === undefined && isClosingOrder(order);
}

/**
 * Statuses that reserve `(symbol, side)`. Once a grid is `"closed"`, its
 * orders are cancelled and its position is closed, freeing the slot.
 */
export function isGridOccupyingSlot(status: GridLifecycleStatus): boolean {
  return status === "active" || status === "paused" || status === "stopping";
}

/**
 * Derive one grid's runtime status from its document, persisted runtime
 * ledger, and the current paper book.
 *
 * When paper trading is off (`account_unavailable`), non-closed grids read as
 * `account_unavailable`: both the ladder and its protective `stop_out` are
 * frozen with the paper book.
 */
export function deriveGridState(
  grid: GridDocument,
  runtimeRecord: GridRuntimeRecord | undefined,
  book: GridBook,
): GridLifeState {
  const ownedPositions = book.positions.filter(
    (p) => p.origin === "bot" && p.botId === grid.id,
  );
  const ownedOrders = book.orders.filter(
    (o) => o.origin === "bot" && o.botId === grid.id,
  );
  const openOrderCount = ownedOrders.filter((o) => !isClosingOrder(o)).length;
  const counterOrderCount = ownedOrders.filter(isCounterOrder).length;
  const hasPosition = ownedPositions.length > 0;

  const baseStatus: GridLifecycleStatus = runtimeRecord?.status ?? "armed";

  if (baseStatus === "closed") {
    return {
      status: "closed",
      hasPosition,
      openOrderCount,
      counterOrderCount,
      stopReason: runtimeRecord?.stopReason,
    };
  }

  if (book.bookUnreadable || gridAccountUnavailable(grid, book.executingAccount)) {
    return {
      status: "account_unavailable",
      hasPosition,
      openOrderCount,
      counterOrderCount,
      stopReason: runtimeRecord?.stopReason,
    };
  }

  return {
    status: baseStatus,
    hasPosition,
    openOrderCount,
    counterOrderCount,
    stopReason: runtimeRecord?.stopReason,
  };
}

/**
 * Checks whether `(symbol, side)` is already occupied by a manual position,
 * a single-entry bot, or another grid. A position or bot on the opposite side
 * does not block.
 */
export function findGridSlotConflict(
  symbol: string,
  side: GridSide,
  gridId: string,
  book: GridBook,
): GridSlotConflict | null {
  const targetSymbol = normSymbol(symbol);
  const otherGrids = new Map<string, GridLifecycleStatus>();
  for (const entry of book.activeGrids ?? []) {
    if (entry.grid.id === gridId) continue;
    otherGrids.set(entry.grid.id, entry.status);
    if (
      normSymbol(entry.grid.symbol) === targetSymbol &&
      entry.grid.side === side &&
      isGridOccupyingSlot(entry.status)
    ) {
      return { reason: "other-grid", ownerId: entry.grid.id };
    }
  }

  for (const position of book.positions) {
    if (normSymbol(position.symbol) !== targetSymbol || position.side !== side) continue;
    if (position.origin === "bot" && position.botId === gridId) continue;
    if (position.origin === "bot") {
      const ownerId = position.botId;
      return {
        reason: ownerId && otherGrids.has(ownerId) ? "other-grid" : "bot-position",
        ownerId,
      };
    }
    return { reason: "manual-position" };
  }

  const openingOrderSide = side === "long" ? "BUY" : "SELL";
  for (const order of book.orders) {
    if (normSymbol(order.symbol) !== targetSymbol) continue;
    if (isClosingOrder(order) || order.side !== openingOrderSide) continue;
    if (order.origin === "bot" && order.botId === gridId) continue;
    if (order.origin === "bot") {
      const ownerId = order.botId;
      return {
        reason: ownerId && otherGrids.has(ownerId) ? "other-grid" : "bot-position",
        ownerId,
      };
    }
    return { reason: "manual-order" };
  }

  return null;
}

/**
 * Every `(symbol, side)` slot currently reserved by a grid bot.
 *
 * Used by single-entry bots (`botOrders.ts`) and `botsState.svelte.ts` so a
 * single-entry bot cannot open onto a slot already owned by an active, paused,
 * or stopping grid.
 */
export function reservedGridSlots(
  grids: readonly GridDocument[],
  runtimeStates: Readonly<Record<string, GridRuntimeRecord>>,
  orders: readonly PaperOrder[],
  positions: readonly PaperPosition[],
): Set<string> {
  const reserved = new Set<string>();
  const positionOwners = new Set(
    positions
      .filter((p) => p.origin === "bot" && typeof p.botId === "string")
      .map((p) => p.botId as string),
  );
  const orderOwners = new Set(
    orders
      .filter((o) => o.origin === "bot" && typeof o.botId === "string")
      .map((o) => o.botId as string),
  );

  for (const grid of grids) {
    const status = runtimeStates[grid.id]?.status ?? "armed";
    if (isGridOccupyingSlot(status) || positionOwners.has(grid.id) || orderOwners.has(grid.id)) {
      reserved.add(slotKey(normSymbol(grid.symbol), grid.side));
    }
  }
  return reserved;
}
