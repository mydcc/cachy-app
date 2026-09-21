import { Decimal } from "decimal.js";

/**
 * Whether a margin-mode string describes isolated margin.
 *
 * Venues spell it differently (Bitunix `ISOLATION`, Bitget `isolated`, the
 * position mapper lowercases whatever arrives), so the common prefix wins
 * over keeping every spelling in step. `undefined` means "not loaded yet"
 * and counts as isolated to preserve the long-standing display behaviour;
 * an explicitly non-isolated value never does.
 */
export function isIsolatedMarginMode(marginMode: string | undefined): boolean {
  if (marginMode === undefined) return true;
  return marginMode.toLowerCase().startsWith("isolat");
}

/**
 * Project where a position would liquidate at a new leverage.
 *
 * Given the venue's entry/liquidation/current leverage for an open position,
 * solve for the maintenance-margin rate (MMR), then re-apply it at the new
 * leverage.
 *
 * Returns null if any input is missing, non-finite, or non-positive — a wrong
 * number on a money screen is worse than none. It also returns null for an
 * explicitly cross-margin position: cross-margin liquidation is a function of
 * total account equity, not of this position's leverage, so the isolated
 * formula answers a different question there (BUG-0504).
 *
 * @param entry Position entry price (Decimal)
 * @param liquidation Current liquidation price (Decimal)
 * @param currentLeverage Current leverage (Decimal)
 * @param newLeverage Target leverage (Decimal)
 * @param side Position side, read from the position — never inferred from
 *   the prices (at `liquidation === entry` the geometry guess processes a
 *   long as a short)
 * @param marginMode Position margin mode; explicitly non-isolated yields null
 * @returns { from, to, tighter } or null
 */
export function projectLiquidation(
  entry: Decimal,
  liquidation: Decimal,
  currentLeverage: Decimal,
  newLeverage: Decimal,
  side: "long" | "short",
  marginMode?: string,
): { from: Decimal; to: Decimal; tighter: boolean } | null {
  if (
    !entry?.isFinite() ||
    !liquidation?.isFinite() ||
    !currentLeverage?.isFinite() ||
    !newLeverage?.isFinite()
  ) {
    return null;
  }

  if (entry.lte(0) || liquidation.lte(0) || currentLeverage.lte(0) || newLeverage.lte(0)) {
    return null;
  }

  try {
    if (side !== "long" && side !== "short") return null;
    const isLong = side === "long";
    if (!isIsolatedMarginMode(marginMode)) return null;
    const ratio = liquidation.div(entry);
    const invOld = new Decimal(1).div(currentLeverage);
    const invNew = new Decimal(1).div(newLeverage);

    // Solve for MMR from the venue's entry/liquidation/leverage triple.
    const mmr = isLong
      ? ratio.minus(1).plus(invOld)
      : new Decimal(1).plus(invOld).minus(ratio);

    // Re-apply MMR at the new leverage.
    const projected = isLong
      ? entry.times(new Decimal(1).minus(invNew).plus(mmr))
      : entry.times(new Decimal(1).plus(invNew).minus(mmr));

    if (!projected.isFinite() || projected.lte(0)) {
      return null;
    }

    // Closer to entry means less room before liquidation.
    const tighter = projected.minus(entry).abs().lt(liquidation.minus(entry).abs());

    return { from: liquidation, to: projected, tighter };
  } catch {
    return null;
  }
}
