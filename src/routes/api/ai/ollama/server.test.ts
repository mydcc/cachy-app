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
import { issueToken } from "../../../../lib/server/clientToken";
import type { safeFetch } from "../../../../lib/server/urlValidator";

/**
 * BUG-0295: pins the no-baseUrl behaviour of the Ollama proxy after the SSRF
 * fix (BUG-0291) removed the implicit localhost default.
 *
 * The urlValidator mock keeps the shape of the real guard (loopback rejected,
 * explicitly allowlisted hosts pass) so the 403 regression assertions stay
 * meaningful instead of testing the mock.
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

const { POST } = await import("./+server");
const urlValidatorModule = await import("$lib/server/urlValidator");
const envModule = await import("$env/dynamic/private");

const safeFetchMock = vi.mocked<typeof safeFetch>(urlValidatorModule.safeFetch);
const allowedHosts = (
  urlValidatorModule as unknown as { __allowedHosts: Set<string> }
).__allowedHosts;

function makeBody(baseUrl?: string): Record<string, unknown> {
  return {
    messages: [{ role: "user", content: "hi" }],
    model: "llama3",
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };
}

async function post(baseUrl?: string): Promise<Response> {
  const request = new Request("http://localhost/api/ai/ollama", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-app-access-token": issueToken(),
    },
    body: JSON.stringify(makeBody(baseUrl)),
  });
  return POST({
    request,
    getClientAddress: () => "127.0.0.1",
  } as unknown as Parameters<typeof POST>[0]);
}

describe("POST /api/ai/ollama — no-baseUrl handling (BUG-0295)", () => {
  afterEach(() => {
    delete envModule.env.OLLAMA_PROXY_BASE_URL;
    allowedHosts.clear();
    safeFetchMock.mockReset();
  });

  it("answers an unset baseUrl with the documented remedy instead of a bare 403", async () => {
    const response = await post();

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("OLLAMA_PROXY_BASE_URL");
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("forwards requests without baseUrl to the operator-configured default", async () => {
    envModule.env.OLLAMA_PROXY_BASE_URL = "https://ollama.example.com:11434/";
    allowedHosts.add("ollama.example.com");
    safeFetchMock.mockResolvedValue(
      new Response("data: ok\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const response = await post();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://ollama.example.com:11434/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("never lets the operator default bypass the reserved-IP guard", async () => {
    envModule.env.OLLAMA_PROXY_BASE_URL = "http://localhost:11434";

    const response = await post();

    expect(response.status).toBe(403);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ai/ollama — explicit baseUrl (BUG-0291 regression)", () => {
  afterEach(() => {
    delete envModule.env.OLLAMA_PROXY_BASE_URL;
    allowedHosts.clear();
    safeFetchMock.mockReset();
  });

  it("still rejects explicit loopback URLs with 403", async () => {
    const response = await post("http://localhost:11434");

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Invalid or prohibited base URL",
    });
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs with 400", async () => {
    const response = await post("not-a-url");

    expect(response.status).toBe(400);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
