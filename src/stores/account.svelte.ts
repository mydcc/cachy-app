/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

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

class AccountManager {
  positions = $state<Position[]>([]);
  openOrders = $state<OpenOrder[]>([]);
  assets = $state<Asset[]>([]);

  private syncCallback: (() => void) | null = null;

  reset() {
    this.positions = [];
    this.openOrders = [];
    this.assets = [];
    this.notifyListeners();
  }

  registerSyncCallback(fn: () => void) {
    this.syncCallback = fn;
  }

  // --- WS Actions ---

  updatePositionFromWs(data: any) {
    const index = this.positions.findIndex(
      (p) => String(p.positionId) === String(data.positionId),
    );

    // Robust check for close event or zero quantity
    const isClose =
      data.event === "CLOSE" ||
      new Decimal(data.qty || 0).isZero();

    if (isClose) {
      if (index !== -1) {
        // Remove from array (reactive splice in Svelte 5 via reassignment or method)
        this.positions.splice(index, 1);
        this.notifyListeners();
      }
    } else {
      // OPEN or UPDATE
      const existing = index !== -1 ? this.positions[index] : null;

      // Safety check for side
      let side = data.side
        ? data.side.toLowerCase()
        : existing
          ? existing.side
          : null;

      if (!side) {
        console.warn(
          "Bitunix WS: Ignored position update due to missing side. Requesting full sync.",
          data,
        );
        // [FIX] Trigger sync callback if available to repair state
        if (this.syncCallback) {
            this.syncCallback();
        }
        return;
      }

      // Safe Decimal Helpers
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
          // Preserve existing rarely updated fields
          liquidationPrice: existing.liquidationPrice,
          markPrice: existing.markPrice,
          breakEvenPrice: existing.breakEvenPrice,
        };
        this.positions[index] = newPos;
      } else {
        const newPos: Position = {
          positionId: data.positionId,
          symbol: data.symbol,
          side: side,
          size: new Decimal(data.qty || 0),
          entryPrice: new Decimal(data.averagePrice || data.avgOpenPrice || 0),
          leverage: new Decimal(data.leverage || 0),
          unrealizedPnl: new Decimal(data.unrealizedPNL || 0),
          margin: new Decimal(data.margin || 0),
          marginMode: data.marginMode ? data.marginMode.toLowerCase() : "cross",
          liquidationPrice: new Decimal(0),
          markPrice: new Decimal(0),
          breakEvenPrice: new Decimal(0),
        };
        this.positions.push(newPos);
        this.notifyListeners();
      }
    }
  }

  updateOrderFromWs(data: any) {
    const index = this.openOrders.findIndex(
      (o) => String(o.orderId) === String(data.orderId),
    );

    const isClosed = ["FILLED", "CANCELED", "PART_FILLED_CANCELED"].includes(
      data.orderStatus,
    );

    if (isClosed) {
      if (index !== -1) {
        this.openOrders.splice(index, 1);
      }
    } else {
      // Update or Create
      const existing = index !== -1 ? this.openOrders[index] : null;
      const safeDecimal = (val: any, fallback: Decimal) =>
        val !== undefined && val !== null ? new Decimal(val) : fallback;

      if (existing) {
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
        this.openOrders[index] = newOrder;
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
        this.openOrders.push(newOrder);
      }
    }
  }

  updateBalanceFromWs(data: any) {
    if (data.coin === "USDT") {
      const idx = this.assets.findIndex((a) => a.currency === "USDT");

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
        this.assets[idx] = newAsset;
      } else {
        this.assets.push(newAsset);
      }
    }
  }

  // --- Batch Updates ---

  updatePositionsBatch(dataList: any[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updatePositionFromWs(data);
    }
  }

  updateOrdersBatch(dataList: any[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updateOrderFromWs(data);
    }
  }

  updateBalanceBatch(dataList: any[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updateBalanceFromWs(data);
    }
  }

  // Compatibility
  private listeners = new Set<(value: any) => void>();
  private notifyTimer: any = null;

  private notifyListeners() {
    if (this.notifyTimer) clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      const snap = {
        positions: this.positions,
        openOrders: this.openOrders,
        assets: this.assets,
      };
      this.listeners.forEach((fn) => fn(snap));
      this.notifyTimer = null;
    }, 50);
  }

  subscribe(
    fn: (value: {
      positions: Position[];
      openOrders: OpenOrder[];
      assets: Asset[];
    }) => void,
  ): () => void {
    fn({
      positions: this.positions,
      openOrders: this.openOrders,
      assets: this.assets,
    });
    this.listeners.add(fn);

    // Auto-subscribe to changes if called within a component effect
    // but also manually notify via actions.
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const accountState = new AccountManager();
