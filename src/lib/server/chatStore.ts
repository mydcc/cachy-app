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

import { promises as fs } from "fs";
import path from "path";

const DB_FILE = "db/chat_messages.json";
const MAX_HISTORY = 1000;
const SAVE_DEBOUNCE_MS = 1000;

export interface ChatMessage {
  id: string;
  text: string;
  sender: "user" | "system";
  timestamp: number;
  profitFactor?: number;
  clientId?: string;
}

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
        this.messages = JSON.parse(data);
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

    this.messages.push(message);

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
