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

/*
 * BUG-0692 — a provider answer a retry cannot improve.
 *
 * One click in the assistant used to turn into three provider requests with
 * three different statuses (500, 503, 429), because every answer except 429 was
 * retried. A rejected key or a billing refusal does not change on the second
 * attempt: the user only sees more console noise, and the retries spend quota.
 * The message now names the status, because that is what the console shows.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from "../lib/appAuth";
import {
  aiState,
  isRetryableProviderStatus,
  providerFailureMessage,
} from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { tradeState } from "./trade.svelte";
import { AI_ALLOWED_ACTIONS_DEFAULT } from "../lib/ai/actionPolicy";

function errorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("AI provider failures while sending", () => {
  beforeEach(() => {
    vi.mocked(appFetch).mockReset();
    aiState.messages = [];
    aiState.pendingActions = new Map();
    aiState.error = null;

    tradeState.symbol = "BTCUSDT";
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

  it("asks once for a billing refusal and keeps the status in the message", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock.mockResolvedValue(
      errorResponse(402, { error: { message: "Insufficient quota" } }),
    );

    await aiState.sendMessage("analyse the market");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(aiState.error).toBe("HTTP 402: Insufficient quota");
  });

  it("still retries a server fault and finishes on the second answer", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock
      .mockResolvedValueOnce(errorResponse(503, { error: "Service Unavailable" }))
      .mockResolvedValueOnce(streamResponse("ok"));

    await aiState.sendMessage("analyse the market");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiState.error).toBeNull();
  });
});

describe("isRetryableProviderStatus", () => {
  it("retries rate limits and server faults", () => {
    expect(isRetryableProviderStatus(429)).toBe(true);
    expect(isRetryableProviderStatus(500)).toBe(true);
    expect(isRetryableProviderStatus(503)).toBe(true);
  });

  it("does not retry a rejected key, a billing or a permission answer", () => {
    expect(isRetryableProviderStatus(400)).toBe(false);
    expect(isRetryableProviderStatus(401)).toBe(false);
    expect(isRetryableProviderStatus(402)).toBe(false);
    expect(isRetryableProviderStatus(403)).toBe(false);
    expect(isRetryableProviderStatus(404)).toBe(false);
  });
});

describe("providerFailureMessage", () => {
  it("names the status and prefers the nested provider message", () => {
    expect(
      providerFailureMessage(402, { error: { message: "Insufficient quota" } }),
    ).toBe("HTTP 402: Insufficient quota");
    expect(providerFailureMessage(403, { error: "Forbidden" })).toBe(
      "HTTP 403: Forbidden",
    );
  });

  it("still names the status when the body says nothing useful", () => {
    expect(providerFailureMessage(502, {})).toBe(
      "HTTP 502: no details in the response",
    );
    expect(providerFailureMessage(500, "not json")).toBe(
      "HTTP 500: no details in the response",
    );
  });
});
