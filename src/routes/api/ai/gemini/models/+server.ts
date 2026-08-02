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

interface GeminiModel {
  name: string;
  displayName?: string;
  inputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

export const GET: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return json({ error: "Missing API Key" }, { status: 401 });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return json(
        { error: err.error?.message || "Gemini API Error" },
        { status: response.status },
      );
    }

    const data = await response.json();
    const models: AiModelInfo[] = ((data.models as GeminiModel[]) || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace(/^models\//, ""),
        label: m.displayName || m.name.replace(/^models\//, ""),
        contextWindow: m.inputTokenLimit,
      }));

    return json({ models });
  } catch (e) {
    console.error("Gemini Models Proxy Error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
};
