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
import { getErrorMessage } from "../../../../utils/errorUtils";
import { checkAppAuth } from "../../../../lib/server/auth";

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  try {
    const { messages, model } = await request.json();
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: messages,
        max_tokens: 2000,
        stream: true, // Enable streaming
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return json(
        { error: err.error?.message || "OpenAI API Error" },
        { status: response.status },
      );
    }

    // Return the stream directly
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: unknown) {
    console.error("OpenAI Proxy Error:", e);
    return json({ error: getErrorMessage(e) }, { status: 500 });
  }
};
