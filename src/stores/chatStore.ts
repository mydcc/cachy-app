import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { settingsStore } from "./settingsStore";

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  senderId?: string; // To differentiate 'me' vs 'others' if needed
}

export interface ChatState {
  messages: ChatMessage[];
  lastSentTimestamp: number;
}

const LOCAL_STORAGE_KEY = "cachy_chat_history";
const MAX_MESSAGES = 1000;
const POLL_INTERVAL = 3000; // Poll every 3 seconds

const initialState: ChatState = {
  messages: [],
  lastSentTimestamp: 0,
};

function createChatStore() {
  // Load initial state from local storage
  let initial = initialState;
  if (browser) {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        initial = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load chat history", e);
    }
  }

  const { subscribe, set, update } = writable<ChatState>(initial);

  let pollIntervalId: any;

  // Helper to persist to localStorage
  const saveToStorage = (state: ChatState) => {
    if (!browser) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to save chat history", e);
    }
  };

  // Helper to merge new messages avoiding duplicates
  const mergeMessages = (
    current: ChatMessage[],
    incoming: ChatMessage[],
  ): ChatMessage[] => {
    const existingIds = new Set(current.map((m) => m.id));
    const uniqueIncoming = incoming.filter((m) => !existingIds.has(m.id));

    let merged = [...current, ...uniqueIncoming];
    // Sort by timestamp
    merged.sort((a, b) => a.timestamp - b.timestamp);

    // Trim
    if (merged.length > MAX_MESSAGES) {
      merged = merged.slice(-MAX_MESSAGES);
    }
    return merged;
  };

  return {
    subscribe,

    init: () => {
      if (!browser) return;

      // Start polling if enabled and in chat mode
      settingsStore.subscribe((settings) => {
        if (settings.enableSidePanel && settings.sidePanelMode === "chat") {
          if (!pollIntervalId) {
            pollIntervalId = setInterval(async () => {
              const state = get({ subscribe });
              const lastMsg = state.messages[state.messages.length - 1];
              const since = lastMsg ? lastMsg.timestamp : 0;

              try {
                const res = await fetch(`/api/chat-v2?since=${since}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data.messages && data.messages.length > 0) {
                    update((s) => {
                      const newMessages = mergeMessages(
                        s.messages,
                        data.messages,
                      );
                      const newState = { ...s, messages: newMessages };
                      saveToStorage(newState);
                      return newState;
                    });
                  }
                }
              } catch (e) {
                // Silent failure on poll
              }
            }, POLL_INTERVAL);
          }
        } else {
          if (pollIntervalId) {
            clearInterval(pollIntervalId);
            pollIntervalId = null;
          }
        }
      });
    },

    sendMessage: async (text: string) => {
      const state = get({ subscribe });
      const settings = get(settingsStore);
      const now = Date.now();

      // Rate Limit Check (2 seconds)
      if (now - state.lastSentTimestamp < 2000) {
        throw new Error("Please wait 2 seconds between messages.");
      }

      const newMessage: ChatMessage = {
        id: now.toString() + Math.random().toString(36).substr(2, 9),
        text: text.slice(0, 140),
        timestamp: now,
        senderId: "me",
      };

      if (settings.sidePanelMode === "chat") {
        // Send to API
        try {
          const res = await fetch("/api/chat-v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Failed to send");
          }

          // On success, we can add it locally or wait for poll.
          const data = await res.json();

          update((s) => {
            const merged = mergeMessages(s.messages, [data.message]);
            const newState = { ...s, messages: merged, lastSentTimestamp: now };
            saveToStorage(newState);
            return newState;
          });
        } catch (e) {
          console.error(e);
          throw e;
        }
      } else {
        // Notes Mode (Local Only)
        update((s) => {
          const merged = mergeMessages(s.messages, [newMessage]);
          const newState = { ...s, messages: merged, lastSentTimestamp: now };
          saveToStorage(newState);
          return newState;
        });
      }
    },

    clearHistory: () => {
      const newState = { messages: [], lastSentTimestamp: 0 };
      set(newState);
      saveToStorage(newState);
    },
  };
}

export const chatStore = createChatStore();
