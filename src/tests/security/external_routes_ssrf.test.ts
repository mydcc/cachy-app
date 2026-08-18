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

import { POST as articleContentPost } from "../../routes/api/external/article-content/+server";
import { GET as checkFrameSupportGet } from "../../routes/api/external/check-frame-support/+server";

describe("External Routes SSRF Protection (BUG-0235)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const forbiddenUrls = [
    "http://localhost:8080/secret",
    "http://127.0.0.1:3000/api",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/admin",
    "http://10.0.0.1/status",
    "http://172.16.0.1/internal",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://intranet/news",
  ];

  describe("POST /api/external/article-content", () => {
    it("should reject private, loopback, and metadata URLs with 403", async () => {
      for (const url of forbiddenUrls) {
        const mockRequest = new Request("http://localhost/api/external/article-content", {
          method: "POST",
          body: JSON.stringify({ url }),
        });

        const event = {
          request: mockRequest,
          getClientAddress: () => "127.0.0.1",
        } as unknown as Parameters<typeof articleContentPost>[0];

        const response = await articleContentPost(event);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data).toEqual({ error: "Invalid or prohibited URL" });
      }
    });

    it("should allow valid public HTTP/HTTPS URLs", async () => {
      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Test Article</title></head>
          <body>
            <article class="article-content">
              <h1>Test Headline</h1>
              <p>This is a valid public news article paragraph with sufficient length for extraction.</p>
              <p>Another paragraph that provides insightful market analysis and commentary.</p>
            </article>
          </body>
        </html>
      `;

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () => mockHtml,
        }),
      );

      const mockRequest = new Request("http://localhost/api/external/article-content", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/news/article-1" }),
      });

      const event = {
        request: mockRequest,
        getClientAddress: () => "127.0.0.1",
      } as unknown as Parameters<typeof articleContentPost>[0];

      const response = await articleContentPost(event);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.title).toBe("Test Headline");
      expect(data.paragraphs).toHaveLength(2);
    });
  });

  describe("GET /api/external/check-frame-support", () => {
    it("should reject private and loopback addresses with status 403", async () => {
      for (const targetUrl of forbiddenUrls) {
        const url = new URL(`http://localhost/api/external/check-frame-support?url=${encodeURIComponent(targetUrl)}`);
        const mockRequest = new Request(url.toString(), {
          method: "GET",
        });

        const event = {
          request: mockRequest,
          url,
          getClientAddress: () => "127.0.0.1",
        } as unknown as Parameters<typeof checkFrameSupportGet>[0];

        const response = await checkFrameSupportGet(event);
        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data).toEqual({ error: "Invalid or prohibited URL" });
      }
    });

    it("should allow and evaluate valid public domains", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: new Headers({
            "content-type": "text/html",
          }),
        }),
      );

      const targetUrl = "https://example.com";
      const url = new URL(`http://localhost/api/external/check-frame-support?url=${encodeURIComponent(targetUrl)}`);
      const mockRequest = new Request(url.toString(), {
        method: "GET",
      });

      const event = {
        request: mockRequest,
        url,
        getClientAddress: () => "127.0.0.1",
      } as unknown as Parameters<typeof checkFrameSupportGet>[0];

      const response = await checkFrameSupportGet(event);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.domain).toBe("example.com");
      expect(data.supportsIframe).toBe(true);
    });
  });
});
