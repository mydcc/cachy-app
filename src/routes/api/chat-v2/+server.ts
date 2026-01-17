import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { promises as fs } from "fs";
import path from "path";

const DB_FILE = "db/chat_messages.json";
const MAX_HISTORY = 1000;

interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "system";
  timestamp: number;
  profitFactor?: number;
}

// Helper to ensure DB exists and read it
async function getMessages(): Promise<ChatMessage[]> {
  try {
    // Try to read the file
    // In a real server environment, ensure 'db' folder exists
    const data = await fs.readFile(DB_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File doesn't exist, create it with welcome message
      const initial: ChatMessage[] = [
        {
          id: "system-welcome",
          text: "Welcome to the global chat!",
          sender: "system",
          timestamp: Date.now(),
        },
      ];
      // Ensure directory exists
      await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
      await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2));
      return initial;
    }
    console.error("Error reading chat db:", error);
    return [];
  }
}

async function saveMessages(messages: ChatMessage[]) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.error("Error writing chat db:", error);
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const since = url.searchParams.get("since");
  const messages = await getMessages();
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
  try {
    const { text, sender, profitFactor } = await request.json();

    if (!text || typeof text !== "string") {
      return json({ error: "Message text is required" }, { status: 400 });
    }

    const newMessage: ChatMessage = {
      id: crypto.randomUUID(),
      text: text.slice(0, 500), // Limit length per message
      sender: sender || "user",
      timestamp: Date.now(),
      profitFactor: typeof profitFactor === "number" ? profitFactor : undefined,
    };

    const messages = await getMessages();
    messages.push(newMessage);

    // Trim history
    if (messages.length > MAX_HISTORY) {
      messages.splice(0, messages.length - MAX_HISTORY);
    }

    await saveMessages(messages);

    return json({
      success: true,
      message: newMessage,
    });
  } catch (e) {
    console.error("Chat API Error:", e);
    return json({ error: "Internal Server Error" }, { status: 500 });
  }
};
