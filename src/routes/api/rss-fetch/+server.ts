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
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000, // 10 second timeout per feed
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; CachyApp/1.0)",
  },
});

export const POST: RequestHandler = async ({ request }) => {
  let url = "unknown";

  try {
    const body = await request.json();
    url = body.url;

    if (!url || typeof url !== "string") {
      return json(
        { error: "Missing or invalid URL parameter" },
        { status: 400 },
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Fetch and parse RSS feed
    const feed = await parser.parseURL(url);

    // Normalize to NewsItem format
    const items = feed.items.map((item) => ({
      title: item.title || "Untitled",
      url: item.link || url,
      source: feed.title || new URL(url).hostname,
      published_at: item.isoDate || item.pubDate || new Date().toISOString(),
      description: item.contentSnippet || item.content || "",
    }));

    return json({
      items,
      feedTitle: feed.title,
      feedDescription: feed.description,
    });
  } catch (error: any) {
    console.error(`[rss-fetch] Error fetching RSS feed for ${url}:`, {
      message: error.message,
      code: error.code,
      stack: error.stack,
    });

    // Provide helpful error messages
    if (error.code === "ENOTFOUND") {
      return json({ error: "Feed URL not found (DNS error)" }, { status: 404 });
    } else if (error.code === "ETIMEDOUT") {
      return json({ error: "Feed request timed out" }, { status: 504 });
    } else if (
      error.message?.includes("Invalid XML") ||
      error.message?.includes("Unable to parse XML")
    ) {
      // Suppress noisy logs for common scraper blocks/failures
      // console.warn(`[rss-fetch] Parsing failed for ${url}`);
      return json({ error: "Invalid RSS/XML format" }, { status: 422 });
    }

    return json(
      {
        error: "Failed to fetch RSS feed",
        details: error.message,
      },
      { status: 500 },
    );
  }
};
