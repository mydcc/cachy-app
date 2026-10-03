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
 * Utility for standardizing symbol normalization across different providers and services.
 */

/**
 * Normalizes a trading symbol for a specific provider.
 *
 * @param symbol The raw symbol (e.g., "BTC", "BTCUSDT", "btcusdt")
 * @param _provider The API provider ("bitunix", "bitget", etc.) — retained
 *   because every caller passes it and the distinction is worth reading at the
 *   call site, but no longer consulted. BUG-0599 removed the last venue-specific
 *   behaviour (Bitget's `_UMCBL` suffix), so normalization is now the same
 *   canonical bare pair for every provider.
 * @returns The normalized symbol string in uppercase, without any venue suffix.
 */
export function normalizeSymbol(
  symbol: string,
  _provider: "bitunix" | "bitget" | string,
): string {
  if (!symbol) return "";

  let s = symbol
    .trim()
    .toUpperCase()
    .replace(".P", "")
    .replace(":USDT", "")
    .replace("-P", "")
    // BUG-0599 — strip the V1 suffix, never append it. `_UMCBL` was the wire
    // format Bitget's decommissioned `/api/v1/mix/` generation used; V2
    // addresses contracts by the bare pair and answers `40034 "Parameter
    // BTCUSDT_UMCBL does not exist"` for the suffixed form. Stripping rather
    // than merely not-appending also converges symbols that arrive already
    // suffixed from a payload written before this change, which is what keeps
    // there being exactly one canonical key per contract.
    .replace(/_UMCBL$/, "");

  // If it's just "BTC", make it "BTCUSDT"
  // Heuristic: If length <= 5 and not containing USDT/USDC, append USDT.
  // Explicitly avoid double suffix if symbol is like "USDC" -> "USDCUSDT" (valid pair)
  // But prevent "BTCUSDC" -> "BTCUSDCUSDT" (invalid)
  // Actually, "BTCUSDC" is length 7. "USDC" is 4. "SOL" is 3.
  // If someone passes "BTC", length 3 -> "BTCUSDT".
  // If someone passes "USDC", length 4 -> "USDCUSDT" (This is a valid pair on some exchanges, e.g. USDC/USDT)
  // If someone passes "ETHBTC", length 6 -> Ignored by this check.
  if (!s.includes("USDT") && !s.includes("USDC") && s.length <= 5) {
    s = s + "USDT";
  }

  // If it's "BTC-USDT", make it "BTCUSDT"
  s = s.replace("-USDT", "USDT");
  if (s.endsWith("USDTP")) {
    s = s.substring(0, s.length - 1);
  }

  return s;
}

/**
 * Strips provider-specific suffixes for display purposes.
 */
export function formatSymbolForDisplay(symbol: string): string {
  if (!symbol) return "";
  return symbol.replace("USDT", "").replace("P", "").replace("_UMCBL", "");
}

/**
 * The inverse of `normalizeSymbol` for Bitget: turns a store key back into the
 * pair a Bitget endpoint expects.
 *
 * BUG-0598. The `_UMCBL` suffix is this app's internal bookkeeping — the key
 * `marketState` and the chart look up. Bitget V2 speaks the bare pair in both
 * directions, so the suffix has to come off before anything reaches the wire.
 * `formatSymbolForDisplay` cannot do this job: it also strips `USDT`, which
 * would turn `BTCUSDT` into `BTC` and ask the venue about a contract that does
 * not exist.
 *
 * Precondition: the input is already a store key, i.e. it came out of
 * `normalizeSymbol`. This neither trims nor upper-cases, so a raw user- or
 * API-supplied string would pass through as-is. Keep it on the wire boundary.
 */
export function bitgetWireSymbol(symbol: string): string {
  if (!symbol) return "";
  return symbol.replace(/_UMCBL$/, "");
}
