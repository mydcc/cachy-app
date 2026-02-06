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
import {
  generateBitunixSignature,
  validateBitunixKeys,
} from "../../../utils/server/bitunix";
import {
  generateBitgetSignature,
  validateBitgetKeys,
} from "../../../utils/server/bitget";
import { Decimal } from "decimal.js";
import { formatApiNum } from "../../../utils/utils";

export const POST: RequestHandler = async ({ request }) => {
  const { exchange, apiKey, apiSecret, passphrase } = await request.json();

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  try {
    let account = null;
    if (exchange === "bitunix") {
      const validationError = validateBitunixKeys(apiKey, apiSecret);
      if (validationError) return json({ error: validationError }, { status: 400 });
      account = await fetchBitunixAccount(apiKey, apiSecret);
    } else if (exchange === "bitget") {
      if (!passphrase) return json({ error: "Missing passphrase" }, { status: 400 });
      const validationError = validateBitgetKeys(apiKey, apiSecret, passphrase);
      if (validationError) return json({ error: validationError }, { status: 400 });
      account = await fetchBitgetAccount(apiKey, apiSecret, passphrase);
    } else {
        return json({ error: "Unsupported exchange" }, { status: 400 });
    }

    return json(account);
  } catch (e: any) {
    // Security: Sanitize error log
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`Error fetching account from ${exchange}:`, errorMsg);
    return json(
      { error: e.message || "Failed to fetch account" },
      { status: 500 },
    );
  }
};

async function fetchBitunixAccount(
  apiKey: string,
  apiSecret: string,
): Promise<any> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";

  // We assume USDT for now as it's the standard
  const params: Record<string, string> = {
    marginCoin: "USDT",
  };

  const { nonce, timestamp, signature, queryString } = generateBitunixSignature(
    apiKey,
    apiSecret,
    params,
    null,
  );

  const url = `${baseUrl}${path}?${queryString}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey,
      timestamp: timestamp,
      nonce: nonce,
      sign: signature,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    // Truncate error text to prevent massive log dumps or leakage
    const safeText = text.slice(0, 200);
    throw new Error(`Bitunix API error: ${response.status} ${safeText}`);
  }

  const res = await response.json();
  if (res.code !== 0 && res.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${res.code} - ${res.msg || "Unknown error"}`,
    );
  }

  // Response structure: data is an array according to example, or object?
  // Docs say: {"code":0,"data":[{"marginCoin":"USDT",...}]}
  const data = Array.isArray(res.data) ? res.data[0] : res.data;

  if (!data) throw new Error("No account data found");

  const available = new Decimal(data.available || "0");
  const margin = new Decimal(data.margin || "0");
  const crossPnL = new Decimal(data.crossUnrealizedPNL || "0");
  const isoPnL = new Decimal(data.isolationUnrealizedPNL || "0");
  const totalPnL = crossPnL.plus(isoPnL);

  return {
    available: formatApiNum(available),
    margin: formatApiNum(margin),
    totalUnrealizedPnL: formatApiNum(totalPnL),
    marginCoin: data.marginCoin,
    frozen: formatApiNum(data.frozen),
    transfer: formatApiNum(data.transfer),
    bonus: formatApiNum(data.bonus),
    positionMode: data.positionMode,
    crossUnrealizedPNL: formatApiNum(crossPnL),
    isolationUnrealizedPNL: formatApiNum(isoPnL),
  };
}

async function fetchBitgetAccount(
    apiKey: string,
    apiSecret: string,
    passphrase: string
): Promise<any> {
    const baseUrl = "https://api.bitget.com";
    const path = "/api/mix/v1/account/account";
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

    const data = res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) : null;
    if (!data) throw new Error("No account data found");

    // Bitget fields: available, locked, equity, usdtEquity, unrealizedPL
    return {
        available: formatApiNum(data.available),
        margin: formatApiNum(data.locked), // locked margin?
        totalUnrealizedPnL: formatApiNum(data.unrealizedPL),
        marginCoin: data.marginCoin,
        frozen: formatApiNum(data.locked), // Bitget usually groups margin/frozen in locked
        // Map other fields as needed
        equity: formatApiNum(data.equity)
    };
}
