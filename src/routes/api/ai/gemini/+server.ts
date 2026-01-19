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

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { messages, model } = await request.json();
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
      return json({ error: "Missing API Key" }, { status: 401 });
    }

    let systemInstruction = undefined;
    const contents = [];

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

    // Use the model provided by the client directly.
    // This allows selecting any available Gemini model in settings.
    let selectedModel = model || "gemini-2.5-flash"; // Default: Current stable generation

    // Use streamGenerateContent?alt=sse for Server-Sent Events
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

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

    const payload: any = { contents };
    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CachyApp/1.0 (SvelteKit)",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      // Log 429 as warning to avoid console spam, others as error
      if (response.status === 429) {
        console.warn(`Gemini API Warning (${response.status}):`, errText);
      } else {
        console.error(`Gemini API Error (${response.status}):`, errText);
      }

      let errMsg = "Gemini API Error";
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error?.message || errMsg;
      } catch (e) {
        errMsg = errText.slice(0, 200); // Fallback to text if not JSON
      }
      return json({ error: errMsg }, { status: response.status });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("Gemini Proxy Error:", e);
    return json({ error: e.message }, { status: 500 });
  }
};
