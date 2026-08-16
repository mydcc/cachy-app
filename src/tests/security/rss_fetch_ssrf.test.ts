/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock authentication to bypass security check during test
vi.mock("../../lib/server/clientToken", () => ({
  checkClientToken: vi.fn(() => null),
}));

// Import the handler
import { POST } from "../../routes/api/rss-fetch/+server";

describe("POST /api/rss-fetch SSRF Protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 403 for an invalid URL format", async () => {
    const mockRequest = new Request("http://localhost/api/rss-fetch", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-valid-url-format" }),
    });

    const event = {
      request: mockRequest,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(event);
    expect(response.status).toBe(403);

    const data = await response.json();
    expect(data).toEqual({ error: "Invalid or prohibited URL" });
  });

  it("should return 403 for private and loopback IP addresses (SSRF block)", async () => {
    const forbiddenUrls = [
      "http://localhost:8080/feed",
      "http://127.0.0.1:3000/rss",
      "http://169.254.169.254/latest/meta-data/",
      "http://192.168.1.1/router-status",
      "http://10.0.0.1/admin",
      "http://172.16.0.1/secret",
      "ftp://example.com/feed.xml",
      "file:///etc/passwd",
    ];

    for (const url of forbiddenUrls) {
      const mockRequest = new Request("http://localhost/api/rss-fetch", {
        method: "POST",
        body: JSON.stringify({ url }),
      });

      const event = {
        request: mockRequest,
        getClientAddress: () => "127.0.0.1",
      } as unknown as Parameters<typeof POST>[0];

      const response = await POST(event);
      expect(response.status).toBe(403);
    }
  });

  it("should allow valid public RSS feed domains like bitcoin-kurier.de", async () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Bitcoin-Kurier</title>
          <link>https://bitcoin-kurier.de</link>
          <item>
            <title>Bitcoin Halving Rally</title>
            <link>https://bitcoin-kurier.de/bitcoin-halving</link>
            <pubDate>Wed, 12 Aug 2026 10:59:09 +0000</pubDate>
            <description>Spannende Neuigkeiten im Markt.</description>
          </item>
        </channel>
      </rss>`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockXml,
      }),
    );

    const mockRequest = new Request("http://localhost/api/rss-fetch", {
      method: "POST",
      body: JSON.stringify({ url: "https://bitcoin-kurier.de/feed/" }),
    });

    const event = {
      request: mockRequest,
      getClientAddress: () => "127.0.0.1",
    } as unknown as Parameters<typeof POST>[0];

    const response = await POST(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.feedTitle).toBe("Bitcoin-Kurier");
    expect(data.items).toHaveLength(1);
    expect(data.items[0].title).toBe("Bitcoin Halving Rally");
    expect(data.items[0].description).toBe("Spannende Neuigkeiten im Markt.");
  });
});
