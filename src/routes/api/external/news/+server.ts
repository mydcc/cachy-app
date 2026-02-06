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

export const _newsCache = new Map<string, CachedResponse>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 60 * 60 * 1000; // 60 Minuten (erh\u00f6ht f\u00fcr Quota-Schonung)
const MAX_CACHE_SIZE = 50;

function setCache(key: string, data: any) {
  if (_newsCache.has(key)) {
    _newsCache.delete(key);
  } else if (_newsCache.size >= MAX_CACHE_SIZE) {
    const oldest = _newsCache.keys().next().value;
    if (oldest !== undefined) _newsCache.delete(oldest);
  }
  _newsCache.set(key, { data, timestamp: Date.now() });
}

export const POST: RequestHandler = async ({ request, fetch }) => {
  let cacheKey = ""; // Scope erweitern für catch-Block

  try {
    const { source, apiKey, params, plan } = await request.json();

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}`;
    const now = Date.now();

    // Check Cache
    const cached = _newsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      // Refresh LRU position
      _newsCache.delete(cacheKey);
      _newsCache.set(cacheKey, cached);
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
              setCache(cacheKey, data);
              return data;
            }
            if (response.status === 429) {
              const errorText = await response.text();
              throw new Error(`Upstream error (${p}): 429 - ${errorText}`);
            }
            if (response.status === 404) {
              lastError = `404 Not Found for plan: ${p}`;
              continue;
            }
            const errorText = await response.text();
            throw new Error(`Upstream error (${p}): ${response.status} - ${errorText}`);
          } catch (e: any) {
            const msg = e.message || String(e);
            if (msg.includes("429")) throw e;
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
        setCache(cacheKey, data);
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

    // 429-Error → Nutze stale cache falls vorhanden
    if (errorMsg.includes("429") || errorMsg.includes("quota")) {
      const staleCache = _newsCache.get(cacheKey);
      if (staleCache) {
        console.warn("[NewsProxy] Using stale cache due to quota exhaustion");
        return json(staleCache.data);
      }
    }

    return json(
      { error: errorMsg || "Internal Proxy Error" },
      { status: 500 },
    );
  }
};
