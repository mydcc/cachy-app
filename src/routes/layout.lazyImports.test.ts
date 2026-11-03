/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The layout's lazy imports are effects in a Svelte component, so a mounted
 * test would have to boot the whole shell just to reject a dynamic import.
 * Reading the source pins the wiring instead: every catch must go through
 * `handleLazyLoadFailure`, or a stale chunk is swallowed again (BUG-0780).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./+layout.svelte", import.meta.url), "utf8");

describe("+layout lazy import failures (BUG-0780)", () => {
  it("routes every lazy import failure through handleLazyLoadFailure", () => {
    expect(source).not.toContain('console.error("Failed to load');
    expect(source.match(/handleLazyLoadFailure\(/g)?.length ?? 0).toBe(7);
  });
});
