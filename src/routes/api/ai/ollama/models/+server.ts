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
import { isUrlAllowed, isUrlAllowedAsync, safeFetch } from "../../../../../lib/server/urlValidator";
import {
  MISSING_BASE_URL_ERROR,
  resolveBaseUrl,
} from "../../../../../lib/server/ollamaBaseUrl";
import type { AiModelInfo } from "../../../../../types/ai";

interface OllamaModel {
  name: string;
  size?: number;
}

export const GET: RequestHandler = async ({ request, url, getClientAddress }) => {
  const authError = checkClientToken(request, getClientAddress());
  if (authError) return authError;

  const rawBaseUrl = url.searchParams.get("baseUrl");
  const baseUrl = resolveBaseUrl(rawBaseUrl);
  if (!baseUrl) {
    if (!rawBaseUrl?.trim()) {
      // No baseUrl and no operator default (BUG-0295): explain the remedy
      // instead of a bare rejection.
      return json({ error: MISSING_BASE_URL_ERROR }, { status: 400 });
    }
    return json({ error: "Invalid Ollama base URL" }, { status: 400 });
  }

  if (!isUrlAllowed(baseUrl) || !(await isUrlAllowedAsync(baseUrl))) {
    return json({ error: "Invalid or prohibited base URL" }, { status: 403 });
  }

  try {
    const response = await safeFetch(`${baseUrl}/api/tags`);

    if (!response.ok) {
      return json(
        { error: `Ollama returned status ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    const models: AiModelInfo[] = ((data.models as OllamaModel[]) || []).map((m) => ({
      id: m.name,
      label: m.name,
    }));

    return json({ models });
  } catch (e) {
    console.error("Ollama Models Proxy Error:", e);
    const hint = "Is it running and is the base URL correct?";
    return json(
      {
        error: `Could not reach Ollama at ${baseUrl}. ${hint}`,
      },
      { status: 502 },
    );
  }
};
