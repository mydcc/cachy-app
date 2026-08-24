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
import { isUrlAllowed, isUrlAllowedAsync, safeFetch } from "../../../../lib/server/urlValidator";
import {
  MISSING_BASE_URL_ERROR,
  resolveBaseUrl,
  usesConfiguredDefault,
} from "../../../../lib/server/ollamaBaseUrl";
import { AiRequestSchema } from "../../../../types/ai";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let baseUrl: string | null = null;

  try {
    const rawBody = await request.json();
    const parseResult = AiRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return json(
        { error: "Invalid request body", details: parseResult.error.format() },
        { status: 400 },
      );
    }

    const { messages, model, baseUrl: rawBaseUrl } = parseResult.data;
    baseUrl = resolveBaseUrl(rawBaseUrl);
    if (!baseUrl) {
      // Distinguish "nothing configured" from "invalid URL supplied": the
      // former is an operator setup gap and gets the remedy in the message
      // (BUG-0295), not a bare rejection.
      if (usesConfiguredDefault(rawBaseUrl)) {
        return json({ error: MISSING_BASE_URL_ERROR }, { status: 400 });
      }
      return json({ error: "Invalid Ollama base URL" }, { status: 400 });
    }

    if (!isUrlAllowed(baseUrl) || !(await isUrlAllowedAsync(baseUrl))) {
      return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
    }

    if (!model) {
      return json({ error: "Missing model" }, { status: 400 });
    }

    // Optional — most local Ollama installs have no auth, but a self-hosted
    // instance behind a reverse proxy may require a bearer token.
    const apiKey = request.headers.get("x-api-key");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    // Ollama's OpenAI-compatible endpoint speaks the same chat-completions
    // wire format as OpenAI/OpenRouter.
    const response = await safeFetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return json(
        { error: err.error?.message || `Ollama returned status ${response.status}` },
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
    console.error("Ollama Proxy Error:", e);
    const hint = "Is it running and is the base URL correct?";
    return json(
      {
        error:
          e instanceof Error
            ? `${e.message}. ${hint}`
            : `Could not reach Ollama at ${baseUrl}. ${hint}`,
      },
      { status: 502 },
    );
  }
};
