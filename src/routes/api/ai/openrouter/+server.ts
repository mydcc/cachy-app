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
import { checkClientToken } from "../../../../lib/server/clientToken";
import { readAiRequest } from "../../../../lib/server/aiRequestGuard";
import {
  AI_PROXY_ERROR_MESSAGE,
  aiUpstreamFailure,
  logAiProxyError,
} from "../../../../lib/server/aiProxyError";
import { resolveProviderEndpoint } from "../../../../lib/server/aiEndpoint";
import {
  isUrlAllowedAsync,
  safeFetch,
} from "../../../../lib/server/urlValidator";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let apiKey: string | null = null;
  try {
    const guarded = await readAiRequest(request);
    if (!guarded.ok) return guarded.response;

    const { messages, model, tools, baseUrl } = guarded.data;
    apiKey = request.headers.get("x-api-key");

    if (!apiKey && !baseUrl?.trim()) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    const targetUrl = resolveProviderEndpoint(
      baseUrl,
      "https://openrouter.ai/api/v1/chat/completions",
      "v1/chat/completions",
    );

    if (!(await isUrlAllowedAsync(targetUrl))) {
      return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Title": "Cachy",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    // OpenRouter speaks the OpenAI chat-completions wire format.
    const response = await safeFetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "openrouter/auto",
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      return aiUpstreamFailure(response, "OpenRouter upstream", [apiKey]);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    logAiProxyError("OpenRouter", e, [apiKey]);
    return json({ error: AI_PROXY_ERROR_MESSAGE }, { status: 500 });
  }
};
