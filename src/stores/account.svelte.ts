/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { Decimal } from "decimal.js";
import { parseTimestamp, parseDecimal } from "../utils/utils";
import type { NormalizedPosition, NormalizedOrder } from "../types/bitunix";

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

// Raw WS position/order/balance payload fields as read below, named after
// Bitunix's wire format (qty, positionId, orderStatus, dealAmount, ctime).
// Bitget's WS handler (bitgetWs.ts) normalizes its differently-shaped
// payload to this format before calling these functions — see BUG-0001.
export interface RawWsPosition {
  positionId?: string | number;
  symbol?: string;
  event?: string;
  qty?: string | number;
  side?: string;
  averagePrice?: string | number;
  avgOpenPrice?: string | number;
  leverage?: string | number;
  unrealizedPNL?: string | number;
  margin?: string | number;
  marginMode?: string;
}

export interface RawWsOrder {
  orderId?: string | number;
  symbol?: string;
  orderStatus?: string;
  side?: string;
  type?: string;
  price?: string | number;
  qty?: string | number;
  dealAmount?: string | number;
  ctime?: string | number;
}

interface RawWsBalance {
  coin?: string;
  available?: string | number;
  margin?: string | number;
  frozen?: string | number;
}

interface AccountSnapshot {
  positions: Position[];
  openOrders: OpenOrder[];
  assets: Asset[];
}

/**
 * `parseDecimal` already falls back to `Decimal(0)` on a missing or
 * unparseable value (`new Decimal()` throws on a non-numeric string instead
 * of returning NaN — a malformed field on a raw WS push would otherwise
 * crash this store outright). This wraps it with a caller-supplied fallback
 * for the "keep the existing value" update paths below.
 */
const safeDecimal = (val: Decimal.Value | null | undefined, fallback: Decimal) =>
  val === undefined || val === null ? fallback : parseDecimal(val as string | number | Decimal);

class AccountManager {
  positions = $state<Position[]>([]);
  openOrders = $state<OpenOrder[]>([]);
  assets = $state<Asset[]>([]);

  private syncCallback: (() => void) | null = null;
  // Fired when a WS push closes an open order (FILLED/CANCELED/...) — lets
  // the UI eagerly refresh the (REST-only, non-live) order history instead
  // of only picking up the fill on the next manual tab switch.
  private orderCloseCallback: (() => void) | null = null;

  reset() {
    this.positions = [];
    this.openOrders = [];
    this.assets = [];
    this.notifyListeners();
  }

  registerSyncCallback(fn: () => void) {
    this.syncCallback = fn;
  }

  registerOrderCloseCallback(fn: (() => void) | null) {
    this.orderCloseCallback = fn;
  }

  // --- WS Actions ---

  updatePositionFromWs(data: RawWsPosition) {
    const index = this.positions.findIndex(
      (p) => String(p.positionId) === String(data.positionId),
    );

    // Robust check for close event or zero quantity
    const isClose =
      data.event === "CLOSE" ||
      safeDecimal(data.qty, new Decimal(0)).isZero();

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
          positionId: String(data.positionId),
          symbol: data.symbol ?? "",
          side: side as "long" | "short",
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
          positionId: String(data.positionId),
          symbol: data.symbol ?? "",
          side: side as "long" | "short",
          size: safeDecimal(data.qty, new Decimal(0)),
          entryPrice: safeDecimal(data.averagePrice || data.avgOpenPrice, new Decimal(0)),
          leverage: safeDecimal(data.leverage, new Decimal(0)),
          unrealizedPnl: safeDecimal(data.unrealizedPNL, new Decimal(0)),
          margin: safeDecimal(data.margin, new Decimal(0)),
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

  updateOrderFromWs(data: RawWsOrder) {
    const index = this.openOrders.findIndex(
      (o) => String(o.orderId) === String(data.orderId),
    );

    const isClosed = ["FILLED", "CANCELED", "PART_FILLED_CANCELED"].includes(
      data.orderStatus || "",
    );

    if (isClosed) {
      if (index !== -1) {
        this.openOrders.splice(index, 1);
        this.orderCloseCallback?.();
      }
    } else {
      // Update or Create
      const existing = index !== -1 ? this.openOrders[index] : null;

      if (existing) {
        const newOrder: OpenOrder = {
          orderId: String(data.orderId),
          symbol: data.symbol ?? "",
          side: (data.side ? data.side.toLowerCase() : existing.side) as "buy" | "sell",
          type: (data.type ? data.type.toLowerCase() : existing.type) as "limit" | "market",
          price: safeDecimal(data.price, existing.price),
          amount: safeDecimal(data.qty, existing.amount),
          filled: safeDecimal(data.dealAmount, existing.filled),
          status: data.orderStatus || existing.status,
          timestamp: parseTimestamp(data.ctime) || existing.timestamp,
        };
        this.openOrders[index] = newOrder;
      } else {
        const newOrder: OpenOrder = {
          orderId: String(data.orderId),
          symbol: data.symbol ?? "",
          side: (data.side ? data.side.toLowerCase() : "buy") as "buy" | "sell",
          type: (data.type ? data.type.toLowerCase() : "limit") as "limit" | "market",
          price: safeDecimal(data.price, new Decimal(0)),
          amount: safeDecimal(data.qty, new Decimal(0)),
          filled: safeDecimal(data.dealAmount, new Decimal(0)),
          status: data.orderStatus || "",
          timestamp: parseTimestamp(data.ctime) || Date.now(),
        };
        this.openOrders.push(newOrder);
      }
    }
  }

  updateBalanceFromWs(data: RawWsBalance) {
    if (data.coin === "USDT") {
      const idx = this.assets.findIndex((a) => a.currency === "USDT");

      const available = safeDecimal(data.available, new Decimal(0));
      const margin = safeDecimal(data.margin, new Decimal(0));
      const frozen = safeDecimal(data.frozen, new Decimal(0));
      const newAsset = {
        currency: "USDT",
        available,
        margin,
        frozen,
        total: available.plus(margin).plus(frozen),
      };

      if (idx !== -1) {
        this.assets[idx] = newAsset;
      } else {
        this.assets.push(newAsset);
      }
    }
  }

  // --- Batch Updates ---

  updatePositionsBatch(dataList: RawWsPosition[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updatePositionFromWs(data);
    }
  }

  updateOrdersBatch(dataList: RawWsOrder[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updateOrderFromWs(data);
    }
  }

  updateBalanceBatch(dataList: RawWsBalance[]) {
    if (!Array.isArray(dataList) || dataList.length === 0) return;
    for (const data of dataList) {
      this.updateBalanceFromWs(data);
    }
  }

  // --- REST snapshot hydration ---
  //
  // REST is the authoritative full snapshot (replaces the array outright);
  // WS pushes then keep it live via the incremental updaters above. Routing
  // REST responses through the same Decimal-safe parsing as WS — rather than
  // assigning the raw (string-typed) API JSON straight into these
  // Decimal-typed arrays — is what actually makes this the single source of
  // truth: before this, `PositionsSidebar.svelte` wrote raw REST JSON here
  // directly, silently violating the `Position`/`OpenOrder` types (nothing
  // caught it because `response.json()` returns `any`) and leaving
  // `positionId` unset, which broke matching against subsequent WS updates.

  hydratePositions(raw: NormalizedPosition[]) {
    this.positions = raw.map((p, i) => ({
      // Bitunix always returns positionId; Bitget's normalized shape
      // currently doesn't carry one — synthesize a stable key so hydration
      // still works, at the cost of not correlating with WS updates for
      // that exchange (tracked as a known gap, not silently broken).
      positionId: p.positionId ?? `${p.symbol}-${p.side}-${i}`,
      symbol: p.symbol,
      side: (p.side || "long").toLowerCase() as "long" | "short",
      size: parseDecimal(p.size),
      entryPrice: parseDecimal(p.entryPrice),
      leverage: parseDecimal(p.leverage),
      unrealizedPnl: parseDecimal(p.unrealizedPnL),
      margin: parseDecimal(p.margin),
      marginMode: (p.marginMode || "cross").toLowerCase(),
      liquidationPrice: parseDecimal(p.liquidationPrice),
      markPrice: parseDecimal(p.markPrice),
      breakEvenPrice: new Decimal(0),
    }));
    this.notifyListeners();
  }

  hydrateOpenOrders(raw: NormalizedOrder[]) {
    this.openOrders = raw.map((o) => ({
      orderId: String(o.orderId ?? o.id ?? ""),
      symbol: o.symbol,
      side: (o.side || "buy").toLowerCase() as "buy" | "sell",
      type: (o.type || "limit").toLowerCase() as "limit" | "market",
      price: parseDecimal(o.price),
      amount: parseDecimal(o.amount),
      filled: parseDecimal(o.filled),
      status: o.status || "",
      timestamp: Number(o.time) || Date.now(),
    }));
    this.notifyListeners();
  }

  hydrateBalance(raw: { available?: string; margin?: string; frozen?: string }) {
    const available = parseDecimal(raw.available);
    const margin = parseDecimal(raw.margin);
    const frozen = parseDecimal(raw.frozen);
    const newAsset: Asset = {
      currency: "USDT",
      available,
      margin,
      frozen,
      total: available.plus(margin).plus(frozen),
    };
    const idx = this.assets.findIndex((a) => a.currency === "USDT");
    if (idx !== -1) this.assets[idx] = newAsset;
    else this.assets.push(newAsset);
    this.notifyListeners();
  }

  /** Live sum of every open position's unrealized PnL — updates as the position channel pushes. */
  get totalUnrealizedPnl(): Decimal {
    return this.positions.reduce((sum, p) => sum.plus(p.unrealizedPnl), new Decimal(0));
  }

  // Compatibility
  private listeners = new Set<(value: AccountSnapshot) => void>();
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;

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
