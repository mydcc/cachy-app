/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

import { settingsState } from "./settings.svelte";
import { cloudService, type CloudStatus } from "../services/cloudService";

/**
 * Global Chat, backed by SpacetimeDB.
 *
 * This store used to poll `/api/chat-v2`, which wrote messages to a JSON file on
 * the Cachy server. That backend is gone: the project runs one Global Chat, on
 * SpacetimeDB (roadmap item 12). The window and the panel are unchanged — only
 * what stands behind them is different.
 *
 * The shape below is deliberately the same one the UI already consumed, so
 * `SidePanel`, `ChatPanel`, `AssistantView` and the chat window did not have to
 * change with it.
 */
export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  /** "me" for the local user, otherwise the sender's short ID. */
  senderId?: string;
  sender?: "user" | "system";
  /** The sender's short ID, unmapped. */
  clientId?: string;
}

/** Matches the module's `send_message` guard, so we reject before the round trip. */
const MAX_MESSAGE_LENGTH = 1000;

/** Client-side rate limit, unchanged from the previous backend. */
const SEND_INTERVAL_MS = 2000;

class ChatManager {
  messages = $state<ChatMessage[]>([]);
  lastSentTimestamp = $state(0);
  loading = $state(false);
  /**
   * The local user's short sender ID once connected, so the UI can mark its own
   * messages. Empty while disconnected. Named `clientId` because that is what
   * the components already read.
   */
  clientId = $state("");
  connected = $state(false);
  lastError = $state<string | null>(null);

  private effectCleanup: (() => void) | null = null;

  constructor() {
    if (browser) {
      cloudService.subscribeStatus((status) => this.applyStatus(status));
      cloudService.subscribeMessages((rows) => this.applyRows(rows));

      // Connect when Global Chat is enabled and configured, and stay out of the
      // way otherwise. ADR-0001 keeps this off by default; nothing here may
      // connect on its own.
      this.effectCleanup = $effect.root(() => {
        $effect(() => {
          const enabled = settingsState.cloudEnabled;
          const token = settingsState.cloudToken;

          if (!enabled || !token) return;
          if (cloudService.isConnected()) return;

          void cloudService
            .connect(settingsState.cloudHost, settingsState.cloudDbName, token)
            .catch((e: unknown) => {
              // connect() already records build failures; this catches the
              // argument-validation rejections it still throws.
              this.lastError = e instanceof Error ? e.message : String(e);
            });
        });
      });
    }
  }

  public destroy() {
    if (this.effectCleanup) {
      this.effectCleanup();
      this.effectCleanup = null;
    }
  }

  private applyStatus(status: CloudStatus) {
    this.connected = status.connected;
    this.lastError = status.lastError;
    this.clientId = status.mySenderId ?? "";
    // Re-map existing rows: which messages count as "mine" depends on the
    // identity, which is only known once connected.
    this.messages = this.messages.map((m) => ({
      ...m,
      senderId: m.clientId === this.clientId ? "me" : m.clientId,
    }));
  }

  /**
   * The module declares the column as `sent_at`; the generated client bindings
   * expose it camelCased as `sentAt`. This side speaks the bindings' spelling.
   */
  private applyRows(rows: { sender: string; text: string; sentAt: number }[]) {
    this.messages = rows
      .map((row) => this.toMessage(row))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private toMessage(row: {
    sender: string;
    text: string;
    sentAt: number;
  }): ChatMessage {
    return {
      // The module's table has no primary key, so the key is composed. A sender
      // cannot produce two rows in the same millisecond — the send path is rate
      // limited to one message per 2s.
      id: `${row.sender}:${row.sentAt}`,
      text: row.text,
      timestamp: row.sentAt,
      sender: "user",
      clientId: row.sender,
      senderId: row.sender === this.clientId ? "me" : row.sender,
    };
  }

  async sendMessage(text: string) {
    const now = Date.now();

    if (now - this.lastSentTimestamp < SEND_INTERVAL_MS) {
      throw new Error("Please wait 2 seconds between messages.");
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH}).`);
    }
    if (!this.connected) {
      throw new Error(
        "Global Chat is not connected. Enable it and enter a token in Settings → Cloud.",
      );
    }

    // Only the message text leaves the device. Nothing derived from the journal,
    // the settings or any key travels with it — ADR-0001, Class B condition 3.
    cloudService.sendMessage(text);
    this.lastSentTimestamp = now;
  }

  clearHistory() {
    // Local view only. Server-side history is governed by the retention policy
    // in docs/GLOBAL-CHAT.md; to erase your own messages there, use the module's
    // delete_my_messages reducer.
    this.messages = [];
  }
}

export const chatState = new ChatManager();

// HMR: Cleanup on module disposal to prevent memory leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    chatState.destroy();
  });
}
