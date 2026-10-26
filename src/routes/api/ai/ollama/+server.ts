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
import { readAiRequest } from "../../../../lib/server/aiRequestGuard";
import {
  aiUpstreamFailure,
  logAiProxyError,
} from "../../../../lib/server/aiProxyError";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  let baseUrl: string | null = null;
  let apiKey: string | null = null;

  try {
    const guarded = await readAiRequest(request);
    if (!guarded.ok) return guarded.response;

    const { messages, model, baseUrl: rawBaseUrl } = guarded.data;
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
    apiKey = request.headers.get("x-api-key");
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
      return aiUpstreamFailure(response, "Ollama upstream", [apiKey]);
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    logAiProxyError("Ollama", e, [apiKey]);
    // The setup hint stays — it is the remedy for the common case — but the
    // exception text is no longer part of the response (BUG-0724).
    const target = baseUrl ?? "the configured endpoint";
    return json(
      {
        error: `Could not reach Ollama at ${target}. Is it running and is the base URL correct?`,
      },
      { status: 502 },
    );
  }
};
