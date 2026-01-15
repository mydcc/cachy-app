import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHmac, createHash, randomBytes } from "crypto";

export const POST: RequestHandler = async ({ request }) => {
  const { exchange, apiKey, apiSecret } = await request.json();

  if (!exchange || !apiKey || !apiSecret) {
    return json({ error: "Missing credentials or exchange" }, { status: 400 });
  }

  if (
    typeof apiKey !== "string" ||
    apiKey.length < 5 ||
    typeof apiSecret !== "string" ||
    apiSecret.length < 5
  ) {
    return json({ error: "Invalid credentials format" }, { status: 400 });
  }

  try {
    let account = null;
    if (exchange === "bitunix") {
      account = await fetchBitunixAccount(apiKey, apiSecret);
    } else if (exchange === "binance") {
      // Placeholder
      account = { error: "Not implemented for Binance yet" };
    }

    return json(account);
  } catch (e: any) {
    console.error(`Error fetching account from ${exchange}:`, e);
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

  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
  const digest = createHash("sha256").update(digestInput).digest("hex");
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  const queryString = new URLSearchParams(params).toString();
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
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
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

  const available = parseFloat(data.available || "0");
  const margin = parseFloat(data.margin || "0");
  const crossPnL = parseFloat(data.crossUnrealizedPNL || "0");
  const isoPnL = parseFloat(data.isolationUnrealizedPNL || "0");
  const totalPnL = crossPnL + isoPnL;

  return {
    available,
    margin,
    totalUnrealizedPnL: totalPnL,
    marginCoin: data.marginCoin,
    frozen: parseFloat(data.frozen || "0"),
    transfer: parseFloat(data.transfer || "0"),
    bonus: parseFloat(data.bonus || "0"),
    positionMode: data.positionMode,
    crossUnrealizedPNL: crossPnL,
    isolationUnrealizedPNL: isoPnL,
  };
}
