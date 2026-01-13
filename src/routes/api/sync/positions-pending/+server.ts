import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createHash, randomBytes } from "crypto";

export const POST: RequestHandler = async ({ request }) => {
  const { apiKey, apiSecret } = await request.json();

  if (!apiKey || !apiSecret) {
    return json({ error: "Missing credentials" }, { status: 400 });
  }

  try {
    const positions = await fetchBitunixPendingPositions(apiKey, apiSecret);
    return json({ data: positions });
  } catch (e: any) {
    console.error(`Error fetching pending positions from Bitunix:`, e);
    return json(
      { error: e.message || "Failed to fetch pending positions" },
      { status: 500 }
    );
  }
};

async function fetchBitunixPendingPositions(
  apiKey: string,
  apiSecret: string
): Promise<any[]> {
  const baseUrl = "https://fapi.bitunix.com";
  const path = "/api/v1/futures/position/get_pending_positions";

  // Params for the request (empty for all pending positions)
  const params: Record<string, string> = {};

  // 1. Generate Nonce and Timestamp
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Date.now().toString();

  // 2. Sort and Concatenate Query Params
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

  // 6. Build Query String for URL (might be empty)
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
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bitunix API error: ${response.status} ${text}`);
  }

  const data = await response.json();

  if (data.code !== 0 && data.code !== "0") {
    throw new Error(
      `Bitunix API error code: ${data.code} - ${data.msg || "Unknown error"}`
    );
  }

  // Usually data.data is an array for this endpoint, or wrapped in an object
  // Bitunix docs say: data: [...] (Array of positions)
  if (Array.isArray(data.data)) {
    return data.data;
  }

  // Fallback checks
  if (data.data && Array.isArray(data.data.positionList)) {
    return data.data.positionList;
  }

  return [];
}
