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
 *
 * BUG-0474: schema validation sits in front of the lenient parsers. A batch
 * mixing a valid action with an invalid one must apply the valid action and
 * drop the invalid one with a warning — on both the regex path and the
 * tool-call buffer path — so garbage never reaches `executeAction`.
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

describe("AI action schema validation (BUG-0474)", () => {
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
    settingsState.aiAllowedActions = [
      ...AI_ALLOWED_ACTIONS_DEFAULT,
      "setLeverage",
    ];
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

  it("drops setLeverage with a non-numeric value instead of queueing it", async () => {
    const before = tradeState.leverage;
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(actionBatch([{ action: "setLeverage", value: "high" }])),
    );

    await aiState.sendMessage("set leverage high");

    // Nothing to confirm: the invalid action never reaches the queue …
    expect(aiState.pendingActions.size).toBe(0);
    // … and confirming nothing keeps the leverage untouched (today the
    // "high" string would queue and confirm into "0" via parseAiValue).
    expect(tradeState.leverage).toBe(before);
    expect(
      aiState.messages.some(
        (message) =>
          message.role === "system" &&
          message.content.includes("setLeverage"),
      ),
    ).toBe(true);
  });

  it("applies the valid action when a batch mixes valid and invalid", async () => {
    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(
        actionBatch([
          { action: "setNotes", value: "watch the wick" },
          { action: "setLeverage", value: "high" },
        ]),
      ),
    );

    await aiState.sendMessage("mixed batch");

    expect(tradeState.tradeNotes).toBe("watch the wick");
    expect(aiState.pendingActions.size).toBe(0);
    expect(tradeState.leverage).not.toBe("0");
  });

  it("drops a hostile setSymbol before it can reach tradeState", async () => {
    // setSymbol is permission-blocked today, but the validator must refuse
    // the shape on its own so a future catalog change cannot replay it.
    const { validateAiAction } = await import("../lib/ai/actionValidation");
    expect(
      validateAiAction({ action: "setSymbol", value: "../../etc/passwd" }),
    ).toBeNull();

    vi.mocked(appFetch).mockResolvedValue(
      streamResponse(
        actionBatch([{ action: "setSymbol", value: "../../etc/passwd" }]),
      ),
    );

    await aiState.sendMessage("switch symbol");

    expect(tradeState.symbol).toBe("");
    expect(aiState.pendingActions.size).toBe(0);
  });
});
