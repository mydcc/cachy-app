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
import { journalState } from "./journal.svelte";
import { calculator } from "../lib/calculator";
import { Decimal } from "decimal.js";
import { windowManager } from "../lib/windows/WindowManager.svelte";

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  senderId?: string; // 'me' or 'other'
  sender?: "user" | "system"; // from API
  profitFactor?: number;
  clientId?: string;
}

const POLL_INTERVAL = 3000;

class ChatManager {
  messages = $state<ChatMessage[]>([]);
  lastSentTimestamp = $state(0);
  latestSeenTimestamp = $state(0);
  loading = $state(false);
  clientId = $state("");

  constructor() {
    this.clientId = this.getClientId();
    if (browser) {
      // Auto-start polling when conditions are met
      // Auto-start polling when conditions are met
      $effect.root(() => {
        $effect(() => {
          if (
            windowManager.isOpen("assistant") &&
            settingsState.sidePanelMode === "chat"
          ) {
            this.poll(); // Initial poll
            const interval = setInterval(() => this.poll(), POLL_INTERVAL);
            return () => clearInterval(interval);
          }
        });
      });
    }
  }

  private getClientId(): string {
    if (!browser) return "server";
    let id = localStorage.getItem("chat_client_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("chat_client_id", id);
    }
    return id;
  }

  private mergeMessages(
    current: ChatMessage[],
    incoming: ChatMessage[],
  ): ChatMessage[] {
    // 1. Update latest timestamp BEFORE filtering (prevents stuck polling)
    if (incoming.length > 0) {
      const maxTs = Math.max(...incoming.map((m) => m.timestamp));
      if (maxTs > this.latestSeenTimestamp) {
        this.latestSeenTimestamp = maxTs;
      }
    }

    const settings = settingsState;
    const minPF = settings.minChatProfitFactor || 0;

    // 2. Apply Profit Factor Filter
    // Allow own messages, system messages, or messages meeting the PF requirement
    const filteredIncoming = incoming.filter((m) => {
      // Exclude messages from filtering if they are:
      // - From system
      // - From me (by senderId 'me' or matching clientId)
      // - System messages often have undefined profitFactor, so we should check sender type explicitly
      const isSystem = m.sender === "system";
      const isMe = m.senderId === "me" || m.clientId === this.clientId;

      if (isSystem || isMe) return true;

      // Otherwise, enforce PF
      return (m.profitFactor ?? 0) >= minPF;
    });

    const existingIds = new Set(current.map((m) => m.id));
    const uniqueIncoming = filteredIncoming.filter(
      (m) => !existingIds.has(m.id),
    );

    if (uniqueIncoming.length === 0) return current;

    let merged = [...current, ...uniqueIncoming];
    merged.sort((a, b) => a.timestamp - b.timestamp);

    // Frontend Limit (display last 500 max)
    if (merged.length > 500) {
      merged = merged.slice(-500);
    }
    return merged;
  }

  private async poll() {
    // Use tracked timestamp to ensure we advance even if messages are filtered out
    const since = this.latestSeenTimestamp;

    try {
      const res = await fetch(`/api/chat-v2?since=${since}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages && data.messages.length > 0) {
          this.messages = this.mergeMessages(this.messages, data.messages);
        }
      }
    } catch (e) {
      // Silent failure on poll
      if (import.meta.env.DEV) {
        console.warn("[Chat] Poll failed:", e);
      }
    }
  }

  async sendMessage(text: string) {
    const now = Date.now();

    // Rate Limit Check (2 seconds)
    if (now - this.lastSentTimestamp < 2000) {
      throw new Error("Please wait 2 seconds between messages.");
    }

    // Calculate own PF
    const stats = calculator.calculateJournalStats(journalState.entries);
    const pf =
      stats.profitFactor && new Decimal(stats.profitFactor).isFinite()
        ? new Decimal(stats.profitFactor).toNumber()
        : 0;

    // Send to API
    try {
      const res = await fetch("/api/chat-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          profitFactor: pf,
          clientId: this.clientId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to send");
      }

      const data = await res.json();

      // Optimistic update
      this.messages = this.mergeMessages(this.messages, [data.message]);
      this.lastSentTimestamp = now;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  clearHistory() {
    // Only clears local view, server history remains
    this.messages = [];
  }
}

export const chatState = new ChatManager();
