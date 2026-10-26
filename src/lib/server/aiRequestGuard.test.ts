/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from "vitest";
import {
  AI_REQUEST_MAX_BYTES,
  readAiRequest,
  readBoundedJson,
} from "./aiRequestGuard";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/ai/openai", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

describe("readBoundedJson", () => {
  it("parses a valid body", async () => {
    const result = await readBoundedJson(post('{"a":1}'), 1_000);
    expect(result).toEqual({ ok: true, data: { a: 1 } });
  });

  it("refuses a body above the cap even when Content-Length lies", async () => {
    const body = JSON.stringify({ a: "x".repeat(2_000) });
    const result = await readBoundedJson(
      post(body, { "content-length": "10" }),
      1_000,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("refuses a declared Content-Length above the cap without reading", async () => {
    const result = await readBoundedJson(
      post("{}", { "content-length": String(AI_REQUEST_MAX_BYTES + 1) }),
      AI_REQUEST_MAX_BYTES,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("answers 400, not 500, for malformed JSON", async () => {
    const result = await readBoundedJson(post("{"), 1_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("cancels a chunked body as soon as it crosses the cap", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(600));
        controller.enqueue(new Uint8Array(600));
      },
      cancel() {
        cancelled = true;
      },
    });
    // No Content-Length, which is the case the header check cannot cover.
    const request = {
      headers: new Headers(),
      body: stream,
    } as unknown as Request;

    const result = await readBoundedJson(request, 1_000);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
    expect(cancelled).toBe(true);
  });
});

describe("readAiRequest", () => {
  it("applies the AI schema", async () => {
    const result = await readAiRequest(
      post(JSON.stringify({ messages: [{ role: "user", content: "hi" }] })),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses an invalid model before any provider sees it", async () => {
    const result = await readAiRequest(
      post(
        JSON.stringify({
          messages: [],
          model: "gpt-4\nforged-line",
        }),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});
