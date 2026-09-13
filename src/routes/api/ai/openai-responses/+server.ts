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
 * OpenAI Responses relay — FEAT-0467, ADR-0019.
 *
 * Some aggregators (OpenCode Zen, Command Code) serve their newest models over
 * the Responses API instead of Chat Completions. The client sends the same
 * `{ messages, model, tools, baseUrl }` shape as every other route; this
 * translates it to Responses and streams the SSE events, which the client
 * parses with the `openai-responses` adapter.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getErrorMessage } from "../../../../utils/errorUtils";
import { checkClientToken } from "../../../../lib/server/clientToken";
import { AiRequestSchema } from "../../../../types/ai";
import { resolveProviderEndpoint } from "../../../../lib/server/aiEndpoint";
import {
  isUrlAllowedAsync,
  safeFetch,
} from "../../../../lib/server/urlValidator";

interface OpenAiChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
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

    if (!apiKey && !baseUrl?.trim()) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    // Responses takes the system prompt as `instructions` and the rest as
    // `input`; a standalone system message is not part of `input`.
    const instructions = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const input = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const targetUrl = resolveProviderEndpoint(
      baseUrl,
      "https://api.openai.com/v1/responses",
      "v1/responses",
    );

    if (!(await isUrlAllowedAsync(targetUrl))) {
      return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await safeFetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model || "gpt-4o",
        instructions: instructions || undefined,
        input,
        // Chat-completions tools nest the definition under `function`;
        // Responses flattens it.
        tools:
          tools && tools.length > 0
            ? (tools as OpenAiChatTool[]).map((t) => ({
                type: "function",
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
              }))
            : undefined,
        max_output_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return json(
        { error: err.error?.message || "OpenAI Responses API Error" },
        { status: response.status },
      );
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    console.error("OpenAI Responses Proxy Error:", e);
    return json({ error: getErrorMessage(e) }, { status: 500 });
  }
};
