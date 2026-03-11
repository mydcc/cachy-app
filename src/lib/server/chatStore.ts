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

import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { z } from "zod";

function resolveDbFile(): string {
  const raw = process.env.CHAT_DB_PATH || "db/chat_messages.json";
  const resolved = path.resolve(raw);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error(
      `CHAT_DB_PATH must resolve to a path within the project directory. Got: ${raw}`
    );
  }
  // Defense-in-depth: if the parent directory already exists, resolve symlinks
  // to ensure the real filesystem path is also within the project directory.
  const dir = path.dirname(resolved);
  try {
    const realDir = fsSync.realpathSync(dir);
    if (!realDir.startsWith(cwd + path.sep) && realDir !== cwd) {
      throw new Error(
        `CHAT_DB_PATH parent directory resolves outside the project directory via symlink. Got: ${raw}`
      );
    }
  } catch (e: any) {
    // ENOENT means the directory doesn't exist yet — that's fine, the lexical
    // check above is sufficient since symlinks can't exist in a missing dir.
    if (e.code !== "ENOENT") throw e;
  }
  return resolved;
}

export const DB_FILE = resolveDbFile();
const MAX_HISTORY = 1000;
const SAVE_DEBOUNCE_MS = 1000;
const SHUTDOWN_TIMEOUT_MS = 5000;

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "system";
  timestamp: number;
  profitFactor?: number;
  clientId?: string;
}

const chatMessageSchema = z.object({
  id: z.string(),
  text: z.string(),
  sender: z.enum(["user", "system"]),
  timestamp: z.number(),
  profitFactor: z.number().nullish().transform(v => v ?? undefined),
  clientId: z.string().nullish().transform(v => v ?? undefined)
});

class ChatStore {
  private messages: ChatMessage[] = [];
  private loaded = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private loadingPromise: Promise<void> | null = null;

  async init() {
    if (this.loaded) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        // Try to read the file
        // In a real server environment, ensure 'db' folder exists
        const data = await fs.readFile(DB_FILE, "utf-8");
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          console.error("Failed to parse chat db:", e);
          parsed = null;
        }
        if (Array.isArray(parsed)) {
          this.messages = parsed.reduce<ChatMessage[]>((acc, item, index) => {
            const result = chatMessageSchema.safeParse(item);
            if (result.success) {
              acc.push(result.data);
            } else {
              console.warn(`Skipping invalid chat message at index ${index}:`, result.error);
            }
            return acc;
          }, []);
        } else {
          console.error("Chat data is not an array, resetting to empty");
          this.messages = [];
        }
        // Persist cleaned data back to disk if any messages were dropped
        if (!Array.isArray(parsed) || this.messages.length !== parsed.length) {
          await this.saveInternal();
        }
      } catch (error: any) {
        if (error.code === "ENOENT") {
          // File doesn't exist, create it with welcome message
          this.messages = [
            {
              id: "system-welcome",
              text: "Welcome to the global chat!",
              sender: "system",
              timestamp: Date.now(),
            },
          ];
          // Ensure directory exists and save initial state
          await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
          await this.saveInternal();
        } else {
          console.error("Error reading chat db:", error);
          this.messages = [];
        }
      } finally {
        this.loaded = true;
        this.loadingPromise = null;
      }
    })();
    return this.loadingPromise;
  }

  async getMessages(): Promise<ChatMessage[]> {
    if (!this.loaded) {
      await this.init();
    }
    return this.messages;
  }

  async addMessage(message: ChatMessage): Promise<void> {
    if (!this.loaded) {
      await this.init();
    }

    const validation = chatMessageSchema.safeParse(message);
    if (!validation.success) {
      console.error("Rejected invalid chat message:", validation.error);
      return;
    }

    this.messages.push(validation.data);

    // Trim history
    if (this.messages.length > MAX_HISTORY) {
      this.messages.splice(0, this.messages.length - MAX_HISTORY);
    }

    this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveInternal();
    }, SAVE_DEBOUNCE_MS);
  }

  private async saveInternal() {
    try {
      const tempFile = `${DB_FILE}.tmp`;
      const data = JSON.stringify(this.messages, null, 2);

      // Ensure directory exists
      await fs.mkdir(path.dirname(DB_FILE), { recursive: true });

      // Write to temp file then rename for atomic write
      await fs.writeFile(tempFile, data);
      await fs.rename(tempFile, DB_FILE);
    } catch (error) {
      console.error("Error writing chat db:", error);
    }
  }

  // For testing purposes
  async forceSave() {
    if (this.saveTimer) {
        clearTimeout(this.saveTimer);
    }
    await this.saveInternal();
  }

  // For testing purposes
  reset() {
      this.messages = [];
      this.loaded = false;
      if (this.saveTimer) clearTimeout(this.saveTimer);
  }
}

export const chatStore = new ChatStore();

// Flush pending chat messages to disk on graceful shutdown
// Skip in test environments to avoid interfering with test runner cleanup
if (!process.env.VITEST) {
  let shuttingDown = false;
  function handleShutdown(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;
    // Force-terminate if flush stalls (e.g. disk I/O hang)
    const deadline = setTimeout(() => {
      console.error("Shutdown flush timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    deadline.unref();
    chatStore.forceSave().catch((err) => {
      console.error("Failed to flush chat store on shutdown:", err);
    }).finally(() => {
      clearTimeout(deadline);
      // Re-raise the original signal so process managers see the correct exit code
      process.kill(process.pid, signal);
    });
  }

  process.once("SIGTERM", (signal) => handleShutdown(signal));
  process.once("SIGINT", (signal) => handleShutdown(signal));
}
