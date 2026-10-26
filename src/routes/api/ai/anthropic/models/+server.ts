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
import { checkClientToken } from "../../../../../lib/server/clientToken";
import type { AiModelInfo } from "../../../../../types/ai";
import { resolveProviderEndpoint } from "../../../../../lib/server/aiEndpoint";
import {
  isUrlAllowedAsync,
  safeFetch,
} from "../../../../../lib/server/urlValidator";
import {
  AI_PROXY_ERROR_MESSAGE,
  aiUpstreamFailure,
  logAiProxyError,
} from "../../../../../lib/server/aiProxyError";

interface AnthropicModel {
  id: string;
  display_name?: string;
  max_input_tokens?: number;
}

export const GET: RequestHandler = async ({ url, request, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  const apiKey = request.headers.get("x-api-key");
  const baseUrl = url.searchParams.get("baseUrl");

  if (!apiKey && !baseUrl?.trim()) {
    return json({ error: "Missing API Key" }, { status: 401 });
  }

  const targetUrl = resolveProviderEndpoint(
    baseUrl,
    "https://api.anthropic.com/v1/models?limit=100",
    "v1/models?limit=100",
  );

  if (!(await isUrlAllowedAsync(targetUrl))) {
    return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
  }

  const headers: Record<string, string> = {
    "anthropic-version": "2023-06-01",
  };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  try {
    const response = await safeFetch(targetUrl, { headers });

    if (!response.ok) {
      return aiUpstreamFailure(response, "Anthropic models upstream", [apiKey]);
    }

    const data = await response.json();
    const models: AiModelInfo[] = ((data.data as AnthropicModel[]) || []).map((m) => ({
      id: m.id,
      label: m.display_name || m.id,
      contextWindow: m.max_input_tokens,
    }));

    return json({ models });
  } catch (e) {
    logAiProxyError("Anthropic models", e, [request.headers.get("x-api-key")]);
    return json({ error: AI_PROXY_ERROR_MESSAGE }, { status: 500 });
  }
};
