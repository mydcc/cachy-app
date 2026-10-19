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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0704 — the context check has to reach the batch the confirmation block
 * renders, and it must not turn into a gate: the flagged value stays in the
 * batch and is applied when the user confirms it. These tests drive the real
 * send path with a streamed action block and read the queued batch back.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from "../lib/appAuth";
import { aiState } from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { marketState } from "./market.svelte";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../lib/ai/actionPolicy";
import type { MarketData } from "./market/types";

function actionResponse(actions: unknown[]): Response {
  return streamResponse(`Levels:\n\`\`\`json\n${JSON.stringify(actions)}\n\`\`\``);
}

function streamResponse(content: string): Response {
  const encoder = new TextEncoder();
  const payload =
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n` +
    `data: [DONE]\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

function marketData(lastPrice: string): MarketData {
  return {
    symbol: "BTCUSDT",
    lastPrice: new Decimal(lastPrice),
    indexPrice: new Decimal(lastPrice),
    markPrice: new Decimal(lastPrice),
    fundingRate: new Decimal("0.0001"),
    nextFundingTime: null,
    highPrice: new Decimal("83142.4"),
    lowPrice: new Decimal("80627"),
    volume: new Decimal("21622.5"),
    klines: {},
  } as unknown as MarketData;
}

function queuedBatch() {
  return [...aiState.pendingActions.values()][0];
}

describe("action prices against the context", () => {
  beforeEach(() => {
    vi.mocked(appFetch).mockReset();
    aiState.messages = [];
    aiState.pendingActions = new Map();
    aiState.error = null;
    aiState.errorStatus = null;

    tradeState.symbol = "BTCUSDT";
    tradeState.entryPrice = "";
    tradeState.stopLossPrice = "";
    settingsState.showTechnicals = false;
    settingsState.enableCmcContext = false;
    settingsState.enableNewsAnalysis = false;
    settingsState.aiConfirmActions = false;
    settingsState.aiAllowedActions = [...AI_ALLOWED_ACTIONS_DEFAULT];
    settingsState.userProviders = [
      {
        id: "test-provider",
        label: "Test",
        flavor: "openai-chat",
        baseUrl: "https://example.test/v1",
        model: "test-model",
        apiKey: "sk-test",
        allowServerRelay: true,
      },
    ];
    settingsState.activeProviderId = "test-provider";
    settingsState.aiProvider = "openai";

    marketState.data = { BTCUSDT: marketData("81859.7") };
  });

  it("flags a price the context never carried", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([{ action: "setEntryPrice", value: 12345 }]),
    );

    await aiState.sendMessage("analyse the market");

    expect(queuedBatch()?.unverifiedPrices).toEqual([
      { action: "setEntryPrice", value: "12345" },
    ]);
    expect(queuedBatch()?.pricesUnchecked).toBeUndefined();
  });

  it("leaves a price the context carried unflagged", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([{ action: "setEntryPrice", value: "81859.7" }]),
    );

    await aiState.sendMessage("analyse the market");

    expect(queuedBatch()?.actions).toHaveLength(1);
    expect(queuedBatch()?.unverifiedPrices).toBeUndefined();
  });

  it("flags the batched target when only one of them is invented", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([
        { action: "setEntryPrice", value: "81859.7" },
        { action: "setStopLoss", value: "80627" },
        { action: "setTakeProfit", index: 0, value: "70000" },
      ]),
    );

    await aiState.sendMessage("analyse the market");

    expect(queuedBatch()?.unverifiedPrices).toEqual([
      { action: "setTakeProfit", index: 0, value: "70000" },
    ]);
  });

  it("flags a suffixed price the executor would scale", async () => {
    // `executeAction` turns this into 81 859 700; the guard has to see the
    // same number or it verifies a value nobody applies.
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([{ action: "setEntryPrice", value: "81859.7k" }]),
    );

    await aiState.sendMessage("analyse the market");

    expect(queuedBatch()?.unverifiedPrices).toEqual([
      { action: "setEntryPrice", value: "81859.7k" },
    ]);
  });

  it("keeps the flagged value and applies it when the user confirms", async () => {
    // The verdict is evidence, not a gate (BUG-0704 acceptance criterion).
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([{ action: "setEntryPrice", value: 12345 }]),
    );

    await aiState.sendMessage("analyse the market");
    const batch = queuedBatch();
    expect(batch?.actions).toHaveLength(1);
    expect(batch?.unverifiedPrices).toHaveLength(1);

    aiState.confirmAction(batch!.id);

    expect(tradeState.entryPrice).toBe("12345");
  });

  it("does not flag a batch without price actions", async () => {
    // A note-only batch is the only non-price batch that can apply without
    // confirmation; setup/risk-only batches queue as well and carry no price.
    settingsState.aiConfirmActions = true;
    vi.mocked(appFetch).mockResolvedValue(
      actionResponse([{ action: "setNotes", value: "12345" }]),
    );

    await aiState.sendMessage("note this");

    expect(queuedBatch()?.actions).toHaveLength(1);
    expect(queuedBatch()?.unverifiedPrices).toBeUndefined();
    expect(queuedBatch()?.pricesUnchecked).toBeUndefined();
  });
});
