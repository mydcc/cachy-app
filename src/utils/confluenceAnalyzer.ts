/*
 * Copyright (C) 2026 MYDCT
 *
 * Confluence Analyzer
 * Aggregates signals from various indicators to produce a unified sentiment score.
 *
 * Logic:
 * - Assigns weights to different indicators (Trend has higher weight than Momentum usually, or depends on strategy).
 * - "Trend Following" Score vs "Mean Reversion" Score?
 * - For now, a general "Directional Bias" score.
 */

import { Decimal } from "decimal.js";
import type {
  TechnicalsData,
  ConfluenceData,
  DivergenceItem,
} from "../services/technicalsTypes";

export class ConfluenceAnalyzer {
  static analyze(data: Partial<TechnicalsData>): ConfluenceData {
    let score = 50; // Neutral start
    const contributing: string[] = [];

    // Helper to adjust score
    const adjust = (amount: number, reason: string) => {
      score += amount;
      if (amount !== 0)
        contributing.push(`${amount > 0 ? "+" : ""}${amount} ${reason}`);
    };

    // 1. Moving Averages (Trend)
    // Weight: High
    if (data.movingAverages) {
      let buyCount = 0;
      let sellCount = 0;
      data.movingAverages.forEach((ma) => {
        if (ma.action === "Buy") buyCount++;
        if (ma.action === "Sell") sellCount++;
      });

      if (buyCount > sellCount) adjust(15, "MA Trend Bullish");
      else if (sellCount > buyCount) adjust(-15, "MA Trend Bearish");
    }

    // 2. Oscillators (Momentum)
    // Weight: Medium
    if (data.oscillators) {
      data.oscillators.forEach((osc) => {
        const weight = 5;
        if (osc.action === "Buy" || osc.action === "Strong Buy")
          adjust(weight, `${osc.name} Bullish`);
        if (osc.action === "Sell" || osc.action === "Strong Sell")
          adjust(-weight, `${osc.name} Bearish`);
      });
    }

    // 3. Ichimoku (System)
    // Weight: High
    if (data.advanced?.ichimoku) {
      const ichi = data.advanced.ichimoku;
      if (ichi.action === "Strong Buy") adjust(20, "Ichimoku Strong Bull");
      else if (ichi.action === "Buy") adjust(10, "Ichimoku Bull");
      else if (ichi.action === "Sell") adjust(-10, "Ichimoku Bear");
      else if (ichi.action === "Strong Sell")
        adjust(-20, "Ichimoku Strong Bear");
    }

    // 4. Divergences
    // Weight: High (Reversal signals)
    // CAP: Max 30 points total Impact to prevent score explosion from multiple indicators
    if (data.divergences && data.divergences.length > 0) {
      let divScore = 0;
      data.divergences.forEach((div) => {
        // Recent divergence?
        // Assuming the scanner only returns relevant ones.
        const weight = div.type === "Regular" ? 15 : 10;
        if (div.side === "Bullish") divScore += weight;
        else divScore -= weight;
      });

      // Clamp divergence impact
      divScore = Math.max(-30, Math.min(30, divScore));

      if (divScore !== 0) {
        adjust(divScore, `Divergences (${divScore > 0 ? "Bull" : "Bear"})`);
      }
    }

    // 5. VWAP
    // Weight: Medium
    // Logic: Price > VWAP = Bullish
    // We need Price to compare. Usually passed in data or we need it?
    // Wait, TechnicalsData has pivotBasis which has close.
    if (data.advanced?.vwap && data.pivotBasis?.close) {
      const close = data.pivotBasis.close;
      const vwap = data.advanced.vwap;
      if (close.gt(vwap)) adjust(5, "Price > VWAP");
      else adjust(-5, "Price < VWAP");
    }

    // Clamp Score 0-100
    score = Math.max(0, Math.min(100, score));

    // Determine Level
    let level: ConfluenceData["level"] = "Neutral";
    if (score >= 80) level = "Strong Buy";
    else if (score >= 60) level = "Buy";
    else if (score <= 20) level = "Strong Sell";
    else if (score <= 40) level = "Sell";

    return {
      score,
      level,
      contributing,
    };
  }
}
