/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { frameSupportService } from "./frameSupportService";

describe("frameSupportService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should identify known blocked domains", () => {
    expect(frameSupportService.isDomainFrameBlocked("https://www.coindesk.com/markets/2026/08/16/article")).toBe(true);
    expect(frameSupportService.isDomainFrameBlocked("https://theblock.co/post/123")).toBe(true);
    expect(frameSupportService.isDomainFrameBlocked("https://decrypt.co/12345/btc")).toBe(true);
    expect(frameSupportService.isDomainFrameBlocked("https://bloomberg.com/news/123")).toBe(true);
  });

  it("should identify known supported domains", () => {
    expect(frameSupportService.isDomainFrameBlocked("https://cointelegraph.com/news/123")).toBe(false);
    expect(frameSupportService.isDomainFrameBlocked("https://space.cachy.app/channel")).toBe(false);
  });

  it("should extract clean domain from url", () => {
    expect(frameSupportService.getDomain("https://sub.domain.com/path?query=1")).toBe("sub.domain.com");
  });
});
