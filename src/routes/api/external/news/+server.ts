/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

// In-Memory Cache for News Proxy
interface CachedResponse {
  data: any;
  timestamp: number;
}

const newsCache = new Map<string, CachedResponse>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const { source, apiKey, params, plan } = await request.json();

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    const cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}`;
    const now = Date.now();

    // Check Cache
    const cached = newsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      return json(cached.data);
    }

    // Check for pending request to deduplicate concurrent calls
    if (pendingRequests.has(cacheKey)) {
      try {
        const data = await pendingRequests.get(cacheKey);
        return json(data);
      } catch (e: any) {
        // Fallthrough to retry if pending fails
      }
    }

    const executeRequest = async () => {
      if (source === "cryptopanic") {
        const query = new URLSearchParams(params).toString();
        const plans: ("developer" | "growth" | "enterprise")[] = [
          "developer",
          "growth",
          "enterprise",
        ];

        if (plan && plans.includes(plan)) {
          const idx = plans.indexOf(plan);
          plans.splice(idx, 1);
          plans.unshift(plan);
        }

        let lastError = "";
        for (const p of plans) {
          const url = `https://cryptopanic.com/api/${p}/v2/posts/?auth_token=${apiKey}&${query}`;
          try {
            const response = await fetch(url);
            if (response.ok) {
              const data = await response.json();
              newsCache.set(cacheKey, { data, timestamp: Date.now() });
              return data;
            }
            if (response.status === 404) {
              lastError = `404 Not Found for plan: ${p}`;
              continue;
            }
            if (response.status === 429 || response.status === 401) {
              const errorText = await response.text();
              // Critical auth/quota error: Do not try other plans, they will share the same limit/key.
              throw new Error(`CRITICAL: Upstream error (${p}): ${response.status} - ${errorText}`);
            }

            const errorText = await response.text();
            throw new Error(`Upstream error (${p}): ${response.status} - ${errorText}`);
          } catch (e: any) {
            const msg = e.message || String(e);
            if (msg.includes("CRITICAL")) {
              lastError = msg;
              break; // Stop loop immediately
            }
            console.warn(`[NewsProxy] Plan ${p} failed:`, msg);
            lastError = msg;
            continue;
          }
        }
        throw new Error(`Could not find valid CryptoPanic endpoint. Last Error: ${lastError}`);
      } else if (source === "newsapi") {
        const query = new URLSearchParams(params).toString();
        const url = `https://newsapi.org/v2/everything?apiKey=${apiKey}&${query}`;
        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upstream error (NewsAPI): ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        newsCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
      } else {
        throw new Error("Invalid source");
      }
    };

    const requestPromise = executeRequest();
    pendingRequests.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      return json(data);
    } finally {
      pendingRequests.delete(cacheKey);
    }

  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[NewsProxy] Error processing request for ${request.url}:`, errorMsg);

    // Detailed error logging for debugging
    if (err.cause) console.error("[NewsProxy] Cause:", err.cause);

    return json(
      { error: errorMsg || "Internal Proxy Error" },
      { status: 500 },
    );
  }
};
