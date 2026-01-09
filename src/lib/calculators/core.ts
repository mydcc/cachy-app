import { Decimal } from 'decimal.js';
import { CONSTANTS } from '../constants';
import type { TradeValues, BaseMetrics, IndividualTpResult, TotalMetrics, JournalEntry } from '../../stores/types';

export function getTradePnL(t: JournalEntry): Decimal {
    if (t.isManual === false) {
        return new Decimal(t.totalNetProfit || 0);
    }
    // Manual trades
    if (t.status === 'Won') return new Decimal(t.totalNetProfit || 0);
    if (t.status === 'Lost') return new Decimal(t.riskAmount || 0).negated();
    return new Decimal(0);
}

export function calculateBaseMetrics(values: TradeValues, tradeType: string): BaseMetrics | null {
    const riskAmount = values.accountSize.times(values.riskPercentage.div(100));
    const riskPerUnit = values.entryPrice.minus(values.stopLossPrice).abs();
    if (riskPerUnit.isZero()) return null;

    const positionSize = riskAmount.div(riskPerUnit);
    const orderVolume = positionSize.times(values.entryPrice);
    const requiredMargin = values.leverage.gt(0) ? orderVolume.div(values.leverage) : orderVolume;
    const entryFee = orderVolume.times(values.fees.div(100));
    const slExitFee = positionSize.times(values.stopLossPrice).times(values.fees.div(100));
    const netLoss = riskAmount.plus(entryFee).plus(slExitFee);

    const feeFactor = values.fees.div(100);
    const breakEvenPrice = tradeType === CONSTANTS.TRADE_TYPE_LONG
        ? values.entryPrice.times(feeFactor.plus(1)).div(new Decimal(1).minus(feeFactor))
        : values.entryPrice.times(new Decimal(1).minus(feeFactor)).div(feeFactor.plus(1));

    const liquidationPrice = values.leverage.gt(0) ? (tradeType === CONSTANTS.TRADE_TYPE_LONG
        ? values.entryPrice.times(new Decimal(1).minus(new Decimal(1).div(values.leverage)))
        : values.entryPrice.times(new Decimal(1).plus(new Decimal(1).div(values.leverage)))) : new Decimal(0);

    return { positionSize, requiredMargin, netLoss, breakEvenPrice, liquidationPrice, entryFee, riskAmount };
}

export function calculateIndividualTp(tpPrice: Decimal, currentTpPercent: Decimal, baseMetrics: BaseMetrics, values: TradeValues, index: number): IndividualTpResult {
    const { positionSize, requiredMargin, riskAmount } = baseMetrics;
    const gainPerUnit = tpPrice.minus(values.entryPrice).abs();
    const positionPart = positionSize.times(currentTpPercent.div(100));
    const grossProfitPart = gainPerUnit.times(positionPart);
    const exitFee = positionPart.times(tpPrice).times(values.fees.div(100));
    const entryFeePart = positionPart.times(values.entryPrice).times(values.fees.div(100));
    const netProfit = grossProfitPart.minus(entryFeePart).minus(exitFee);
    const riskForPart = riskAmount.times(currentTpPercent.div(100));
    const riskRewardRatio = riskForPart.gt(0) ? netProfit.div(riskForPart) : new Decimal(0);
    const priceChangePercent = values.entryPrice.gt(0) ? tpPrice.minus(values.entryPrice).div(values.entryPrice).times(100) : new Decimal(0);
    const returnOnCapital = requiredMargin.gt(0) && currentTpPercent.gt(0) ? netProfit.div(requiredMargin.times(currentTpPercent.div(100))).times(100) : new Decimal(0);
    return { netProfit, riskRewardRatio, priceChangePercent, returnOnCapital, partialVolume: positionPart, exitFee, index: index, percentSold: currentTpPercent };
}

export function calculateTotalMetrics(targets: Array<{ price: Decimal; percent: Decimal; }>, baseMetrics: BaseMetrics, values: TradeValues, tradeType: string): TotalMetrics {
    const { positionSize, entryFee, riskAmount } = baseMetrics;
    let totalNetProfit = new Decimal(0);
    let weightedRRSum = new Decimal(0);
    let totalFees = new Decimal(0);

    targets.forEach((tp, index) => {
        if (tp.price.gt(0) && tp.percent.gt(0)) {
            const { netProfit, riskRewardRatio } = calculateIndividualTp(tp.price, tp.percent, baseMetrics, values, index);
            totalNetProfit = totalNetProfit.plus(netProfit);
            const entryFeePart = positionSize.times(tp.percent.div(100)).times(values.entryPrice).times(values.fees.div(100));
            const exitFeePart = positionSize.times(tp.percent.div(100)).times(tp.price).times(values.fees.div(100));
            totalFees = totalFees.plus(entryFeePart).plus(exitFeePart);
            weightedRRSum = weightedRRSum.plus(riskRewardRatio.times(tp.percent.div(100)));
        }
    });

    const validTpPrices = targets.filter(t => t.price.gt(0)).map(t => t.price);
    let maxPotentialProfit = new Decimal(0);
    if (validTpPrices.length > 0) {
        const bestTpPrice = tradeType === CONSTANTS.TRADE_TYPE_LONG ? Decimal.max(...validTpPrices) : Decimal.min(...validTpPrices);
        const gainPerUnitFull = bestTpPrice.minus(values.entryPrice).abs();
        const grossProfitFull = gainPerUnitFull.times(positionSize);
        const exitFeeFull = positionSize.times(bestTpPrice).times(values.fees.div(100));
        maxPotentialProfit = grossProfitFull.minus(entryFee).minus(exitFeeFull);
    }

    const totalRR = values.totalPercentSold.gt(0) ? weightedRRSum.div(values.totalPercentSold.div(100)) : new Decimal(0);
    return { totalNetProfit, totalRR, totalFees, maxPotentialProfit, riskAmount };
}
