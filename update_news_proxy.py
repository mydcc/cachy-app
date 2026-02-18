import sys

content = """/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./";
import { checkAppAuth } from "../../../../lib/server/auth";
import { extractApiCredentials } from "../../../../utils/server/requestUtils";
import { NewsApiResponseSchema, CryptoPanicResponseSchema } from "../../../../types/newsSchemas";

// In-Memory Cache for News Proxy
interface CachedResponse {
  data: any;
  timestamp: number;
}

export const _newsCache = new Map<string, CachedResponse>();
const pendingRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 60 * 60 * 1000; // 60 Minuten (erhöht für Quota-Schonung)
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
  const authError = checkAppAuth(request);
  if (authError) return authError;

  let cacheKey = "";

  try {
    const body = await request.json();
    const { source, params, plan } = body;

    // Extract API Key from Header (primary) or Body (fallback)
    const creds = extractApiCredentials(request, body);
    const apiKey = creds.apiKey || body.apiKey;

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 400 });
    }

    // Cache key still needs apiKey to isolate user quotas/plans
    cacheKey = `${source}:${JSON.stringify(params)}:${plan || "default"}:${apiKey}`;
    const now = Date.now();

    // Check Cache
    const cached = _newsCache.get(cacheKey);
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      _newsCache.delete(cacheKey);
      _newsCache.set(cacheKey, cached);
      return json(cached.data);
    }

    if (pendingRequests.has(cacheKey)) {
      try {
        const data = await pendingRequests.get(cacheKey);
        return json(data);
      } catch (e: any) {
        // Fallthrough
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
          // CryptoPanic requires auth_token in query.
          // Logging handles redaction via logger.ts usually, but here we construct it manually.
          const url = `https://cryptopanic.com/api/${p}/v2/posts/?auth_token=${apiKey}&${query}`;
          try {
            const response = await fetch(url);
            if (response.ok) {
              const rawData = await response.json();
              // Validate Schema
              const validation = CryptoPanicResponseSchema.safeParse(rawData);
              if (!validation.success) {
                   console.warn("[NewsProxy] Schema Validation Warning:", validation.error);
                   // Proceed with best effort or throw?
                   // Given it's a proxy, invalid schema might break UI. Best to sanitize or just pass if 'results' exists.
                   // The prompt asked for Strict Schema Validation.
                   // If schema fails, we treat it as an error.
                   throw new Error("Upstream response failed schema validation");
              }
              const data = validation.data;
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
        // NewsAPI supports X-Api-Key header. Much safer.
        const url = `https://newsapi.org/v2/everything?${query}`;
        const response = await fetch(url, {
             headers: {
                 "X-Api-Key": apiKey
             }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upstream error (NewsAPI): ${response.status} - ${errorText}`);
        }
        const rawData = await response.json();
        const validation = NewsApiResponseSchema.safeParse(rawData);
        if (!validation.success) {
             console.warn("[NewsProxy] NewsAPI Schema Validation Warning:", validation.error);
             throw new Error("Upstream response failed schema validation");
        }
        const data = validation.data;
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
    // Safe logging: Don't log full URL if it has keys
    console.error(`[NewsProxy] Error processing request for ${request.url}:`, errorMsg);

    if (err.cause) console.error("[NewsProxy] Cause:", err.cause);

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
"""

with open('src/routes/api/external/news/+server.ts', 'w') as f:
    f.write(content)
