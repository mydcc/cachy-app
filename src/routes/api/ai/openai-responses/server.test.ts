/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns";
import { issueToken, _resetForTests } from "../../../../lib/server/clientToken";

const { POST } = await import("./+server");

const event = (request: Request) =>
  ({ request, getClientAddress: () => "127.0.0.1" }) as unknown as Parameters<
    typeof POST
  >[0];

const sseResponse = () =>
  new Response('data: {"type":"response.output_text.delta","delta":"hi"}\n\n', {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

describe("POST /api/ai/openai-responses", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetForTests();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as unknown as dns.LookupAddress[]);
  });

  it("translates messages to instructions + input and hits the default endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai-responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "SYS" },
          { role: "user", content: "hi" },
        ],
        model: "gpt-5.6",
      }),
    });

    const res = await POST(event(request));
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-5.6");
    expect(body.instructions).toBe("SYS");
    expect(body.input).toEqual([{ role: "user", content: "hi" }]);
    expect(body.stream).toBe(true);
    expect(body.max_output_tokens).toBe(2000);
  });

  it("flattens chat-completions tools into the responses shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse());
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai-responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
        "x-api-key": "sk-test",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-5.6",
        tools: [
          {
            type: "function",
            function: {
              name: "executeTradeActions",
              description: "d",
              parameters: { type: "object" },
            },
          },
        ],
      }),
    });

    await POST(event(request));

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      {
        type: "function",
        name: "executeTradeActions",
        description: "d",
        parameters: { type: "object" },
      },
    ]);
  });

  it("rejects a reserved baseUrl with 403", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const request = new Request("http://localhost/api/ai/openai-responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-access-token": issueToken(),
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "hi" }],
        baseUrl: "http://127.0.0.1:8000/v1",
      }),
    });

    const res = await POST(event(request));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
