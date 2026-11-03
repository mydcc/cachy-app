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

// @vitest-environment jsdom

/*
 * FEAT-0678, AC 2, 3 and 4 — the Academy request under both consent states.
 *
 * `aiEgressConsent.test.ts` pins the chat's boundary. This file pins the
 * Academy's, against the same stores the chat reads: with Class A data present
 * in the journal, the account and the trade form, none of it may appear in the
 * messages the Academy sends — and flipping `aiShareTradeContext` may not
 * change a single byte, because this path never reads it.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";

import { settingsState } from "../../stores/settings.svelte";
import { journalState } from "../../stores/journal.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { accountState } from "../../stores/account.svelte";
import {
  buildExplanationContext,
  buildExplanationMessages,
} from "../../lib/academy/liveExplanation";
import type { CatalogueEntry } from "../../lib/alerts/indicatorCatalogue";

const entry = {
  id: "rsi",
  group: "oscillators",
  params: [{ name: "period", kind: "period", default: 14 }],
  outputs: [{ name: "value", dimension: "oscillator" }],
  placement: "pane",
} as unknown as CatalogueEntry;

function messages() {
  const context = buildExplanationContext({
    entry,
    params: { period: 14 },
    field: "close",
    symbol: "BTCUSDT",
    timeframe: "1h",
    series: {
      lines: [{ name: "value", values: ["61.2", "60.4"] }],
      refused: [],
    },
    generatedAt: "2026-11-03T12:00:00.000Z",
  });
  return buildExplanationMessages(context, "en");
}

describe("Academy egress boundary (FEAT-0678)", () => {
  beforeEach(() => {
    localStorage.clear();

    // The same Class A data the chat test plants, so "nothing leaked" is a
    // statement about real content rather than about empty stores.
    journalState.entries = [
      {
        id: "entry-1",
        symbol: "BTCUSDT",
        tradeType: "long",
        entryPrice: "50000",
        exitPrice: "55000",
        entryDate: "2026-08-01T10:00:00Z",
        exitDate: "2026-08-01T12:00:00Z",
        totalNetProfit: "1337.42",
        rating: 5,
        tags: ["secret-strategy"],
      },
    ];

    tradeState.symbol = "BTCUSDT";
    tradeState.entryPrice = "60000";
    tradeState.stopLossPrice = "58000";
    tradeState.riskPercentage = "2.5";
    tradeState.targets = [{ price: "65000", percent: 100 }];

    accountState.positions = [
      {
        symbol: "BTCUSDT",
        side: "buy",
        size: new Decimal("0.5"),
        entryPrice: new Decimal("59000"),
        markPrice: new Decimal("60000"),
        liquidationPrice: new Decimal("40000"),
        leverage: 10,
        margin: new Decimal("3000"),
        unrealizedPnl: new Decimal("500"),
      },
    ];
  });

  it("sends no Class A field with consent off", () => {
    settingsState.aiShareTradeContext = false;
    const serialized = JSON.stringify(messages());

    expect(serialized).not.toContain("1337.42");
    expect(serialized).not.toContain("secret-strategy");
    expect(serialized).not.toContain("60000");
    expect(serialized).not.toContain("65000");
    expect(serialized).not.toContain("portfolioStats");
    expect(serialized).not.toContain("openPositions");
    expect(serialized).not.toContain("tradeSetup");
    expect(serialized).not.toContain("recentHistory");
  });

  it("is byte-identical with consent on — the path never reads the toggle", () => {
    settingsState.aiShareTradeContext = false;
    const off = JSON.stringify(messages());

    settingsState.aiShareTradeContext = true;
    const on = JSON.stringify(messages());

    expect(on).toBe(off);
  });
});
