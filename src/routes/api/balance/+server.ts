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
import { Decimal } from "decimal.js";
import { formatApiNum } from "../../../utils/utils";

export const POST: RequestHandler = async ({ request }) => {
  const { exchange, apiKey, apiSecret, passphrase } = await request.json();

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  try {
    let balance = "0";

    if (exchange === "bitunix") {
      balance = await fetchBitunixBalance(apiKey, apiSecret);
    } else if (exchange === "bitget") {
      if (!passphrase) return json({ error: "Missing passphrase" }, { status: 400 });
      balance = await fetchBitgetBalance(apiKey, apiSecret, passphrase);
    } else {
      return json({ error: "Unsupported exchange" }, { status: 400 });
    }

    return json({ balance });
  } catch (e: any) {
    console.error(`Error fetching balance from ${exchange}:`, e);
    return json(
      { error: e.message || "Failed to fetch balance" },
      { status: 500 },
    );
  }
};

async function fetchBitunixBalance(
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/account";

  // Params for the request
  const params: Record<string, string> = {
    marginCoin: "USDT",
  };

  // 1. Generate Nonce and Timestamp
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // 2. Sort and Concatenate Query Params (keyvaluekeyvalue...)
  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  // 3. Construct Digest Input
  // digestInput = nonce + timestamp + apiKey + queryParams + body
  // Body is empty for GET
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

  // 4. Calculate Digest (SHA256)
  const digest = createHash("sha256").update(digestInput).digest("hex");

  // 5. Calculate Signature (SHA256 of digest + secret)
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  // 6. Build Query String for URL (standard format key=value)
  const queryString = new URLSearchParams(params).toString();

  const response = await fetch(`${baseUrl}${path}?${queryString}`, {
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
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`,
    );
  }

  // Parsing Logic
  const accountInfo = data.data;

  if (!accountInfo) {
    return "0";
  }

  // Case: It returns an array of assets (as per documentation)
  if (Array.isArray(accountInfo)) {
    const usdt = accountInfo.find(
      (a: any) =>
        a.marginCoin === "USDT" || a.currency === "USDT" || a.asset === "USDT",
    );
    if (usdt) {
      // Calculate total wallet balance = available + margin + frozen
      // If explicit marginBalance/equity is present, prioritize that.
      if (usdt.marginBalance) return formatApiNum(usdt.marginBalance) || "0";
      if (usdt.equity) return formatApiNum(usdt.equity) || "0";

      const available = new Decimal(usdt.available || "0");
      const margin = new Decimal(usdt.margin || "0");
      const frozen = new Decimal(usdt.frozen || "0");
      return formatApiNum(available.plus(margin).plus(frozen)) || "0";
    }
  }

  // Case: Direct property on the object (fallback)
  if (accountInfo.marginBalance) {
    return formatApiNum(accountInfo.marginBalance) || "0";
  }

  // Fallback: available
  if (accountInfo.available) {
    return formatApiNum(accountInfo.available) || "0";
  }

  // Fallback: equity
  if (accountInfo.equity) {
    return formatApiNum(accountInfo.equity) || "0";
  }

  return "0";
}

async function fetchBitgetBalance(
  apiKey: string,
  apiSecret: string,
  passphrase: string
): Promise<string> {
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
    if (!data) return "0";

    // Return equity (total balance including unrealized PnL) or marginBalance (wallet balance + unrealized PnL)?
    // Usually equity is what users want to see as "Total Balance".
    return formatApiNum(data.equity || data.marginBalance) || "0";
}
