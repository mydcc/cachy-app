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

import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { settingsState } from "./settings.svelte";

export interface NoteMessage {
    id: string;
    text: string;
    timestamp: number;
}

export interface NotesState {
    messages: NoteMessage[];
}

const LOCAL_STORAGE_KEY = "cachy_notes_history";

const initialState: NotesState = {
    messages: [],
};

function createNotesStore() {
    let initial = initialState;
    if (browser) {
        try {
            // First try to load from new key
            let stored = localStorage.getItem(LOCAL_STORAGE_KEY);

            // MIGRATION: If empty, try to load from OLD chat key (one-time migration)
            if (!stored) {
                const oldChat = localStorage.getItem("cachy_chat_history");
                if (oldChat) {
                    // Verify if these were likely notes (local only)
                    // Since old system mixed them, we can just import them all as notes
                    // to be safe, so user doesn't lose data.
                    // Or we can start fresh.
                    // Let's migrate them to be nice.
                    stored = oldChat;
                }
            }

            if (stored) {
                initial = JSON.parse(stored);
                // Ensure format compat
                if (!initial.messages) initial = { messages: [] };
            }
        } catch (e) {
            console.error("Failed to load notes history", e);
        }
    }

    const { subscribe, set, update } = writable<NotesState>(initial);

    const saveToStorage = (state: NotesState) => {
        if (!browser) return;
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save notes history", e);
        }
    };

    return {
        subscribe,

        addNote: (text: string) => {
            const settings = settingsState;
            const limit = settings.maxPrivateNotes || 50;

            update((s) => {
                const newNote: NoteMessage = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    text,
                    timestamp: Date.now(),
                };

                let newMessages = [...s.messages, newNote];

                // Trim to limit
                if (newMessages.length > limit) {
                    newMessages = newMessages.slice(newMessages.length - limit);
                }

                const newState = { ...s, messages: newMessages };
                saveToStorage(newState);
                return newState;
            });
        },

        clearNotes: () => {
            const newState = { messages: [] };
            set(newState);
            saveToStorage(newState);
        }
    };
}

export const notesStore = createNotesStore();
