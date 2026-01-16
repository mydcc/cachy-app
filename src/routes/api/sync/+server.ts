import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHash, randomBytes } from "crypto";

export const POST: RequestHandler = async ({ request }) => {
  const { apiKey, apiSecret, startTime, endTime, limit } = await request.json();

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing credentials" }, { status: 400 });
  }

  // Validate limit
  let parsedLimit = 50;
  if (limit) {
    parsedLimit = Math.min(Math.max(parseInt(limit), 1), 100);
    if (isNaN(parsedLimit)) parsedLimit = 50;
  }

  try {
    const history = await fetchBitunixHistory(
      apiKey,
      apiSecret,
      startTime,
      endTime,
      parsedLimit,
    );
    return json({ data: history });
  } catch (e: any) {
    console.error(`Error fetching history from Bitunix:`, e);
    return json(
      { error: e.message || "Failed to fetch history" },
      { status: 500 },
    );
  }
};

async function fetchBitunixHistory(
  apiKey: string,
  apiSecret: string,
  startTime?: number,
  endTime?: number,
  limit: number = 50,
): Promise<Record<string, any>[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/trade/get_history_trades";

  // Params for the request
  const params: Record<string, string> = {
    limit: limit.toString(),
  };
  if (startTime) params.startTime = startTime.toString();
  if (endTime) params.endTime = endTime.toString();

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
  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;

  // 4. Calculate Digest (SHA256)
  const digest = createHash("sha256").update(digestInput).digest("hex");

  // 5. Calculate Signature (SHA256 of digest + secret)
  const signInput = digest + apiSecret;
  const signature = createHash("sha256").update(signInput).digest("hex");

  // 6. Build Query String for URL
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

  return data.data?.tradeList || [];
}
