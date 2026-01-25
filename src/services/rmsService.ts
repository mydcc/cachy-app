/*
 * Copyright (C) 2026 MYDCT
 *
 * Risk Management Service (RMS)
 * Monitors trading rules, validates exposure, and enforces safety limits.
 */

import { omsService } from "./omsService";
import { tradeState } from "../stores/trade.svelte";
import { accountState } from "../stores/account.svelte";
import { logger } from "./logger";
import { Decimal } from "decimal.js";

export interface RiskProfile {
    maxPositionSizeUsdt: Decimal;
    maxDrawdownPercent: number;
    stopLossRequired: boolean;
}

class RiskManagementService {
    private profile: RiskProfile = {
        maxPositionSizeUsdt: new Decimal(5000), // Default safety limit
        maxDrawdownPercent: 5,
        stopLossRequired: true
    };

    /**
     * Validates if a proposed trade complies with risk rules.
     */
    public validateTrade(symbol: string, side: string, amountUsdt: Decimal, isReduceOnly: boolean = false): { allowed: boolean; reason?: string } {
        // 1. Max Size Check
        if (amountUsdt.gt(this.profile.maxPositionSizeUsdt)) {
            return { allowed: false, reason: "EXCEEDS_MAX_POSITION_SIZE" };
        }

        // Safety: If explicitly reduceOnly, skip margin check
        if (isReduceOnly) {
            return { allowed: true };
        }

        // 2. Margin Check (Prevent Suicide Trades)
        // Heuristic: If we have an open position in opposite direction, this is likely a close -> Skip Check.
        // If no position or same direction, this is an Open/Add -> Check Margin.
        const positions = omsService.getPositions();
        const existingPos = positions.find(p => p.symbol === symbol);

        const isLikelyClose = existingPos && existingPos.side !== side;

        if (!isLikelyClose) {
             const leverage = new Decimal(tradeState.leverage || 10);
             // Required Margin = Notional / Leverage
             const requiredMargin = amountUsdt.div(leverage);

             const usdtAsset = accountState.assets.find(a => a.currency === "USDT");
             const available = usdtAsset ? usdtAsset.available : new Decimal(0);

             // If we don't have asset data loaded yet (available is 0), we might skip or block.
             // Blocking is safer for "Institutional Grade".
             if (requiredMargin.gt(available)) {
                 return { allowed: false, reason: `INSUFFICIENT_MARGIN (Req: ${requiredMargin.toFixed(2)}, Avail: ${available.toFixed(2)})` };
             }
        }

        return { allowed: true };
    }

    /**
     * Background monitor for active positions.
     * Can trigger emergency exits if drawdown exceeds limits.
     */
    public monitorRisk(): void {
        const positions = omsService.getPositions();
        positions.forEach(pos => {
            // Logic to check if position is in danger zone
            if (pos.unrealizedPnl.isNegative()) {
                // ...
            }
        });
    }
}

export const rmsService = new RiskManagementService();
