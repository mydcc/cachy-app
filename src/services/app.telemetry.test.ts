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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * The payload itself is covered by `telemetryContext.test.ts`. This guard
 * pins the wiring in `app.init()`: the provider must keep passing the window
 * list to the pure builder, and the file must not grow a Class A dimension
 * again.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./app.ts", import.meta.url), "utf8");

describe("app telemetry wiring (BUG-0778)", () => {
  it("passes the window list to the pure builder", () => {
    expect(source).toContain("buildTelemetryContext(uiState.windows");
  });

  it("does not reintroduce Class A dimensions", () => {
    expect(source).not.toMatch(/\bapp_theme\b/);
    expect(source).not.toMatch(/\bapp_provider\b/);
    expect(source).not.toMatch(/\bapp_background\b/);
  });
});
