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
import { checkClientToken } from "../../../../lib/server/clientToken";
import { createRateLimiter } from "../../../../lib/server/rateLimit";

const _rateLimits = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

const domainCache = new Map<string, { supportsIframe: boolean; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export const GET: RequestHandler = async ({ request, url, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return json({ error: "Missing url parameter" }, { status: 400 });
  }

  let hostname: string;
  try {
    hostname = new URL(targetUrl).hostname.toLowerCase();
  } catch {
    return json({ error: "Invalid URL" }, { status: 400 });
  }

  const cached = domainCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return json({ domain: hostname, supportsIframe: cached.supportsIframe });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeoutId);

    const xfo = (response.headers.get("x-frame-options") || "").toLowerCase();
    const csp = (response.headers.get("content-security-policy") || "").toLowerCase();

    const isBlocked =
      xfo.includes("deny") ||
      xfo.includes("sameorigin") ||
      csp.includes("frame-ancestors 'none'") ||
      csp.includes("frame-ancestors 'self'") ||
      response.status === 403;

    const supportsIframe = !isBlocked;
    domainCache.set(hostname, { supportsIframe, timestamp: Date.now() });

    return json({ domain: hostname, supportsIframe });
  } catch {
    // If request fails or times out, assume blocked for safe in-app display
    domainCache.set(hostname, { supportsIframe: false, timestamp: Date.now() });
    return json({ domain: hostname, supportsIframe: false });
  }
};
