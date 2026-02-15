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

import { safeJsonParse } from "../../utils/safeJson";

interface ApiError extends Error {
  status?: number;
}

export async function fetchKlinesFromBitunix(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/market/kline";

  const map: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d",
    "1w": "1w",
    "1M": "1M",
  };
  const mappedInterval = map[interval] || interval;

  const params: any = {
    symbol: symbol.toUpperCase(),
    interval: mappedInterval,
    limit: limit.toString(),
  };
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  const queryString = new URLSearchParams(params).toString();
  const fullUrl = `${baseUrl}${path}?${queryString}`;

  const response = await fetch(fullUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let data;
    try {
      data = safeJsonParse(text);
    } catch (e) {}

    if (
      data &&
      (data.code === 2 ||
        data.code === "2" ||
        (data.msg &&
          typeof data.msg === "string" &&
          data.msg.toLowerCase().includes("system error")))
    ) {
      const error = new Error("Symbol not found") as ApiError;
      error.status = 404;
      throw error;
    }

    const safeText = text.slice(0, 100);
    console.error(`Bitunix API error ${response.status}: ${safeText}...`);
    const error = new Error(`Bitunix API error: ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }

  const responseText = await response.text();
  let data;
  try {
      data = safeJsonParse(responseText);
  } catch (e) {
      throw new Error("Invalid API response format");
  }

  if (!data || typeof data !== 'object') {
      throw new Error("Invalid API response format");
  }

  if (data.code !== 0 && data.code !== "0") {
    if (
        data.code === 2 ||
        data.code === "2" ||
        (data.msg && data.msg.toLowerCase().includes("system error"))
      ) {
        const error = new Error("Symbol not found") as ApiError;
        error.status = 404;
        throw error;
      }
      // Pass original message if available
      throw new Error(`Bitunix API error: ${data.msg || data.code}`);
  }

  const results = data.data || [];

  const mapped = results.map((k: any) => ({
    open: String(k.open || k.o || 0),
    high: String(k.high || k.h || 0),
    low: String(k.low || k.l || 0),
    close: String(k.close || k.c || 0),
    volume: String(k.quoteVol || k.q || k.volume || k.vol || k.v || k.amount || 0),
    timestamp: k.id || k.time || k.ts || 0, // Swapped id and time priority
  }));

  // Optimization: Bitunix usually returns data in descending order.
  if (mapped.length > 1 && Number(mapped[0].timestamp) > Number(mapped[mapped.length - 1].timestamp)) {
    mapped.reverse();
  }

  return mapped;
}
