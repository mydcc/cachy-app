/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * The registry identities the alert path can compute (BUG-0451).
 *
 * One list with two readers. `computeIndicatorSeries` answers "unsupported" for
 * anything outside it, and the alert panel's catalogue offers nothing outside
 * it — so the panel can no longer offer an alert that is armed and then never
 * fires, and an indicator wired into the alert path appears in the panel in the
 * same change rather than in a second list someone has to remember.
 *
 * A leaf on purpose: the catalogue imports this without pulling the indicator
 * maths in with it.
 */
export const ALERT_PATH_INDICATORS: ReadonlySet<string> = new Set([
  "rsi",
  "macd",
  "bollinger",
  "ema",
  "sma",
  "wma",
  "vwma",
  "hma",
  "volume_ma",
  "momentum",
]);
