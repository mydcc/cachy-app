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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { safeJsonParse } from "../../../utils/safeJson";

interface ApiError extends Error {
  status?: number;
}

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get("symbol");
  const interval = url.searchParams.get("interval") || "1d";
  const limitParam = url.searchParams.get("limit");
  const startParam =
    url.searchParams.get("startTime") || url.searchParams.get("start");
  const endParam =
    url.searchParams.get("endTime") || url.searchParams.get("end");
  const provider = url.searchParams.get("provider") || "bitunix";

  let limit = limitParam ? parseInt(limitParam) : 50;
  if (isNaN(limit)) limit = 50;

  let start = startParam ? parseInt(startParam) : undefined;
  if (start && isNaN(start)) start = undefined;

  let end = endParam ? parseInt(endParam) : undefined;
  if (end && isNaN(end)) end = undefined;

  if (!symbol) {
    return json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    let klines;
    if (provider === "bitget") {
      klines = await fetchBitgetKlines(symbol, interval, limit, start, end);
    } else {
      klines = await fetchBitunixKlines(symbol, interval, limit, start, end);
    }
    return json(klines);
  } catch (e: unknown) {
    console.error(`Error fetching klines from ${provider}:`, e);

    let status = 500;
    let message = "Failed to fetch klines";

    if (e instanceof Error) {
      message = e.message;
      const apiError = e as ApiError;
      if (typeof apiError.status === 'number') {
        status = apiError.status;
      }
    } else if (typeof e === 'object' && e !== null && 'message' in e) {
      // Fallback for non-Error objects that might have a message
      message = String((e as any).message);
    }

    return json({ error: message }, { status });
  }
};

async function fetchBitunixKlines(
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
  const data = safeJsonParse(responseText);

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
      throw new Error(`Bitunix API error: ${data.msg}`);
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

async function fetchBitgetKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  const baseUrl = "https://api.bitget.com";
  const path = "/api/mix/v1/market/candles";

  // Bitget Granularity: 1m, 5m, 15m, 30m, 1H, 4H, 12H, 1D, 1W
  const map: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "4h": "4H",
    "1d": "1D",
    "1w": "1W",
  };
  const mappedInterval = map[interval] || interval;

  // Bitget requires _UMCBL suffix usually for Mix
  let bitgetSymbol = symbol.toUpperCase();
  if (!bitgetSymbol.includes("_")) {
      bitgetSymbol += "_UMCBL";
  }

  const params: any = {
    symbol: bitgetSymbol,
    granularity: mappedInterval,
    // limit? Bitget doesn't explicitly support 'limit' param in some docs, but we can try.
    // Usually it relies on startTime/endTime.
  };
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  // If no start/end, Bitget returns latest.

  const queryString = new URLSearchParams(params).toString();

  const response = await fetch(`${baseUrl}${path}?${queryString}`);

  if (!response.ok) {
    throw new Error(`Bitget API error: ${response.status}`);
  }

  const text = await response.text();
  const data = safeJsonParse(text);
  // [[timestamp, open, high, low, close, volume, quoteVol], ...]
  // timestamp is string or number? usually string in response.

  // Hardening: Check if data is actually an array (success) or error object
  if (!Array.isArray(data)) {
      if (data && data.code && data.code !== "00000") {
          throw new Error(`Bitget Error: ${data.msg || data.code}`);
      }
      // If valid empty result or unknown structure
      if (!data) return [];
      // Fallback if structure is unexpected but not explicit error
      console.warn("[Klines] Unexpected Bitget response format", data);
      return [];
  }

  // Optimize: Return plain strings
  return data
    .map((k: any[]) => ({
      timestamp: parseInt(k[0]),
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5], // base volume
    }))
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
}
