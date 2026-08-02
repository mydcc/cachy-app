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
import { checkAppAuth } from "../../../../../lib/server/auth";
import type { AiModelInfo } from "../../../../../types/ai";

interface OllamaModel {
  name: string;
  size?: number;
}

const DEFAULT_BASE_URL = "http://localhost:11434";

// Ollama is the user's own local (or self-hosted) instance — this never
// reaches a Cachy-operated server, same trust boundary as the Bitunix/Bitget
// proxies. Only http/https is accepted to keep the target unambiguous.
function resolveBaseUrl(raw: string | null): string | null {
  const candidate = raw?.trim() || DEFAULT_BASE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return candidate.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ request, url }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  const baseUrl = resolveBaseUrl(url.searchParams.get("baseUrl"));
  if (!baseUrl) {
    return json({ error: "Invalid Ollama base URL" }, { status: 400 });
  }

  try {
    const response = await fetch(`${baseUrl}/api/tags`);

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
    return json(
      {
        error:
          "Could not reach Ollama. Is it running and is the base URL correct?",
      },
      { status: 502 },
    );
  }
};
