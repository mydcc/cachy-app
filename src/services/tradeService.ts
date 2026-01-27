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
 * Trade Execution Service
 *
 * CRITICAL: This service is ONLY available for Pro users with API credentials.
 * Community users do NOT have access to trade execution functions.
 *
 * Features:
 * - Place Market & Limit Orders
 * - Modify & Cancel Orders
 * - Close Positions (normal & flash)
 * - Batch Operations
 * - Order History & Details
 *
 * Architecture:
 * - Strict capability checks via TradeExecutionGuard
 * - All methods require: isPro = true AND API Secret Key
 * - Bitunix API integration with signed requests
 */

import { settingsState } from "../stores/settings.svelte";
import { marketState } from "../stores/market.svelte";
import { logger } from "../services/logger";
import { omsService } from "./omsService";
import { rmsService } from "./rmsService";
import { apiService } from "./apiService";
import type { OMSOrder } from "./omsTypes";
import type { BitunixOrder, BitunixResponse } from "../types/bitunix";
import Decimal from "decimal.js";
import CryptoJS from "crypto-js";

// ==================== TYPES ====================

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type PositionSide = "long" | "short";
export type TimeInForce = "GTC" | "IOC" | "FOK" | "PostOnly";

export interface PlaceOrderParams {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price?: Decimal; // Required for limit orders
  amount: Decimal;
  leverage?: number;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
  timeInForce?: TimeInForce;
  reduceOnly?: boolean;
}

export interface ModifyOrderParams {
  orderId: string;
  price?: Decimal;
  amount?: Decimal;
  stopLoss?: Decimal;
  takeProfit?: Decimal;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: OrderSide;
  status: "pending" | "filled" | "cancelled";
  price: Decimal;
  amount: Decimal;
  timestamp: number;
}

export interface BatchOrderParams {
  orders: PlaceOrderParams[];
}

export interface PositionCloseParams {
  symbol: string;
  positionSide: PositionSide;
  amount?: Decimal; // Optional: Partial close
}

/**
 * Bitunix API Error
 */
export class BitunixApiError extends Error {
  constructor(
    public code: number | string,
    public bitunixMessage: string,
  ) {
    super(`Bitunix Error ${code}: ${bitunixMessage}`);
    this.name = "BitunixApiError";
  }

  get isUserFixable(): boolean {
    // Errors that user can fix
    // Cast code to number for comparison if possible
    const c = Number(this.code);
    return [20003, 20005, 30001, 30013, 30018].includes(c);
  }

  get requiresApiSetup(): boolean {
    // Errors that require API setup
    const c = Number(this.code);
    return [10003, 10004, 20011].includes(c);
  }
}

// ==================== GUARD ====================

/**
 * Trade Execution Guard
 *
 * Ensures that only authorized Pro users can execute trades.
 * Prevents unauthorized access to trading functions.
 */
class TradeExecutionGuard {
  /**
   * Ensures user is authorized to execute trades.
   * Throws error if not authorized.
   *
   * @throws Error if user lacks Pro license or API credentials
   */
  static ensureAuthorized(): void {
    if (!settingsState.capabilities.tradeExecution) {
      throw new Error("TRADE_ERRORS.UNAUTHORIZED");
    }

    const apiKey = settingsState.apiKeys?.bitunix?.key;
    const apiSecret = settingsState.apiKeys?.bitunix?.secret;

    if (!apiKey || !apiSecret) {
      throw new Error("TRADE_ERRORS.API_CREDENTIALS_MISSING");
    }
  }

  /**
   * Soft check: Returns true if user is authorized.
   * Does NOT throw an error.
   *
   * @returns true if authorized, false otherwise
   */
  static isAuthorized(): boolean {
    try {
      this.ensureAuthorized();
      return true;
    } catch {
      return false;
    }
  }
}

// ==================== HELPERS ====================

/**
 * Generates a random nonce string (32 characters)
 */
function generateNonce(): string {
  // Use crypto-js for random bytes or simple time-random fallback
  // crypto-js doesn't have a direct randomBytes helper like Node
  // We can use random words
  const wordArray = CryptoJS.lib.WordArray.random(16);
  return wordArray.toString();
}

// ==================== SERVICE ====================

/**
 * Trade Execution Service
 *
 * Provides trade execution functionality for Pro users.
 * All methods are protected by capability checks.
 */
const BITUNIX_API_URL = "https://fapi.bitunix.com";

export class TradeExecutionService {
  private readonly baseUrl = BITUNIX_API_URL;

  /**
   * Signed Request to Bitunix API
   * Implements Bitunix's double SHA256 signature algorithm
   *
   * @param method HTTP method
   * @param path API endpoint path
   * @param body Request body (for POST/PUT)
   * @returns API response
   * @throws Error if unauthorized, network error, or API error
   */
  private async signedRequest<T = any>(
    method: "GET" | "POST" | "DELETE" | "PUT",
    path: string,
    body?: any,
  ): Promise<BitunixResponse<T>> {
    // 1. Ensure authorization
    TradeExecutionGuard.ensureAuthorized();

    // 2. Get API credentials
    const apiKey = settingsState.apiKeys?.bitunix?.key!;
    const apiSecret = settingsState.apiKeys?.bitunix?.secret!;

    // 3. Generate timestamp and nonce
    const timestamp = Date.now().toString();
    const nonce = generateNonce();

    // 4. Prepare body string (compressed JSON, no spaces)
    const bodyString = body ? JSON.stringify(body).replace(/\s/g, "") : "";

    // 5. Generate signature (Bitunix double SHA256)
    // Step 1: digest = SHA256(nonce + timestamp + api-key + body)
    const digest = CryptoJS.SHA256(nonce + timestamp + apiKey + bodyString).toString(CryptoJS.enc.Hex);

    // Step 2: sign = SHA256(digest + secretKey)
    const signature = CryptoJS.SHA256(digest + apiSecret).toString(CryptoJS.enc.Hex);

    // 6. Prepare headers
    const headers: Record<string, string> = {
      "api-key": apiKey,
      nonce: nonce,
      timestamp: timestamp,
      sign: signature,
      "Content-Type": "application/json",
    };

    // 7. Prepare request options
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers,
      ...(body && { body: bodyString }),
    };

    // 8. Execute request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 9. Parse response
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: BitunixResponse<T> = await response.json();

      // 10. Check Bitunix API error
      // Bitunix uses "0" (string) or 0 (number) for success
      if (data.code !== 0 && data.code !== "0") {
        throw new BitunixApiError(data.code, data.msg);
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (error.name === "AbortError") {
        throw new Error("REQUEST_TIMEOUT: Trade request took too long (>10s)");
      }

      // Re-throw API errors
      if (error instanceof BitunixApiError) {
        throw error;
      }

      // Wrap generic errors
      throw new Error(`NETWORK_ERROR: ${error.message}`);
    }
  }

  /**
   * 1. PLACE ORDER
   * Places a new order (Market or Limit).
   *
   * @param params Order parameters
   * @returns Order result with ID and status
   * @throws Error if unauthorized or API call fails
   */
  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    TradeExecutionGuard.ensureAuthorized();

    // 0. Risk Management Validation
    // Defensive validation: reject empty/negative amounts early
    if (!params.amount || params.amount.lte(0) || !params.amount.isFinite()) {
      throw new Error("TRADE_ERRORS.AMOUNT_ZERO");
    }

    let approxPrice = params.price;
    if (params.type === "limit") {
      if (!approxPrice) {
        throw new Error("TRADE_ERRORS.PRICE_REQUIRED");
      }
      if (approxPrice.lte(0) || !approxPrice.isFinite()) {
        throw new Error("TRADE_ERRORS.PRICE_ZERO");
      }
    }

    if (!approxPrice || approxPrice.lte(0)) {
      // For Market Orders, try to get price from Store or API
      const fromStore = marketState.data[params.symbol]?.lastPrice;
      if (fromStore && fromStore.gt(0)) {
        approxPrice = fromStore;
      } else {
        // Fallback: Fetch fresh price; if unavailable, fail safe.
        approxPrice = await apiService.fetchBitunixPrice(params.symbol, "high", 3000).catch((e) => {
          logger.error("market", "Price lookup failed for risk check", e);
          return undefined;
        });
        if (!approxPrice || approxPrice.lte(0)) {
          throw new Error("TRADE_ERRORS.PRICE_UNAVAILABLE");
        }
      }
    }

    // Calculate Notional Value (guaranteed >0 here)
    const finalPrice = approxPrice;
    const amountUsdt = params.amount.times(finalPrice);
    const riskCheck = rmsService.validateTrade(params.symbol, params.side, amountUsdt);

    if (!riskCheck.allowed) {
      logger.error("market", "RMS Validation Failed:", riskCheck.reason);
      throw new Error(`TRADE_ERRORS.RISK_LIMIT_EXCEEDED: ${riskCheck.reason}`);
    }

    logger.log("market", "Place Order (RMS Approved):", params);

    // 1. Validate parameters
    if (params.type === "limit" && !params.price) {
      throw new Error("TRADE_ERRORS.PRICE_REQUIRED");
    }

    // 2. Map to Bitunix API format
    // 2. Map to Bitunix API format
    const bitunixSide = params.side.toUpperCase() as "BUY" | "SELL";
    const bitunixType = params.type.toUpperCase() as "LIMIT" | "MARKET";

    // Use string format for financial values to preserve precision
    const body: any = {
      symbol: params.symbol,
      side: bitunixSide,
      orderType: bitunixType,
      qty: params.amount.toString(),
    };

    if (params.type === "limit" && params.price) {
      body.price = params.price.toString();
    }
    if (params.leverage) body.leverage = params.leverage;
    if (params.timeInForce) body.effect = params.timeInForce.toUpperCase().replace("POSTONLY", "POST_ONLY");
    if (params.reduceOnly) body.reduceOnly = true;

    // TP/SL
    if (params.takeProfit) {
      body.tpPrice = params.takeProfit.toString();
      body.tpStopType = "PRICE";
      body.tpOrderType = "MARKET";
    }
    if (params.stopLoss) {
      body.slPrice = params.stopLoss.toString();
      body.slStopType = "PRICE";
      body.slOrderType = "MARKET";
    }

    // 3. Execute API call
    const response = await this.signedRequest<BitunixOrder>("POST", "/api/v1/futures/trade/place_order", body);

    // 4. Update OMS
    const raw = response.data;
    const omsOrder: OMSOrder = {
      id: raw.orderId,
      symbol: params.symbol,
      side: params.side,
      type: params.type,
      status: this.mapOrderStatus(raw.status || "NEW") as any,
      price: new Decimal(raw.price || params.price || 0),
      amount: new Decimal(raw.qty || raw.amount || 0),
      filledAmount: new Decimal(raw.tradeQty || 0), // Use tradeQty from BitunixOrder
      timestamp: raw.ctime || raw.createTime || Date.now()
    };
    omsService.updateOrder(omsOrder);

    // 5. Map response to OrderResult (Keep for compatibility)
    const result: OrderResult = {
      orderId: omsOrder.id,
      symbol: omsOrder.symbol,
      side: omsOrder.side,
      status: omsOrder.status as any,
      price: omsOrder.price,
      amount: omsOrder.amount,
      timestamp: omsOrder.timestamp,
    };

    logger.log("market", "Order placed and synced with OMS:", result.orderId);
    return result;
  }

  /**
   * Maps Bitunix order status to internal status
   */
  private mapOrderStatus(
    bitunixStatus: string,
  ): "pending" | "filled" | "cancelled" {
    switch (bitunixStatus.toUpperCase()) {
      case "NEW":
      case "PARTIALLY_FILLED":
        return "pending";
      case "FILLED":
        return "filled";
      case "CANCELED":
      case "CANCELLED":
      case "REJECTED":
        return "cancelled";
      default:
        logger.warn("market", "Unknown status:", bitunixStatus);
        return "pending";
    }
  }

  /**
   * 2. MODIFY ORDER
   * Modifies an existing order (price, size, SL/TP).
   *
   * @param params Modification parameters
   * @returns Updated order result
   * @throws Error if unauthorized or API call fails
   */
  async modifyOrder(params: ModifyOrderParams): Promise<OrderResult> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Modify Order:", params);

    const body: any = { orderId: params.orderId };
    if (params.price) body.price = params.price.toString();
    if (params.amount) body.qty = params.amount.toString();
    // Bitunix modify returns a simplified structure or the full order?
    // Using loose type here as modify response might differ slightly, but let's try strict.
    const response = await this.signedRequest<BitunixOrder>("POST", "/api/v1/futures/trade/modify_order", body);
    const data = response.data;
    return {
      orderId: data.orderId,
      symbol: data.symbol,
      side: (data.side || "").toLowerCase() as OrderSide,
      status: this.mapOrderStatus(data.status || "NEW"),
      price: new Decimal(data.price || 0),
      amount: new Decimal(data.qty || data.amount || 0),
      timestamp: data.ctime || data.createTime || Date.now(),
    };
  }

  /**
   * 3. CANCEL ORDER
   * Cancels a single order.
   *
   * @param orderId Order ID to cancel
   * @throws Error if unauthorized or API call fails
   */
  async cancelOrder(orderId: string): Promise<void> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Cancel Order:", orderId);

    // Bitunix API: Cancel single order
    const body = {
      orderId: orderId,
    };

    await this.signedRequest(
      "POST",
      "/api/v1/futures/trade/cancel_orders",
      body,
    );

    logger.log("market", "Order cancelled successfully:", orderId);
  }

  /**
   * 4. CANCEL ORDERS (Symbol)
   * Cancels all open orders for a specific symbol.
   *
   * @param symbol Symbol to cancel orders for
   * @returns Number of cancelled orders
   * @throws Error if unauthorized or API call fails
   */
  async cancelOrders(symbol: string): Promise<number> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Cancel Orders for symbol:", symbol);

    // Bitunix API: Cancel all orders for symbol
    const body = {
      symbol: symbol,
    };

    const response = await this.signedRequest<{
      success: string[];
      failed: string[];
    }>("POST", "/api/v1/futures/trade/cancel_orders", body);

    const cancelledCount = response.data?.success?.length || 0;
    logger.log("market", "Cancelled " + cancelledCount + " orders for " + symbol);

    return cancelledCount;
  }

  /**
   * 5. CANCEL ALL ORDERS
   * Cancels ALL open orders in the account.
   *
   * @returns Number of cancelled orders
   * @throws Error if unauthorized or API call fails
   */
  async cancelAllOrders(): Promise<number> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Cancel ALL Orders");

    // Bitunix API: Cancel all orders (no symbol filter)
    const response = await this.signedRequest<{
      success: string[];
      failed: string[];
    }>("POST", "/api/v1/futures/trade/cancel_all_orders", {});

    const cancelledCount = response.data?.success?.length || 0;
    logger.log("market", "Cancelled " + cancelledCount + " orders total");

    return cancelledCount;
  }

  /**
   * 6. CLOSE POSITION
   * Closes a position (fully or partially).
   *
   * @param params Position close parameters
   * @returns Order result from closing order
   * @throws Error if unauthorized or API call fails
   */
  async closePosition(params: PositionCloseParams): Promise<OrderResult> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Close Position:", params);

    // Close position = Place opposite order with reduceOnly flag
    const oppositeSide: OrderSide =
      params.positionSide === "long" ? "sell" : "buy";

    // CRITICAL: Strict position size binding to prevent overfills
    let closeAmount: Decimal;

    if (params.amount) {
      // User-specified partial close
      closeAmount = params.amount;
    } else {
      // Full close: MUST use known position from OMS
      const positions = omsService.getPositions();
      const knownPos = positions.find(p => p.symbol === params.symbol && p.side === params.positionSide);

      if (knownPos && knownPos.amount && knownPos.amount.gt(0)) {
        closeAmount = knownPos.amount;
        logger.log("market", `[ClosePosition] Using OMS size: ${closeAmount}`);
      } else {
        // CRITICAL: If position is unknown, FAIL SAFE - do not execute
        throw new Error("TRADE_ERRORS.POSITION_UNKNOWN");
      }
    }

    // Use placeOrder with reduceOnly flag
    const orderParams: PlaceOrderParams = {
      symbol: params.symbol,
      side: oppositeSide,
      type: "market", // Market order for immediate close
      amount: closeAmount,
      reduceOnly: true, // CRITICAL: Prevents opening opposite position
    };

    const result = await this.placeOrder(orderParams);

    logger.log("market", "Position closed successfully");

    return result;
  }

  /**
   * 7. CLOSE ALL POSITIONS
   * Closes ALL open positions (Market Order).
   *
   * @returns Array of order results from closing orders
   * @throws Error if unauthorized or API call fails
   */
  async closeAllPositions(): Promise<OrderResult[]> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Close ALL Positions");

    const positions = omsService.getPositions().filter((p) => p.amount.gt(0));

    if (positions.length === 0) {
      return [];
    }

    const promises = positions.map(async (p) => {
      try {
        return await this.closePosition({
          symbol: p.symbol,
          positionSide: p.side,
          amount: p.amount,
        });
      } catch (e) {
        logger.error("market", `Failed to close ${p.symbol}`, e);
        return null;
      }
    });

    const outcomes = await Promise.all(promises);
    return outcomes.filter((r): r is OrderResult => r !== null);
  }

  /**
   * 8. FLASH CLOSE POSITION
   * Closes position immediately with Market Order.
   * Guarantees immediate execution (may have higher slippage).
   *
   * @param symbol Symbol of position to close
   * @param positionSide Side of position (long/short)
   * @returns Order result from flash close
   * @throws Error if unauthorized or API call fails
   */
  async flashClosePosition(
    symbol: string,
    positionSide: PositionSide,
  ): Promise<OrderResult> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Flash Close Position: " + symbol + " " + positionSide);

    const oppositeSide: OrderSide = positionSide === "long" ? "sell" : "buy";

    // CRITICAL: Use known position size from OMS
    const positions = omsService.getPositions();
    const knownPos = positions.find(p => p.symbol === symbol && p.side === positionSide);

    if (!knownPos || !knownPos.amount || !knownPos.amount.gt(0)) {
      throw new Error("TRADE_ERRORS.POSITION_UNKNOWN");
    }

    return await this.placeOrder({
      symbol,
      side: oppositeSide,
      type: "market",
      amount: knownPos.amount, // Exact position size
      reduceOnly: true,
    });
  }

  /**
   * 9. BATCH ORDER
   * Places multiple orders simultaneously.
   *
   * @param params Batch order parameters
   * @returns Array of order results
   * @throws Error if unauthorized or API call fails
   */
  async batchOrder(params: BatchOrderParams): Promise<OrderResult[]> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Batch Order: " + params.orders.length + " orders");

    if (params.orders.length > 10)
      throw new Error("TRADE_ERRORS.BATCH_LIMIT");
    const bitunixOrders = params.orders.map((o) => ({
      symbol: o.symbol,
      side: o.side.toUpperCase(),
      orderType: o.type.toUpperCase(),
      qty: new Decimal(o.amount).toString(),
      ...(o.type === "limit" && o.price ? { price: new Decimal(o.price).toString() } : {}),
      ...(o.leverage ? { leverage: o.leverage } : {}),
      ...(o.reduceOnly ? { reduceOnly: true } : {}),
    }));
    const response = await this.signedRequest<{
      orders: Array<{
        orderId: string;
        symbol: string;
        side: string;
        orderType: string;
        price: string;
        qty: string;
        status: string;
        createTime: number;
      }>;
    }>("POST", "/api/v1/futures/trade/batch_order", { orders: bitunixOrders });
    return (response.data?.orders || []).map((o) => ({
      orderId: o.orderId,
      symbol: o.symbol,
      side: o.side.toLowerCase() as OrderSide,
      status: this.mapOrderStatus(o.status),
      price: new Decimal(o.price),
      amount: new Decimal(o.qty),
      timestamp: o.createTime,
    }));
  }

  /**
   * 10. GET PENDING ORDERS
   * Fetches all open orders.
   *
   * @param symbol Optional: Filter by symbol
   * @returns Array of pending orders
   * @throws Error if unauthorized or API call fails
   */
  async getPendingOrders(symbol?: string): Promise<OrderResult[]> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Get Pending Orders, symbol: " + (symbol || "all"));

    const params = symbol ? `?symbol=${symbol}` : "";
    // Returns { orders: [...] } or list? Bitunix doc says wrapper.
    const response = await this.signedRequest<{ orders: BitunixOrder[] }>("GET", `/api/v1/futures/trade/get_pending_orders${params}`);

    // If it's a list directly or wrapper
    const list = response.data.orders || (Array.isArray(response.data) ? response.data : []);

    const orders = list.map((o: BitunixOrder) => {
      const omsOrder: OMSOrder = {
        id: o.orderId,
        symbol: o.symbol,
        side: (o.side || "").toLowerCase() as any,
        type: (o.type || "").toLowerCase() as any,
        status: this.mapOrderStatus(o.status || "NEW") as any,
        price: new Decimal(o.price || 0),
        amount: new Decimal(o.qty || o.amount || 0),
        filledAmount: new Decimal(o.tradeQty || 0),
        timestamp: o.ctime || o.createTime || Date.now()
      };
      omsService.updateOrder(omsOrder);

      return {
        orderId: omsOrder.id,
        symbol: omsOrder.symbol,
        side: omsOrder.side as any,
        status: omsOrder.status as any,
        price: omsOrder.price,
        amount: omsOrder.amount,
        timestamp: omsOrder.timestamp,
      };
    });

    logger.log("market", "Found " + orders.length + " pending orders");
    return orders;
  }

  /**
   * 11. GET ORDER DETAIL
   * Fetches details for a specific order.
   *
   * @param orderId Order ID
   * @returns Order details
   * @throws Error if unauthorized or API call fails
   */
  async getOrderDetail(orderId: string): Promise<OrderResult> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Get Order Detail:", orderId);

    const response = await this.signedRequest<BitunixOrder>("GET", `/api/v1/futures/trade/get_order_detail?orderId=${orderId}`);
    const data = response.data;
    return {
      orderId: data.orderId,
      symbol: data.symbol,
      side: (data.side || "").toLowerCase() as OrderSide,
      status: this.mapOrderStatus(data.status || "NEW"),
      price: new Decimal(data.price || 0),
      amount: new Decimal(data.qty || data.amount || 0),
      timestamp: data.ctime || data.createTime || Date.now(),
    };
  }

  /**
   * 12. GET HISTORY ORDERS
   * Fetches historical orders (completed/cancelled).
   *
   * @param symbol Optional: Filter by symbol
   * @param limit Maximum number of results (default: 100)
   * @returns Array of historical orders
   * @throws Error if unauthorized or API call fails
   */
  async getHistoryOrders(
    symbol?: string,
    limit: number = 100,
  ): Promise<OrderResult[]> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Get History Orders, symbol: " + (symbol || "all") + " limit: " + limit);

    const params = `?${symbol ? `symbol=${symbol}&` : ""}limit=${limit}`;
    const response = await this.signedRequest<{ orders: BitunixOrder[] } | BitunixOrder[]>("GET", `/api/v1/futures/trade/get_history_orders${params}`);

    // Handle both direct list and object wrapper { orders: [...] }
    let list: BitunixOrder[] = [];
    if (Array.isArray(response.data)) {
        list = response.data;
    } else if (response.data && Array.isArray(response.data.orders)) {
        list = response.data.orders;
    }

    const orders = list.map((o: BitunixOrder) => {
      const omsOrder: OMSOrder = {
        id: o.orderId,
        symbol: o.symbol,
        side: (o.side || "").toLowerCase() as any,
        type: (o.type || "").toLowerCase() as any,
        status: this.mapOrderStatus(o.status || "NEW") as any,
        price: new Decimal(o.price || 0),
        amount: new Decimal(o.qty || o.amount || 0),
        filledAmount: new Decimal(o.tradeQty || 0),
        timestamp: o.ctime || o.createTime || Date.now()
      };
      omsService.updateOrder(omsOrder);

      return {
        orderId: omsOrder.id,
        symbol: omsOrder.symbol,
        side: omsOrder.side as any,
        status: omsOrder.status as any,
        price: omsOrder.price,
        amount: omsOrder.amount,
        timestamp: omsOrder.timestamp,
      };
    });

    return orders;
  }

  /**
   * 13. GET HISTORY TRADES
   * Fetches historical trades (executed orders).
   *
   * @param symbol Optional: Filter by symbol
   * @param limit Maximum number of results (default: 100)
   * @returns Array of historical trades
   * @throws Error if unauthorized or API call fails
   */
  async getHistoryTrades(symbol?: string, limit: number = 100): Promise<any[]> {
    TradeExecutionGuard.ensureAuthorized();

    logger.log("market", "Get History Trades, symbol: " + (symbol || "all") + " limit: " + limit);

    const params = `?${symbol ? `symbol=${symbol}&` : ""}limit=${limit}`;
    const response = await this.signedRequest<any[]>(
      "GET",
      `/api/v1/futures/trade/get_history_trades${params}`,
    );
    return response.data || [];
  }
}

// Singleton Export
export const tradeService = new TradeExecutionService();
