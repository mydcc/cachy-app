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
 * W1-10: the trading pair is user data (AGENTS.md, Class C — "what symbols
 * someone watches is user data"). The panel may report *that* a price/ATR
 * fetch or a suggestion was used; it must not report *which* pair.
 *
 * Source-level guard, same shape as `app.telemetry.test.ts`: the three call
 * sites are far apart in one large component, and a component test would have
 * to drive every one of them through the real DOM to notice the third
 * argument coming back.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./TradeSetupInputs.svelte", import.meta.url),
  "utf8",
);

describe("TradeSetupInputs telemetry (W1-10)", () => {
  it("never passes the trading pair as the event name", () => {
    // The ATR toggle and the timeframe are not user-identifying; the symbol is.
    expect(source).not.toMatch(
      /trackCustomEvent\(\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*(s|symbol)\s*\)/,
    );
  });

  it("still reports that the actions happened", () => {
    expect(source).toContain('trackCustomEvent("Symbol", "SelectSuggestion")');
    expect(source).toContain('trackCustomEvent("Price", "Fetch")');
    expect(source).toContain('trackCustomEvent("ATR", "Fetch")');
  });
});
