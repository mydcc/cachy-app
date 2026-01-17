import type { RequestHandler } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { cache } from "$lib/server/cache";

export const GET: RequestHandler = async ({ url, fetch }) => {
  const symbols = url.searchParams.get("symbols");
  const provider = url.searchParams.get("provider") || "bitunix";
  const type = url.searchParams.get("type"); // 'price' (default) or '24hr'

  // symbols parameter is optional for snapshot (all tickers)
  // But we might want to enforce it for 'price' type on Binance?
  // For now, allow empty symbols for Bitunix snapshot.
  if (!symbols && provider === "binance" && type !== "24hr") {
    // Binance ticker/price usually returns all if empty, but let's be safe/conservative
    // Actually Binance allows it too. But let's stick to the current requirement: Bitunix Snapshot.
    // So validation:
  }

  if (!symbols && provider === "binance") {
    // Optional: check if Binance supports all tickers endpoint used below.
    // Binance logic below builds url with symbol=${symbols}. If symbols is null, it fails.
    // So for Binance we require symbols for now (unless we update Binance logic too).
    return json(
      { message: 'Query parameter "symbols" is required for Binance.' },
      { status: 400 },
    );
  }

  const cacheKey = `tickers:${provider}:${symbols || "ALL"}:${type || "default"}`;

  try {
    const data = await cache.getOrFetch(
      cacheKey,
      async () => {
        let apiUrl = "";
        if (provider === "binance") {
          // Binance Futures API
          if (type === "24hr") {
            apiUrl = `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbols}`;
          } else {
            apiUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbols}`;
          }
        } else {
          // Default to Bitunix
          apiUrl = `https://fapi.bitunix.com/api/v1/futures/market/tickers`;
          if (symbols) {
            apiUrl += `?symbols=${symbols}`;
          }
        }

        const response = await fetch(apiUrl);

        if (!response.ok) {
          const errorText = await response.text();
          try {
            const data = JSON.parse(errorText);
            if (
              data.code === 2 ||
              data.code === "2" ||
              (data.msg && data.msg.toLowerCase().includes("system error"))
            ) {
              // eslint-disable-next-line no-throw-literal
              throw { status: 404, message: "Symbol not found" };
            }
          } catch (e: any) {
            if (e.status === 404) throw e;
          }
          // eslint-disable-next-line no-throw-literal
          throw { status: response.status, message: errorText };
        }

        const data = await response.json();
        if (
          provider !== "binance" &&
          data &&
          (data.code === 2 ||
            data.code === "2" ||
            (data.msg && data.msg.toLowerCase().includes("system error")))
        ) {
          // eslint-disable-next-line no-throw-literal
          throw { status: 404, message: "Symbol not found" };
        }
        return data;
      },
      1000,
    ); // 1 second TTL

    return json(data);
  } catch (error: any) {
    if (error && error.status && error.message) {
      return new Response(error.message, {
        status: error.status,
      });
    }

    const message =
      error instanceof Error ? error.message : "An unknown error occurred.";
    return json(
      { message: `Internal server error: ${message}` },
      { status: 500 },
    );
  }
};
