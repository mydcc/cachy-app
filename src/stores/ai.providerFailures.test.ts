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
 * BUG-0694 — a provider answer a retry cannot improve.
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
import { newSessionId } from "../lib/ai/sessionId";

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
    aiState.errorStatus = null;
    aiState.sessionId = newSessionId();

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
    // The view branches on this instead of searching the message for "quota".
    expect(aiState.errorStatus).toBe(402);
  });

  it("still retries a server fault and finishes on the second answer", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock
      .mockResolvedValueOnce(errorResponse(503, { error: "Service Unavailable" }))
      .mockResolvedValueOnce(streamResponse("ok"));

    await aiState.sendMessage("analyse the market");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(aiState.error).toBeNull();
    expect(aiState.errorStatus).toBeNull();
  });

  it("names the last server fault when every attempt fails", async () => {
    const fetchMock = vi.mocked(appFetch);
    // A fresh Response per attempt: a Response body can only be read once.
    fetchMock.mockImplementation(async () =>
      errorResponse(503, { error: "Service Unavailable" }),
    );

    await aiState.sendMessage("analyse the market");

    // Three attempts, and the message is the provider's, not a generic one.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(aiState.error).toBe("HTTP 503: Service Unavailable");
    expect(aiState.errorStatus).toBe(503);
  });

  it("backs off on a rate limit and completes on the retry", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.mocked(appFetch);
      fetchMock
        .mockResolvedValueOnce(errorResponse(429, { error: "Rate limited" }))
        .mockResolvedValueOnce(streamResponse("ok"));

      const pending = aiState.sendMessage("analyse the market");
      // 429 backs off 2^attempt seconds; the retry then succeeds.
      await vi.advanceTimersByTimeAsync(2000);
      await pending;

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(aiState.error).toBeNull();
      expect(aiState.errorStatus).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a stable conversation id and rotates it when the chat is cleared", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock.mockImplementation(async () => streamResponse("ok"));

    // The newest request is the last call — no assumption about call indexes.
    const lastHeaders = () =>
      (fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit)
        .headers as Record<string, string>;

    await aiState.sendMessage("erste Frage");
    const first = lastHeaders()["x-session-id"];
    expect(first).toBeTruthy();

    await aiState.sendMessage("zweite Frage");
    expect(lastHeaders()["x-session-id"]).toBe(first);

    // A new conversation must not inherit the old routing.
    aiState.clearHistory();
    await aiState.sendMessage("neue Konversation");
    expect(lastHeaders()["x-session-id"]).not.toBe(first);
  });

  it("uses the server relay for OpenCode even when the toggle is off", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock.mockImplementation(async () => streamResponse("ok"));
    const browserFetch = vi.spyOn(globalThis, "fetch");

    // OpenCode's gateway sends no CORS headers, so a direct request can never
    // work — the relay is used whatever the toggle says.
    settingsState.userProviders[0].baseUrl =
      "https://opencode.ai/inference/go/v1";
    settingsState.userProviders[0].allowServerRelay = false;

    try {
      await aiState.sendMessage("analyse the market");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(browserFetch).not.toHaveBeenCalled();
      expect(aiState.error).toBeNull();
    } finally {
      browserFetch.mockRestore();
    }
  });

  it("omits the conversation id when the platform has no CSPRNG", async () => {
    const fetchMock = vi.mocked(appFetch);
    fetchMock.mockImplementation(async () => streamResponse("ok"));

    // Without a secure context there is no id to send; the relay fills one in.
    aiState.sessionId = "";

    await aiState.sendMessage("analyse the market");

    const headers = (fetchMock.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    expect(headers["x-session-id"]).toBeUndefined();
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

  it("collapses and caps the detail, which is provider-controlled text", () => {
    expect(providerFailureMessage(500, { error: "a\n\n  b" })).toBe(
      "HTTP 500: a b",
    );
    const long = "x".repeat(400);
    const message = providerFailureMessage(500, { error: long });
    expect(message).toBe(`HTTP 500: ${"x".repeat(300)}…`);
  });
});
