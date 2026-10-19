/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from "vitest";
import { isOpenCodeUrl } from "./opencodeTarget";

describe("isOpenCodeUrl", () => {
  it("matches OpenCode's gateway, its subdomains and a trailing dot", () => {
    expect(
      isOpenCodeUrl("https://opencode.ai/inference/go/v1/chat/completions"),
    ).toBe(true);
    expect(isOpenCodeUrl("https://opencode.ai/inference/go/v1")).toBe(true);
    expect(isOpenCodeUrl("https://api.opencode.ai/v1")).toBe(true);
    expect(isOpenCodeUrl("https://OPENCODE.AI/v1")).toBe(true);
    expect(isOpenCodeUrl("https://opencode.ai./v1")).toBe(true);
  });

  it("matches a base URL that comes without a scheme", () => {
    expect(isOpenCodeUrl("opencode.ai/inference/go/v1")).toBe(true);
  });

  it("rejects lookalike hosts, other providers and empty input", () => {
    // The leading dot is what keeps a conversation id off these hosts.
    expect(isOpenCodeUrl("https://evil-opencode.ai/v1")).toBe(false);
    expect(isOpenCodeUrl("https://notopencode.ai/v1")).toBe(false);
    expect(isOpenCodeUrl("https://opencode.ai.attacker.com/v1")).toBe(false);
    // Userinfo is not part of the hostname, so the host is the attacker's.
    expect(isOpenCodeUrl("https://opencode.ai@evil.com/v1")).toBe(false);
    expect(isOpenCodeUrl("https://api.openai.com/v1")).toBe(false);
    expect(isOpenCodeUrl("")).toBe(false);
    expect(isOpenCodeUrl(null)).toBe(false);
    expect(isOpenCodeUrl(undefined)).toBe(false);
  });
});
