/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The telemetry context is registered inline in `app.init()`, which pulls in
 * the whole exchange stack. Reading the provider's source is the cheap way to
 * pin what ADR-0001 forbids; the payload itself has no seam that a behavioural
 * unit test could mount without booting the app.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app.ts", import.meta.url), "utf8");

describe("app telemetry context (BUG-0778)", () => {
  it("does not send Class A settings dimensions", () => {
    expect(source).not.toMatch(/\bapp_theme\b/);
    expect(source).not.toMatch(/\bapp_provider\b/);
    expect(source).not.toMatch(/\bapp_background\b/);
  });

  it("reduces window entries to their type, never the symbol-bearing id", () => {
    expect(source).toContain("app_modals:");
    expect(source).toContain(".windowType");
    expect(source).not.toContain("w.id).join");
  });
});
