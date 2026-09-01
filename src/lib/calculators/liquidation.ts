import { Decimal } from "decimal.js";

/**
 * Project where a position would liquidate at a new leverage.
 *
 * Given the venue's entry/liquidation/current leverage for an open position,
 * solve for the maintenance-margin rate (MMR), then re-apply it at the new
 * leverage. Direction (long/short) is inferred from the numbers: a long
 * liquidates below its entry, a short above it.
 *
 * Returns null if any input is missing, non-finite, or non-positive — a wrong
 * number on a money screen is worse than none.
 *
 * @param entry Position entry price (Decimal)
 * @param liquidation Current liquidation price (Decimal)
 * @param currentLeverage Current leverage (Decimal)
 * @param newLeverage Target leverage (Decimal)
 * @returns { from, to, tighter } or null
 */
export function projectLiquidation(
  entry: Decimal,
  liquidation: Decimal,
  currentLeverage: Decimal,
  newLeverage: Decimal,
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
    const isLong = liquidation.lt(entry);
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
