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

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getErrorMessage } from "../../../../utils/errorUtils";
import { checkClientToken } from "../../../../lib/server/clientToken";
import { AiRequestSchema } from "../../../../types/ai";
import {
  isOpenCodeTarget,
  resolveProviderEndpoint,
} from "../../../../lib/server/aiEndpoint";
import { resolveSessionId } from "../../../../lib/ai/sessionId";
import {
  isUrlAllowedAsync,
  safeFetch,
} from "../../../../lib/server/urlValidator";

/** True when the resolved relay target is OpenRouter, which expects its attribution header. */
function isOpenRouterTarget(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).hostname.toLowerCase() === "openrouter.ai";
  } catch {
    return false;
  }
}

/**
 * The built-in OpenAI endpoint refuses `max_tokens` for the GPT-5.x reasoning
 * models ("Unsupported parameter, use max_completion_tokens"), while several
 * OpenAI-compatible relays only accept the older name. The target decides:
 * api.openai.com gets the new parameter, everything else keeps `max_tokens`
 * (BUG-0707 — without this the new default 400s on its first request).
 */
function isOpenAiHost(targetUrl: string): boolean {
  try {
    return new URL(targetUrl).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return false;
  }
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  try {
    const rawBody = await request.json();
    const parseResult = AiRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return json(
        { error: "Invalid request body", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const { messages, model, tools, baseUrl } = parseResult.data;
    const apiKey = request.headers.get("x-api-key");
    /** Cachy's conversation id, translated for providers that need one. */
    const sessionId = request.headers.get("x-session-id");

    if (!apiKey && !baseUrl?.trim()) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    const targetUrl = resolveProviderEndpoint(
      baseUrl,
      "https://api.openai.com/v1/chat/completions",
      "v1/chat/completions",
    );

    if (!(await isUrlAllowedAsync(targetUrl))) {
      return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      // Identify Cachy instead of passing as a generic HTTP library. OpenCode
      // Go asks its clients for that explicitly; other targets ignore it.
      "User-Agent": "CachyApp/1.0 (SvelteKit)",
    };
    // Migrated OpenRouter entries relay through this route (the wire format
    // picks the route, not the vendor): keep the attribution header the
    // dedicated OpenRouter route sends so those requests stay attributed.
    if (isOpenRouterTarget(targetUrl)) {
      headers["X-Title"] = "Cachy";
    }
    if (isOpenCodeTarget(targetUrl)) {
      // OpenCode Go rejects a request without a stable per-conversation id
      // (`400 ... cannot be routed efficiently`). The client sends its own; the
      // fallback keeps other callers of this route working (BUG-0701).
      headers["x-opencode-session"] = resolveSessionId(sessionId);
    }
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await safeFetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "gpt-5.4-mini",
        messages: messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        ...(isOpenAiHost(targetUrl)
          ? { max_completion_tokens: 2000 }
          : { max_tokens: 2000 }),
        stream: true, // Enable streaming
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return json(
        { error: err.error?.message || "OpenAI API Error" },
        { status: response.status },
      );
    }

    // Return the stream directly
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    console.error("OpenAI Proxy Error:", e);
    return json({ error: getErrorMessage(e) }, { status: 500 });
  }
};
