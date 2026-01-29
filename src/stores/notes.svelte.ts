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
import { untrack } from "svelte";

export interface NoteMessage {
  id: string;
  text: string;
  timestamp: number;
}

const LOCAL_STORAGE_KEY = "cachy_notes_history";

class NotesManager {
  messages = $state<NoteMessage[]>([]);

  constructor() {
    if (browser) {
      this.load();
    }
  }

  private load() {
    try {
      let stored = localStorage.getItem(LOCAL_STORAGE_KEY);

      // MIGRATION: If empty, try to load from OLD chat key (one-time migration)
      if (!stored) {
        const oldChat = localStorage.getItem("cachy_chat_history");
        if (oldChat) {
          stored = oldChat;
        }
      }

      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.messages) {
          this.messages = parsed.messages;
        } else if (Array.isArray(parsed)) {
          // Handle potentially plain array if that ever existed
          this.messages = [];
        }
      }
    } catch (e) {
      console.error("Failed to load notes history", e);
    }
  }

  private save() {
    if (!browser) return;
    try {
      localStorage.setItem(
        LOCAL_STORAGE_KEY,
        JSON.stringify({ messages: this.messages }),
      );
    } catch (e) {
      console.error("Failed to save notes history", e);
    }
  }

  addNote(text: string) {
    const limit = settingsState.maxPrivateNotes || 50;

    const newNote: NoteMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      text,
      timestamp: Date.now(),
    };

    let newMessages = [...this.messages, newNote];

    // Trim to limit
    if (newMessages.length > limit) {
      newMessages = newMessages.slice(newMessages.length - limit);
    }

    this.messages = newMessages;
    this.save();
  }

  clearNotes() {
    this.messages = [];
    this.save();
  }

  private notifyTimer: any = null;

  // Compatibility for easier migration if needed, though direct property access is preferred
  subscribe(fn: (value: { messages: NoteMessage[] }) => void) {
    fn({ messages: this.messages });
    return $effect.root(() => {
      $effect(() => {
        const snap = { messages: this.messages }; // Track
        untrack(() => {
          if (this.notifyTimer) clearTimeout(this.notifyTimer);
          this.notifyTimer = setTimeout(() => {
            fn(snap);
            this.notifyTimer = null;
          }, 100); // UI updates for notes can be slow
        });
      });
    });
  }
}

export const notesState = new NotesManager();
