/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BUG-0472: a model-suggested batch must never reach `tradeState` without a
 * user confirmation when it changes the trade setup or the risk posture.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from "../lib/appAuth";
import { aiState } from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../lib/ai/actionPolicy";

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

function actionBatch(actions: unknown[]): string {
  return `Here is the plan.\n\`\`\`json\n${JSON.stringify(actions)}\n\`\`\``;
}

function withLeverageAllowed(): string[] {
  return [...AI_ALLOWED_ACTIONS_DEFAULT, "setLeverage"];
}

describe("AI action confirmation (BUG-0472)", () => {
  beforeEach(() => {
    vi.mocked(appFetch).mockReset();
    aiState.messages = [];
    aiState.pendingActions = new Map();
    aiState.error = null;

    tradeState.symbol = "";
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
  });

  it("queues a permitted leverage change instead of applying it", async () => {
    settingsState.aiAllowedActions = withLeverageAllowed();
    const before = tradeState.leverage;
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(actionBatch([{ action: "setLeverage", value: "50" }])),
    );

    await aiState.sendMessage("set leverage to 50");

    expect(tradeState.leverage).toBe(before);
    expect(aiState.pendingActions.size).toBe(1);

    const [pendingId] = [...aiState.pendingActions.keys()];
    aiState.confirmAction(pendingId);

    expect(tradeState.leverage).toBe("50");
    expect(aiState.pendingActions.size).toBe(0);
  });

  it("applies a benign note immediately when the toggle is off", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(
        actionBatch([{ action: "setNotes", value: "watch the wick" }]),
      ),
    );

    await aiState.sendMessage("note this");

    expect(tradeState.tradeNotes).toBe("watch the wick");
    expect(aiState.pendingActions.size).toBe(0);
  });

  it("refuses a risky action the user switched off", async () => {
    const before = tradeState.leverage;
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(actionBatch([{ action: "setLeverage", value: "50" }])),
    );

    await aiState.sendMessage("set leverage to 50");

    expect(tradeState.leverage).toBe(before);
    expect(aiState.pendingActions.size).toBe(0);
    expect(
      aiState.messages.some(
        (message) =>
          message.role === "system" && message.content.includes("setLeverage"),
      ),
    ).toBe(true);
  });

  it("refuses an action the curated catalog never offered", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(actionBatch([{ action: "setSymbol", value: "ETHUSDT" }])),
    );

    await aiState.sendMessage("switch to ETHUSDT");

    expect(tradeState.symbol).toBe("");
    expect(aiState.pendingActions.size).toBe(0);
  });

  it("refuses catalog-unknown actions even when queued directly", () => {
    aiState.pendingActions.set("direct", {
      id: "direct",
      actions: [{ action: "setSymbol", value: "ETHUSDT" }],
      timestamp: Date.now(),
    });

    aiState.confirmAction("direct");

    expect(tradeState.symbol).toBe("");
    expect(aiState.pendingActions.size).toBe(0);
  });

  it("drops malformed shapes with a notice instead of crashing", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(
        actionBatch([
          { action: "setNotes", value: "watch the wick" },
          null,
          { action: "setTags", value: "scalp" },
        ]),
      ),
    );

    await aiState.sendMessage("broken batch");

    expect(tradeState.tradeNotes).toBe("watch the wick");
    expect(aiState.pendingActions.size).toBe(0);
    expect(
      aiState.messages.some(
        (message) =>
          message.role === "system" &&
          (message.content.includes("malformed") ||
            message.content.includes("ungültig")),
      ),
    ).toBe(true);
  });
});
