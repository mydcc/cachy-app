// @vitest-environment jsdom
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
 * FEAT-0678 — `askOnce` is a request without a chat turn.
 *
 * These pin the three properties the Academy relies on: the answer streams to
 * the caller and nowhere else, a local provider that cannot be reached is an
 * error rather than a relayed request, and a cancellation stays a cancellation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/appAuth", () => ({
  appFetch: vi.fn(),
}));

import { appFetch } from "../lib/appAuth";
import { aiState } from "./ai.svelte";
import { settingsState } from "./settings.svelte";
import { newSessionId } from "../lib/ai/sessionId";

const CHAT_KEY = "cachy_ai_history";

function streamResponse(content: string): Response {
  const encoder = new TextEncoder();
  // Gemini's wire format: the delta lives under candidates[0].content.parts.
  const payload =
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: content }] } }] })}\n\n` +
    `data: [DONE]\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

const messages = [
  { role: "system", content: "explain the indicator" },
  { role: "user", content: "what is RSI saying" },
];

describe("aiState.askOnce (FEAT-0678)", () => {
  beforeEach(() => {
    vi.mocked(appFetch).mockReset();
    localStorage.clear();
    aiState.messages = [];
    aiState.isStreaming = false;
    aiState.error = null;
    aiState.errorStatus = null;
    aiState.sessionId = newSessionId();

    settingsState.aiProvider = "gemini";
    settingsState.geminiApiKey = "AIza-test";
    settingsState.geminiModel = "gemini-3.5-flash-lite";
    settingsState.geminiBaseUrl = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("streams the answer to the caller and leaves the transcript alone", async () => {
    vi.mocked(appFetch).mockResolvedValue(streamResponse("RSI is 61.2 and rising."));
    const seen: string[] = [];

    const result = await aiState.askOnce(messages, {
      onDelta: (content) => seen.push(content),
    });

    expect(result.content).toBe("RSI is 61.2 and rising.");
    expect(seen.at(-1)).toBe("RSI is 61.2 and rising.");

    // No chat turn happened: no messages, no persisted history, no streaming flag.
    expect(aiState.messages).toEqual([]);
    expect(localStorage.getItem(CHAT_KEY)).toBeNull();
    expect(aiState.isStreaming).toBe(false);
  });

  it("sends exactly the messages it was given", async () => {
    vi.mocked(appFetch).mockResolvedValue(streamResponse("ok"));

    await aiState.askOnce(messages);

    const body = JSON.parse(
      (vi.mocked(appFetch).mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.messages).toEqual(messages);
    // No tool schema: a lesson must not be able to change the trade form.
    expect(body).not.toHaveProperty("tools");
  });

  it("fails closed when the local provider is unreachable, and never relays", async () => {
    settingsState.aiProvider = "ollama";
    settingsState.ollamaModel = "llama3.3";
    settingsState.ollamaBaseUrl = "http://localhost:11434";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(aiState.askOnce(messages)).rejects.toThrow(
      /Ollama connection failed/,
    );
    expect(appFetch).not.toHaveBeenCalled();
  });

  it("rethrows a cancellation as a cancellation", async () => {
    settingsState.aiProvider = "ollama";
    settingsState.ollamaModel = "llama3.3";
    settingsState.ollamaBaseUrl = "http://localhost:11434";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new DOMException("The operation was aborted.", "AbortError")),
    );

    await expect(aiState.askOnce(messages)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(appFetch).not.toHaveBeenCalled();
  });
});
