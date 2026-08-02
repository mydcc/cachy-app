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

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
}

// OpenRouter's model catalog is a public marketplace listing — no API key
// required to read it, unlike the actual chat completions.
export const GET: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return json(
        { error: err.error?.message || "OpenRouter API Error" },
        { status: response.status },
      );
    }

    const data = await response.json();
    const models: AiModelInfo[] = ((data.data as OpenRouterModel[]) || [])
      .map((m) => ({
        id: m.id,
        label: m.name || m.id,
        contextWindow: m.context_length,
        // OpenRouter prices are USD per token; convert to the more readable
        // "per 1M tokens" convention used across the model catalog UI.
        inputPrice: m.pricing?.prompt ? Number(m.pricing.prompt) * 1_000_000 : undefined,
        outputPrice: m.pricing?.completion
          ? Number(m.pricing.completion) * 1_000_000
          : undefined,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return json({ models });
  } catch (e) {
    console.error("OpenRouter Models Proxy Error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
};
