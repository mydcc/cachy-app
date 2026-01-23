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
import { Decimal } from "decimal.js";

export const GET: RequestHandler = async ({ url }) => {
  const symbol = url.searchParams.get("symbol");
  const interval = url.searchParams.get("interval") || "1d";
  const limitParam = url.searchParams.get("limit");
  const startParam =
    url.searchParams.get("startTime") || url.searchParams.get("start");
  const endParam =
    url.searchParams.get("endTime") || url.searchParams.get("end");
  const provider = url.searchParams.get("provider") || "bitunix";
  const limit = limitParam ? parseInt(limitParam) : 50;
  const start = startParam ? parseInt(startParam) : undefined;
  const end = endParam ? parseInt(endParam) : undefined;

  if (!symbol) {
    return json({ error: "Symbol is required" }, { status: 400 });
  }

  try {
    let klines;
    if (provider === "binance") {
      klines = await fetchBinanceKlines(symbol, interval, limit, start, end);
    } else {
      klines = await fetchBitunixKlines(symbol, interval, limit, start, end);
    }
    return json(klines);
  } catch (e: any) {
    if (import.meta.env.DEV) {
      console.error(`Error fetching klines from ${provider}:`, e);
    }
    const status = e.status || 500;
    return json({ error: e.message || "Failed to fetch klines" }, { status });
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

  // Map internal interval to Bitunix interval if needed
  // Bitunix: 1min, 5min, 15min, 30min, 60min, 4h, 1day, 1week, 1month
  // App: 1m, 5m, 15m, 1h, 4h, 1d
  const map: Record<string, string> = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "1h": "60min",
    "4h": "4h",
    "1d": "1day",
    "1w": "1week",
    "1M": "1month",
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

  const response = await fetch(`${baseUrl}${path}?${queryString}`, {
    headers: {
      "User-Agent": "CachyApp/1.0",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Ignore JSON parse error, fallback to generic error
    }

    if (
      data &&
      (data.code === 2 ||
        data.code === "2" ||
        (data.msg &&
          typeof data.msg === "string" &&
          data.msg.toLowerCase().includes("system error")))
    ) {
      const error = new Error("Symbol not found");
      (error as any).status = 404;
      throw error;
    }

    if (import.meta.env.DEV) {
      console.error(`Bitunix API error ${response.status}: ${text}`);
    }
    const error = new Error(`Bitunix API error: ${response.status}`);
    (error as any).status = response.status;
    throw error;
  }

  const data = await response.json();
  if (data.code !== 0 && data.code !== "0") {
    // Treat Bitunix "System error" (Code 2) or message as 404 Not Found for symbols
    if (
      data.code === 2 ||
      data.code === "2" ||
      (data.msg && data.msg.toLowerCase().includes("system error"))
    ) {
      const error = new Error("Symbol not found");
      (error as any).status = 404;
      throw error;
    }
    throw new Error(`Bitunix API error: ${data.msg}`);
  }

  const results = data.data || [];

  // Optimize: Return plain strings to reduce payload size and serialization overhead
  return results
    .map((k: any) => ({
      open: new Decimal(k.open || k.o || 0).toString(),
      high: new Decimal(k.high || k.h || 0).toString(),
      low: new Decimal(k.low || k.l || 0).toString(),
      close: new Decimal(k.close || k.c || 0).toString(),
      volume: new Decimal(k.vol || k.v || 0).toString(),
      timestamp: k.id || k.ts || k.time || 0,
    }))
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
}

async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit: number,
  start?: number,
  end?: number,
) {
  const baseUrl = "https://fapi.binance.com";
  const path = "/fapi/v1/klines";

  const params: any = {
    symbol: symbol.toUpperCase(),
    interval: interval,
    limit: limit.toString(),
  };
  if (start) params.startTime = start.toString();
  if (end) params.endTime = end.toString();

  const queryString = new URLSearchParams(params).toString();

  const response = await fetch(`${baseUrl}${path}?${queryString}`);

  if (!response.ok) {
    throw new Error(`Binance API error: ${response.status}`);
  }

  const data = await response.json();

  // Optimize: Binance returns strings for prices, pass them directly
  return data
    .map((k: any[]) => ({
      timestamp: k[0],
      open: k[1],
      high: k[2],
      low: k[3],
      close: k[4],
      volume: k[5],
    }))
    .sort((a: any, b: any) => a.timestamp - b.timestamp);
}
