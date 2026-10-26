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

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * BUG-0727: no public market-data route may reflect an upstream body.
 *
 * The behavioural test lives on tickers; this structural guard covers the
 * other five so a copy-pasted `new Response(error.message)` cannot return
 * silently.
 */
const BOUNDARY_ROUTES = [
  "../../routes/api/funding-rate/+server.ts",
  "../../routes/api/position-tiers/+server.ts",
  "../../routes/api/trading-pairs/+server.ts",
  "../../routes/api/tickers/+server.ts",
  "../../routes/api/bitget/contracts/+server.ts",
];

describe("market-data error boundary", () => {
  it.each(BOUNDARY_ROUTES)("%s uses the shared generic boundary", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).toContain("marketDataErrorResponse");
    expect(source).not.toMatch(/new Response\(\s*error\.message/);
    expect(source).not.toMatch(/Internal server error: \$\{message\}/);
  });

  it("klines returns its own fixed message, not the exception text", () => {
    const source = readFileSync(
      new URL("../../routes/api/klines/+server.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("Failed to fetch klines");
    expect(source).not.toMatch(/message\s*=\s*e\.message/);
  });
});
