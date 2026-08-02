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

interface OpenAiModel {
  id: string;
  created?: number;
}

// OpenAI's /v1/models lists every model the account can see, including
// embeddings, TTS, Whisper, moderation and image models — none of which are
// chat models. Filter down to what actually works with /v1/chat/completions.
const CHAT_MODEL_RE = /^(gpt-|o1|o3|o4|chatgpt)/i;
const EXCLUDE_RE =
  /(embedding|whisper|tts|dall-e|moderation|davinci|babbage|ada|curie|realtime|audio|transcribe|instruct|image)/i;

export const GET: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return json({ error: "Missing API Key" }, { status: 401 });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return json(
        { error: err.error?.message || "OpenAI API Error" },
        { status: response.status },
      );
    }

    const data = await response.json();
    const models: AiModelInfo[] = ((data.data as OpenAiModel[]) || [])
      .filter((m) => CHAT_MODEL_RE.test(m.id) && !EXCLUDE_RE.test(m.id))
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({ id: m.id, label: m.id }));

    return json({ models });
  } catch (e) {
    console.error("OpenAI Models Proxy Error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
};
