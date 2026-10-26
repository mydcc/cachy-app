/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, vi } from "vitest";
import {
  aiUpstreamFailure,
  collapseUnsafeText,
  redactForLog,
} from "./aiProxyError";

describe("redactForLog", () => {
  it("redacts a short key, which the old code skipped", () => {
    const out = redactForLog("Invalid key ab for account 42", ["ab"]);
    expect(out).toContain("***");
    expect(out).not.toContain("ab");
  });

  it("collapses newlines, Unicode separators and ANSI escapes", () => {
    const out = redactForLog("a\nb\u2028c\u2029d\u001b[31me", []);
    expect(out).not.toContain("\n");
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
    expect(out).not.toContain("\u001b");
    expect(collapseUnsafeText("x\u0085y")).toBe("x y");
  });
});

describe("aiUpstreamFailure", () => {
  it("consumes the body, logs a redacted detail and returns the generic message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = new Response(
      JSON.stringify({ error: { message: "bad key sk-secret here" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

    const result = await aiUpstreamFailure(response, "test upstream", ["sk-secret"]);

    expect(result.status).toBe(401);
    expect(await result.json()).toEqual({ error: "AI provider request failed" });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("***");
    expect(logged).not.toContain("sk-secret");
    log.mockRestore();
  });
});
