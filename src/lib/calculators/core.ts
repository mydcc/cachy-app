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

import { Decimal } from "decimal.js";
import { CONSTANTS } from "../constants";
import type {
  TradeValues,
  BaseMetrics,
  IndividualTpResult,
  TotalMetrics,
  JournalEntry,
} from "../../stores/types";

export function getTradePnL(t: JournalEntry): Decimal {
  // If we have a calculated totalNetProfit, use it preferably (even for manual trades if available)
  if (t.totalNetProfit !== undefined && t.totalNetProfit !== null) {
    const val = new Decimal(t.totalNetProfit);
    if (!val.isZero()) return val;
  }

  if (t.isManual === false) {
    return new Decimal(t.totalNetProfit || 0);
  }

  // Manual trades fallback logic based on Status
  if (t.status === "Won") return new Decimal(t.totalNetProfit || 0);
  // For Lost manual trades, we should not assume -1R loss automatically as it skews data.
  // User must enter the actual loss amount.
  // NOTE: If the user inputs 0 (or forgets), it stays 0. This is intended to avoid false "auto-calculated" losses.
  if (t.status === "Lost") {
    return new Decimal(t.totalNetProfit || 0);
  }
  return new Decimal(0);
}

/**
 * Entry price adjusted so an immediate exit nets zero PnL — accounts for the
 * entry fee already paid and an assumed equal-rate exit fee. `feePercent` is
 * a percentage (e.g. "0.0140" for 0.014%), not a fraction.
 */
export function calculateBreakEvenPrice(
  entryPrice: Decimal,
  feePercent: Decimal,
  tradeType: string,
): Decimal {
  const feeFactor = feePercent.div(100);
  return tradeType === CONSTANTS.TRADE_TYPE_LONG
    ? entryPrice.times(feeFactor.plus(1)).div(new Decimal(1).minus(feeFactor))
    : entryPrice.times(new Decimal(1).minus(feeFactor)).div(feeFactor.plus(1));
}

/**
 * Required margin, net loss and entry fee for a given position size — the
 * three `BaseMetrics` fields that scale with it. Split out from
 * `calculateBaseMetrics` so a caller that rounds `positionSize` to the
 * exchange's precision *after* the initial calculation (as the calculator
 * UI does, to match what will actually be ordered) can re-derive these
 * from the rounded size instead of leaving them reflecting the pre-rounding
 * one — see BUG-0252.
 */
export function deriveMoneyMetrics(
  positionSize: Decimal,
  values: Pick<TradeValues, "entryPrice" | "stopLossPrice" | "leverage" | "fees">,
  riskAmount: Decimal,
): { requiredMargin: Decimal; netLoss: Decimal; entryFee: Decimal } {
  const orderVolume = positionSize.times(values.entryPrice);
  const requiredMargin = values.leverage.gt(0)
    ? orderVolume.div(values.leverage)
    : orderVolume;
  const feeFactor = values.fees.div(100);
  const entryFee = orderVolume.times(feeFactor);
  const slExitFee = positionSize.times(values.stopLossPrice).times(feeFactor);
  const netLoss = riskAmount.plus(entryFee).plus(slExitFee);
  return { requiredMargin, netLoss, entryFee };
}

export function calculateBaseMetrics(
  values: TradeValues,
  tradeType: string,
): BaseMetrics | null {
  const riskAmount = values.accountSize.times(values.riskPercentage.div(100));
  const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
  if (riskPerUnit.isZero()) return null;

  const positionSize = riskAmount.div(riskPerUnit);
  const { requiredMargin, netLoss, entryFee } = deriveMoneyMetrics(
    positionSize,
    values,
    riskAmount,
  );

  const breakEvenPrice = calculateBreakEvenPrice(
    values.entryPrice,
    values.fees,
    tradeType,
  );

  const mmr = values.maintenanceMarginRate || new Decimal(0);

  const liquidationPrice = values.leverage.gt(0)
    ? tradeType === CONSTANTS.TRADE_TYPE_LONG
      ? values.entryPrice.times(
        new Decimal(1).minus(new Decimal(1).div(values.leverage)).plus(mmr),
      )
      : values.entryPrice.times(
        new Decimal(1).plus(new Decimal(1).div(values.leverage)).minus(mmr),
      )
    : new Decimal(0);

  return {
    positionSize,
    requiredMargin,
    netLoss,
    breakEvenPrice,
    liquidationPrice,
    entryFee,
    riskAmount,
  };
}

export function calculateIndividualTp(
  tpPrice: Decimal,
  currentTpPercent: Decimal,
  baseMetrics: BaseMetrics,
  values: TradeValues,
  index: number,
): IndividualTpResult {
  const { positionSize, requiredMargin, riskAmount } = baseMetrics;
  const gainPerUnit = tpPrice.minus(values.entryPrice).abs();
  const positionPart = positionSize.times(currentTpPercent.div(100));
  const grossProfitPart = gainPerUnit.times(positionPart);
  const exitFee = positionPart.times(tpPrice).times(values.fees.div(100));
  const entryFeePart = positionPart
    .times(values.entryPrice)
    .times(values.fees.div(100));
  const netProfit = grossProfitPart.minus(entryFeePart).minus(exitFee);
  const riskForPart = riskAmount.times(currentTpPercent.div(100));
  const riskRewardRatio = riskForPart.gt(0)
    ? netProfit.div(riskForPart)
    : new Decimal(0);
  const priceChangePercent = values.entryPrice.gt(0)
    ? tpPrice.minus(values.entryPrice).div(values.entryPrice).times(100)
    : new Decimal(0);
  const returnOnCapital =
    requiredMargin.gt(0) && currentTpPercent.gt(0)
      ? netProfit
        .div(requiredMargin.times(currentTpPercent.div(100)))
        .times(100)
      : new Decimal(0);
  return {
    netProfit,
    riskRewardRatio,
    priceChangePercent,
    returnOnCapital,
    partialVolume: positionPart,
    exitFee,
    index: index,
    percentSold: currentTpPercent,
  };
}

export function calculateTotalMetrics(
  targets: Array<{ price: Decimal; percent: Decimal }>,
  baseMetrics: BaseMetrics,
  values: TradeValues,
  tradeType: string,
): TotalMetrics {
  const { positionSize, entryFee, riskAmount } = baseMetrics;
  let totalNetProfit = new Decimal(0);
  let weightedRRSum = new Decimal(0);
  let totalFees = new Decimal(0);

  targets.forEach((tp, index) => {
    if (tp.price.gt(0) && tp.percent.gt(0)) {
      const { netProfit, riskRewardRatio } = calculateIndividualTp(
        tp.price,
        tp.percent,
        baseMetrics,
        values,
        index,
      );
      totalNetProfit = totalNetProfit.plus(netProfit);
      const entryFeePart = positionSize
        .times(tp.percent.div(100))
        .times(values.entryPrice)
        .times(values.fees.div(100));
      const exitFeePart = positionSize
        .times(tp.percent.div(100))
        .times(tp.price)
        .times(values.fees.div(100));
      totalFees = totalFees.plus(entryFeePart).plus(exitFeePart);
      weightedRRSum = weightedRRSum.plus(
        riskRewardRatio.times(tp.percent.div(100)),
      );
    }
  });

  const validTpPrices = targets
    .filter((t) => t.price.gt(0))
    .map((t) => t.price);
  let maxPotentialProfit = new Decimal(0);
  if (validTpPrices.length > 0) {
    const bestTpPrice =
      tradeType === CONSTANTS.TRADE_TYPE_LONG
        ? Decimal.max(...validTpPrices)
        : Decimal.min(...validTpPrices);
    const gainPerUnitFull = bestTpPrice.minus(values.entryPrice).abs();
    const grossProfitFull = gainPerUnitFull.times(positionSize);
    const exitFeeFull = positionSize
      .times(bestTpPrice)
      .times(values.fees.div(100));
    maxPotentialProfit = grossProfitFull.minus(entryFee).minus(exitFeeFull);
  }

  const totalRR = values.totalPercentSold.gt(0)
    ? weightedRRSum.div(values.totalPercentSold.div(100))
    : new Decimal(0);
  return { totalNetProfit, totalRR, totalFees, maxPotentialProfit, riskAmount };
}
