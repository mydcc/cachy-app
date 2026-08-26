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
import { AiRequestSchema } from "../../../../types/ai";
import { resolveProviderEndpoint } from "../../../../lib/server/aiEndpoint";

interface AnthropicMessageParam {
  role: "user" | "assistant";
  content: string;
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
        { status: 400 }
      );
    }

    const { messages, model, tools, baseUrl } = parseResult.data;
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey && !baseUrl?.trim()) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    let systemBlocks = [];
    const anthropicMessages: AnthropicMessageParam[] = [];

    for (const m of messages) {
      if (m.role === "system") {
        if (m.content) {
            try {
                // If it is our structured format { staticInstruction: ..., dynamicContext: ... }
                // we can parse it and use block caching.
                const parsed = JSON.parse(m.content);
                if (parsed.staticInstruction && parsed.dynamicContext) {
                   systemBlocks.push({
                     type: "text",
                     text: parsed.staticInstruction,
                     cache_control: { type: "ephemeral" }
                   });
                   systemBlocks.push({
                     type: "text",
                     text: "\n\n" + parsed.dynamicContext
                   });
                } else {
                   systemBlocks.push({ type: "text", text: m.content });
                }
            } catch {
                systemBlocks.push({ type: "text", text: m.content });
            }
        }
      } else {
        anthropicMessages.push({
          role: m.role as "user" | "assistant",
          content: m.content,
        });
      }
    }

    const targetUrl = resolveProviderEndpoint(
      baseUrl,
      "https://api.anthropic.com/v1/messages",
      "v1/messages",
    );

    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        // claude-3-5-sonnet-20240620 was retired 2025-10-28 — see
        // shared/model-migration.md. This fallback only fires if the client
        // somehow omits a model, which normal use through Settings never does.
        model: model || "claude-sonnet-5",
        max_tokens: 2000,
        system: systemBlocks,
        messages: anthropicMessages,
        tools: tools && tools.length > 0 ? tools.map(t => ({
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters
        })) : undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return json(
        { error: err.error?.message || "Anthropic API Error" },
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
  } catch (e) {
    console.error("Anthropic Proxy Error:", e);
    return json({ error: (e instanceof Error ? e.message : null) || "Internal Server Error" }, { status: 500 });
  }
};
