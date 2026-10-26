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

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiSystemInstruction {
  parts: GeminiPart[];
}

interface GeminiPayload {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
  tools?: GeminiTool[];
}


// Define basic tool types to avoid "any"
interface GeminiFunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

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

    let systemInstruction: GeminiSystemInstruction | undefined = undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemInstruction = { parts: [{ text: msg.content }] };
      } else {
        contents.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.content }],
        });
      }
    }

    // Use the model provided by the client directly after validating format (BUG-0238).
    // Validate model identifier against strict regex to avoid path traversal / query injection.
    const rawModel = typeof model === "string" ? model.trim() : "";
    if (rawModel && !/^[a-zA-Z0-9._-]+$/.test(rawModel)) {
      return json({ error: "Invalid model identifier" }, { status: 400 });
    }

    let selectedModel = rawModel || "gemini-3.5-flash-lite"; // Default: current cost-effective generation (BUG-0707)

    // Use streamGenerateContent?alt=sse for Server-Sent Events
    const encodedModel = encodeURIComponent(selectedModel);
    const url = resolveProviderEndpoint(
      baseUrl,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:streamGenerateContent?alt=sse`,
      `v1beta/models/${encodedModel}:streamGenerateContent?alt=sse`,
    );

    if (!(await isUrlAllowedAsync(url))) {
      return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
    }

    // Special handling for Gemma models which don't support systemInstruction
    if (selectedModel.includes("gemma") && systemInstruction) {
      const sysText = systemInstruction.parts[0].text;
      // Prepend to first user message context
      if (contents.length > 0 && contents[0].role === "user") {
        contents[0].parts[0].text = `[System Instruction]\n${sysText}\n\n[User Request]\n${contents[0].parts[0].text}`;
      } else {
        contents.unshift({
          role: "user",
          parts: [{ text: `[System Instruction]\n${sysText}` }],
        });
      }
      // Disable system instruction field for payload
      systemInstruction = undefined;
    }

    const payload: GeminiPayload = { contents };
    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }
    if (tools && tools.length > 0) {
      payload.tools = [{
          functionDeclarations: tools.map((t: { function: GeminiFunctionDeclaration }) => ({
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters
          }))
      }];
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CachyApp/1.0 (SvelteKit)",
    };
    if (apiKey) {
      headers["x-goog-api-key"] = apiKey;
    }

    const response = await safeFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(
          `Gemini API Warning (${response.status}): Rate limit exceeded.`,
        );
      }
      return aiUpstreamFailure(response, "Gemini upstream", [apiKey]);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    logAiProxyError("Gemini", e, [apiKey]);
    return json({ error: AI_PROXY_ERROR_MESSAGE }, { status: 500 });
  }
};
