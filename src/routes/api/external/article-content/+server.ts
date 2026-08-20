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
import { isUrlAllowed } from "../../../../lib/server/urlValidator";
import { JSDOM } from "jsdom";

const _rateLimits = createRateLimiter({ windowMs: 60 * 1000, max: 30 });

interface CachedArticle {
  data: {
    title?: string;
    paragraphs: string[];
  };
  timestamp: number;
}

const articleCache = new Map<string, CachedArticle>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;

async function extractArticleContent(targetUrl: string): Promise<{ title?: string; paragraphs: string[] }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { paragraphs: [] };
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Clean out noisy elements
    doc
      .querySelectorAll(
        "script, style, noscript, iframe, nav, header, footer, aside, form, svg, figure, button, [role='dialog'], .cookie-banner, .advertisement",
      )
      .forEach((el) => el.remove());

    // Search candidate containers
    const candidates = [
      ...Array.from(
        doc.querySelectorAll(
          ".post-content, .article-body, .article-content, [itemprop='articleBody'], .entry-content, main, article",
        ),
      ),
      doc.body,
    ];

    let bestTarget: Element | null = doc.body;
    let maxValidParagraphs = 0;

    for (const cand of candidates) {
      if (!cand) continue;
      const validCount = Array.from(cand.querySelectorAll("p")).filter(
        (p) => (p.textContent || "").trim().length > 35,
      ).length;
      if (validCount > maxValidParagraphs) {
        maxValidParagraphs = validCount;
        bestTarget = cand;
      }
    }

    const paragraphs: string[] = [];
    if (bestTarget) {
      bestTarget.querySelectorAll("p").forEach((p) => {
        const text = (p.textContent || "").trim();
        if (
          text.length > 30 &&
          !text.toLowerCase().includes("all rights reserved") &&
          !text.toLowerCase().includes("cookie policy") &&
          !text.toLowerCase().includes("terms of service") &&
          !text.toLowerCase().includes("privacy policy") &&
          !text.toLowerCase().includes("subscribe to our")
        ) {
          paragraphs.push(text);
        }
      });
    }

    if (paragraphs.length >= 1) {
      return {
        title: doc.querySelector("h1")?.textContent?.trim(),
        paragraphs,
      };
    }
  } catch {
    // Network or parse error
  }

  return { paragraphs: [] };
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  if (!_rateLimits.consume(getClientAddress())) {
    return json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return json({ error: "Invalid URL" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return json({ error: "Invalid URL" }, { status: 400 });
    }

    if (!isUrlAllowed(url)) {
      return json({ error: "Invalid or prohibited URL" }, { status: 403 });
    }

    const cached = articleCache.get(url);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return json(cached.data);
    }

    const data = await extractArticleContent(url);

    if (articleCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = articleCache.keys().next().value;
      if (oldestKey) articleCache.delete(oldestKey);
    }

    articleCache.set(url, { data, timestamp: Date.now() });

    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ paragraphs: [], error: message });
  }
};
