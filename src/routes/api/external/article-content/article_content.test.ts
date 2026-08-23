/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./+server";
import * as clientToken from "../../../../lib/server/clientToken";
import type { RequestEvent } from "@sveltejs/kit";

const getClientAddress = () => "127.0.0.1";

describe("Article Content Extractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clientToken, "checkClientToken").mockReturnValue(null);
  });

  it("should return 400 for invalid url", async () => {
    const request = new Request("http://localhost/api/external/article-content", {
      method: "POST",
      body: JSON.stringify({ url: "invalid-url" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST({
      request,
      getClientAddress,
    } as unknown as RequestEvent);

    expect(response.status).toBe(400);
  });

  it("should return 403 for private, octal, hex, and loopback URLs (SSRF block)", async () => {
    const blockedUrls = [
      "http://localhost:3000/news",
      "http://127.0.0.1:8080/article",
      "http://0177.0.0.1/article",
      "http://0x7f.0.0.1/article",
      "http://169.254.169.254/latest/meta-data/",
    ];

    for (const url of blockedUrls) {
      const request = new Request("http://localhost/api/external/article-content", {
        method: "POST",
        body: JSON.stringify({ url }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST({
        request,
        getClientAddress,
      } as unknown as RequestEvent);

      expect(response.status).toBe(403);
    }
  });

  it("should extract title and paragraphs from html", async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>CoinDesk Article</title></head>
        <body>
          <header><nav>Navigation</nav></header>
          <article>
            <h1>Bitcoin Surges Above Resistance</h1>
            <p>Bitcoin has broken out of its multi-week consolidation range with significant volume.</p>
            <p>Institutional inflows into spot ETFs have accelerated over the past three trading sessions.</p>
            <p class="cookie-banner">Accept cookies to continue</p>
          </article>
          <footer>Footer info</footer>
        </body>
      </html>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => mockHtml,
      }),
    );

    const request = new Request("http://localhost/api/external/article-content", {
      method: "POST",
      body: JSON.stringify({ url: "https://www.coindesk.com/markets/2026/08/16/btc-surge" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST({
      request,
      getClientAddress,
    } as unknown as RequestEvent);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.title).toBe("Bitcoin Surges Above Resistance");
    expect(json.paragraphs).toHaveLength(2);
    expect(json.paragraphs[0]).toContain("Bitcoin has broken out");
    expect(json.paragraphs[1]).toContain("Institutional inflows");
  });
});
