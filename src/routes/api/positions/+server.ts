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
import { createHash, randomBytes } from "crypto";
import { generateBitgetSignature } from "../../../utils/server/bitget";

export const POST: RequestHandler = async ({ request }) => {
  const { exchange, apiKey, apiSecret, passphrase } = await request.json();

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  try {
    let positions = [];

    if (exchange === "bitunix") {
      positions = await fetchBitunixPositions(apiKey, apiSecret);
    } else if (exchange === "bitget") {
      if (!passphrase) return json({ error: "Missing passphrase" }, { status: 400 });
      positions = await fetchBitgetPositions(apiKey, apiSecret, passphrase);
    } else {
      return json({ error: "Unsupported exchange" }, { status: 400 });
    }

    return json({ positions });
  } catch (e: any) {
    console.error(`Error fetching positions from ${exchange}:`, e);
    return json(
      { error: e.message || "Failed to fetch positions" },
      { status: 500 },
    );
  }
};

async function fetchBitunixPositions(
  apiKey: string,
  apiSecret: string,
): Promise<any[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_pending_positions";

  // Params for the request
  const params: Record<string, string> = {};

  // 1. Generate Nonce and Timestamp
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // 2. Sort and Concatenate Query Params (keyvaluekeyvalue...)
  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  // 3. Construct Digest Input
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

  // 4. Calculate Digest (SHA256)
  const digest = createHash("sha256").update(digestInput).digest("hex");

  // 5. Calculate Signature (SHA256 of digest + secret)
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  const queryString = new URLSearchParams(params).toString();
  const url = queryString
    ? `${baseUrl}${path}?${queryString}`
    : `${baseUrl}${path}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
      // Add User-Agent to avoid potential blocking
      "User-Agent": "CachyApp/1.0",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  // Normalized Position Object
  const rawPositions = Array.isArray(data.data) ? data.data : [];

  return rawPositions
    .map((p: any) => {
      // Robust side detection
      let side = "SHORT";
      if (p.side) {
        const s = p.side.toString().toUpperCase();
        if (s === "LONG" || s === "BUY" || s === "1") {
          side = "LONG";
        }
      } else if (p.positionSide) {
        const ps = p.positionSide.toString().toUpperCase();
        if (ps === "LONG") side = "LONG";
      }

      return {
        symbol: p.symbol,
        side: side,
        // size: "qty" as per docs. Fallback to older fields.
        size: parseFloat(p.qty || p.positionAmount || p.holdVolume || "0"),
        // entryPrice: "avgOpenPrice" as per docs.
        entryPrice: parseFloat(
          p.avgOpenPrice || p.openAvgPrice || p.avgPrice || "0",
        ),

        // Fixed Duplicate Keys Issue:
        liquidationPrice: parseFloat(p.liquidationPrice || p.liqPrice || "0"),
        markPrice: parseFloat(p.markPrice || p.mark_price || "0"),
        margin: parseFloat(
          p.margin || p.positionMargin || p.maintMargin || "0",
        ),

        // unrealizedPnL: "unrealizedPNL" as per docs.
        unrealizedPnL: parseFloat(
          p.unrealizedPNL || p.unrealizedPnL || p.openLoss || "0",
        ),
        leverage: parseFloat(p.leverage || "0"),
        // marginType: "ISOLATION" | "CROSS" as per docs.
        marginMode:
          p.marginMode === "CROSS" ||
          p.marginMode === "cross" ||
          p.marginMode === 1 ||
          p.marginMode === "1"
            ? "cross"
            : "isolated",
      };
    })
    .filter((p: any) => p.size !== 0);
}

async function fetchBitgetPositions(
  apiKey: string,
  apiSecret: string,
  passphrase: string
): Promise<any[]> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/position/allPosition";
    const params = { productType: "umcbl", marginCoin: "USDT" };

    const { timestamp, signature, queryString } = generateBitgetSignature(apiSecret, "GET", path, params);

    const response = await fetch(`${baseUrl}${path}?${queryString}`, {
        headers: {
            "ACCESS-KEY": apiKey,
            "ACCESS-SIGN": signature,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) throw new Error("Bitget API Error");
    const res = await response.json();
    if (res.code !== "00000") throw new Error(res.msg);

    const data = res.data || [];

    return data
        .filter((p: any) => parseFloat(p.total) !== 0) // Filter empty positions
        .map((p: any) => {
            // Bitget fields:
            // symbol: symbol
            // holdSide: long/short
            // total: position size
            // averageOpenPrice: entry
            // markPrice: mark
            // liquidationPrice: liq
            // margin: margin
            // unrealizedPL: pnl
            // leverage: leverage
            // marginMode: crossed/isolated

            return {
                symbol: p.symbol,
                side: (p.holdSide || "").toUpperCase(),
                size: parseFloat(p.total || "0"),
                entryPrice: parseFloat(p.averageOpenPrice || "0"),
                markPrice: parseFloat(p.markPrice || "0"),
                liquidationPrice: parseFloat(p.liquidationPrice || "0"),
                margin: parseFloat(p.margin || "0"),
                unrealizedPnL: parseFloat(p.unrealizedPL || "0"),
                leverage: parseFloat(p.leverage || "0"),
                marginMode: p.marginMode // crossed, isolated
            };
        });
}
