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

import { describe, it, expect, vi, afterEach } from "vitest";
import { issueToken } from "../../../../../lib/server/clientToken";

/**
 * BUG-0295: same no-baseUrl contract as the chat route — see server.test.ts
 * next to /api/ai/ollama for the full rationale.
 */
vi.mock("$lib/server/urlValidator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("$lib/server/urlValidator")>();
  const allowedHosts = new Set<string>();
  const isAllowed = (urlStr: string): boolean => {
    try {
      return allowedHosts.has(new URL(urlStr).hostname);
    } catch {
      return false;
    }
  };
  return {
    ...actual,
    isUrlAllowed: vi.fn(isAllowed),
    isUrlAllowedAsync: vi.fn(async (urlStr: string) => isAllowed(urlStr)),
    safeFetch: vi.fn(),
    __allowedHosts: allowedHosts,
  };
});

vi.mock("$env/dynamic/private", () => ({
  env: {} as Record<string, string | undefined>,
}));

const { GET } = await import("./+server");
const urlValidatorModule = await import("$lib/server/urlValidator");
const envModule = await import("$env/dynamic/private");

const safeFetchMock = vi.mocked(urlValidatorModule.safeFetch);
const allowedHosts = (
  urlValidatorModule as unknown as { __allowedHosts: Set<string> }
).__allowedHosts;

async function get(baseUrl?: string): Promise<Response> {
  const qs = baseUrl !== undefined ? `?baseUrl=${encodeURIComponent(baseUrl)}` : "";
  const url = new URL(`http://localhost/api/ai/ollama/models${qs}`);
  const request = new Request(url, {
    headers: { "x-app-access-token": issueToken() },
  });
  return GET({
    request,
    url,
    getClientAddress: () => "127.0.0.1",
  } as unknown as Parameters<typeof GET>[0]);
}

describe("GET /api/ai/ollama/models — no-baseUrl handling (BUG-0295)", () => {
  afterEach(() => {
    delete envModule.env.OLLAMA_PROXY_BASE_URL;
    allowedHosts.clear();
    safeFetchMock.mockReset();
  });

  it("answers an unset baseUrl with the documented remedy instead of a bare 403", async () => {
    const response = await get();

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("OLLAMA_PROXY_BASE_URL");
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("forwards requests without baseUrl to the operator-configured default", async () => {
    envModule.env.OLLAMA_PROXY_BASE_URL = "http://ollama.lan.example:11434";
    allowedHosts.add("ollama.lan.example");
    safeFetchMock.mockResolvedValue(
      Response.json({ models: [{ name: "llama3", size: 1 }] }),
    );

    const response = await get();

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.models).toEqual([
      { id: "llama3", label: "llama3" },
    ]);
    expect(safeFetchMock).toHaveBeenCalledWith(
      "http://ollama.lan.example:11434/api/tags",
    );
  });

  it("never lets the operator default bypass the reserved-IP guard", async () => {
    envModule.env.OLLAMA_PROXY_BASE_URL = "http://127.0.0.1:11434";

    const response = await get();

    expect(response.status).toBe(403);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("still rejects explicit loopback URLs with 403 (BUG-0291 regression)", async () => {
    const response = await get("http://localhost:11434");

    expect(response.status).toBe(403);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
