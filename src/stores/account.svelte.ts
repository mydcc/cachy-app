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

  // Safe Decimal Helper specifically checking for valid finite inputs to prevent crash
  private safeDecimal(val: any, fallback: Decimal): Decimal {
      if (val === undefined || val === null) return fallback;
      try {
          const d = new Decimal(val);
          return (d.isFinite() && !d.isNaN()) ? d : fallback;
      } catch {
          return fallback;
      }
  }

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
      this.safeDecimal(data.qty, new Decimal(0)).isZero();

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

      if (existing) {
        const newPos: Position = {
          positionId: data.positionId,
          symbol: data.symbol,
          side: side,
          size: this.safeDecimal(data.qty, existing.size),
          entryPrice: this.safeDecimal(
            data.averagePrice || data.avgOpenPrice,
            existing.entryPrice,
          ),
          leverage: this.safeDecimal(data.leverage, existing.leverage),
          unrealizedPnl: this.safeDecimal(
            data.unrealizedPNL,
            existing.unrealizedPnl,
          ),
          margin: this.safeDecimal(data.margin, existing.margin),
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
          size: this.safeDecimal(data.qty, new Decimal(0)),
          entryPrice: this.safeDecimal(data.averagePrice || data.avgOpenPrice, new Decimal(0)),
          leverage: this.safeDecimal(data.leverage, new Decimal(0)),
          unrealizedPnl: this.safeDecimal(data.unrealizedPNL, new Decimal(0)),
          margin: this.safeDecimal(data.margin, new Decimal(0)),
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

      if (existing) {
        const newOrder: OpenOrder = {
          orderId: data.orderId,
          symbol: data.symbol,
          side: data.side ? data.side.toLowerCase() : existing.side,
          type: data.type ? data.type.toLowerCase() : existing.type,
          price: this.safeDecimal(data.price, existing.price),
          amount: this.safeDecimal(data.qty, existing.amount),
          filled: this.safeDecimal(data.dealAmount, existing.filled),
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
          price: this.safeDecimal(data.price, new Decimal(0)),
          amount: this.safeDecimal(data.qty, new Decimal(0)),
          filled: this.safeDecimal(data.dealAmount, new Decimal(0)),
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
