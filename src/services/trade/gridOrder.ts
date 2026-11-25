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
 * Grid order lane — FEAT-0819 stage 4 (ADR-0027, ADR-0012 decision 5).
 *
 * Routes every grid opening order (`kind: "grid"`) and reduce-only counter-order
 * (`kind: "reduce"`) through the same `OrderGate` -> `signedRequest` ->
 * `paperExchange` path as manual orders. Paper-only via `origin: "bot"` and
 * `kind: "grid"`.
 */

import { Decimal } from "decimal.js";
import { roundDownToStep } from "../../lib/calculators/partialClose";
import { formatApiNum } from "../../utils/utils";
import type { BotAttribution } from "../orderGate";
import type { PartialIntent } from "./payloadCodec";
import type { PlaceOrderParams } from "./tradeParams";
import type { TradingPairInfo } from "../../stores/market/types";
import type { TpSlVenue } from "./tpSlService";

export interface PlaceGridOrderParams {
  symbol: string;
  gridSide: "long" | "short";
  leg: "open" | "close";
  price: Decimal;
  qty: Decimal;
  clientId: string;
  attribution: BotAttribution;
  positionId?: string;
  positionAmount?: Decimal;
  pendingGridNotional?: Decimal;
  effect?: PlaceOrderParams["effect"];
}

export interface GridOrderPorts {
  gatedRequest: <T>(intent: PartialIntent) => Promise<T>;
  effectFor: (effect: PlaceOrderParams["effect"]) => PlaceOrderParams["effect"];
  bitgetUtaOpenFields(direction: "BUY" | "SELL"): {
    posSide?: "LONG" | "SHORT";
    marginMode?: string;
  };
  bitgetUtaCloseFields(positionSide: "long" | "short"): {
    side: "BUY" | "SELL";
    posSide?: "LONG" | "SHORT";
    reduceOnly: boolean;
    marginMode?: string;
  };
  activeVenue(): TpSlVenue;
  lookupSymbolMeta(symbol: string): TradingPairInfo | undefined;
  usdtBalance: () => { available: Decimal; at: number } | undefined;
  accountSize: () => Decimal | undefined;
  leverage: () => Decimal | undefined;
}

export function createGridOrderService(ports: GridOrderPorts) {
  async function placeGridOrder(params: PlaceGridOrderParams) {
    if (!params.qty.isFinite() || params.qty.lte(0)) {
      throw new Error("apiErrors.invalidAmount");
    }
    if (!params.price.isFinite() || params.price.lte(0)) {
      throw new Error("apiErrors.invalidPrice");
    }

    const meta = ports.lookupSymbolMeta(params.symbol);
    const stepSize =
      meta?.basePrecision !== undefined
        ? new Decimal(10).pow(-meta.basePrecision)
        : undefined;
    const minTradeVolume = meta?.minTradeVolume
      ? new Decimal(meta.minTradeVolume)
      : undefined;
    const maxLimitOrderVolume = meta?.maxLimitOrderVolume
      ? new Decimal(meta.maxLimitOrderVolume)
      : undefined;
    const venue = ports.activeVenue();
    const effect = ports.effectFor(params.effect);

    if (params.leg === "close") {
      const positionSide = params.gridSide;
      const displayedSide = positionSide === "long" ? "BUY" : "SELL";
      const positionAmount = params.positionAmount;
      const closesEverything =
        positionAmount !== undefined && params.qty.gte(positionAmount);
      const effectiveQty = closesEverything && positionAmount ? positionAmount : params.qty;
      const roundedQty =
        !closesEverything && stepSize
          ? roundDownToStep(effectiveQty, stepSize)
          : effectiveQty;
      if (!roundedQty.isFinite() || roundedQty.lte(0)) {
        throw new Error("apiErrors.invalidAmount");
      }

      const payload: Record<string, unknown> = {
        type: "place-order",
        symbol: params.symbol,
        side: displayedSide,
        orderType: "LIMIT",
        qty: formatApiNum(roundedQty),
        price: formatApiNum(params.price),
        reduceOnly: true,
        clientId: params.clientId,
        effect,
        tradeSide: "CLOSE",
        positionId: params.positionId,
        ...(venue === "bitget" ? ports.bitgetUtaCloseFields(positionSide) : {}),
      };

      const result = await ports.gatedRequest({
        kind: "reduce",
        endpoint: "/api/orders",
        payload,
        origin: "bot",
        attribution: params.attribution,
        displayed: {
          symbol: params.symbol,
          side: displayedSide,
          entryPrice: params.price,
          positionAmount,
          fullClose: closesEverything,
          positionId: params.positionId,
          stepSize,
          minTradeVolume,
          maxLimitOrderVolume,
          symbolStatus: meta?.symbolStatus,
          isApiSupported: meta?.isApiSupported,
        },
      });
      return { clientId: params.clientId, result };
    }

    const openSide: "BUY" | "SELL" = params.gridSide === "long" ? "BUY" : "SELL";
    const qty = stepSize ? roundDownToStep(params.qty, stepSize) : params.qty;
    if (!qty.isFinite() || qty.lte(0)) {
      throw new Error("apiErrors.invalidAmount");
    }
    const balanceForMode = ports.usdtBalance();

    const payload: Record<string, unknown> = {
      type: "place-order",
      symbol: params.symbol,
      side: openSide,
      orderType: "LIMIT",
      qty: formatApiNum(qty),
      price: formatApiNum(params.price),
      reduceOnly: false,
      clientId: params.clientId,
      effect,
      tradeSide: "OPEN",
      ...(venue === "bitget" ? ports.bitgetUtaOpenFields(openSide) : {}),
    };

    const result = await ports.gatedRequest({
      kind: "grid",
      endpoint: "/api/orders",
      payload,
      origin: "bot",
      attribution: params.attribution,
      displayed: {
        symbol: params.symbol,
        side: openSide,
        entryPrice: params.price,
        gridQuantity: qty,
        pendingGridNotional: params.pendingGridNotional,
        accountSize: ports.accountSize(),
        leverage: ports.leverage(),
        availableMargin: balanceForMode?.available,
        availableMarginAt: balanceForMode?.at,
        stepSize,
        minTradeVolume,
        maxLimitOrderVolume,
        symbolStatus: meta?.symbolStatus,
        isApiSupported: meta?.isApiSupported,
      },
    });
    return { clientId: params.clientId, result };
  }

  return { placeGridOrder };
}
