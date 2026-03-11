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
import { chatStore, type ChatMessage } from "$lib/server/chatStore";
import { checkAppAuth } from "../../../lib/server/auth";
import { sanitizeChatInput } from "$lib/server/sanitizer";

export const GET: RequestHandler = async ({ url, request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  const since = url.searchParams.get("since");
  const messages = await chatStore.getMessages();
  let result = messages;

  if (since) {
    const sinceTs = parseInt(since);
    if (!isNaN(sinceTs)) {
      result = messages.filter((m) => m.timestamp > sinceTs);
    }
  }

  return json({
    success: true,
    messages: result,
  });
};

export const POST: RequestHandler = async ({ request }) => {
  const authError = checkAppAuth(request);
  if (authError) return authError;

  try {
    const { text, sender, profitFactor, clientId } = await request.json();

    if (!text || typeof text !== "string") {
      return json({ error: "Message text is required" }, { status: 400 });
    }

    // Sanitize input to prevent Stored XSS
    const sanitizedText = sanitizeChatInput(text);

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: sanitizedText.slice(0, 500), // Limit length per message
      sender: sender || "user",
      timestamp: Date.now(),
      profitFactor: typeof profitFactor === "number" ? profitFactor : undefined,
      clientId: clientId || undefined,
    };

    await chatStore.addMessage(newMessage);

    return json({
      success: true,
      message: newMessage,
    });
  } catch (e) {
    console.error("Chat API Error:", e);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
};
