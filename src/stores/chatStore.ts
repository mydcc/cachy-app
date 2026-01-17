import { writable, get } from "svelte/store";
import { browser } from "$app/environment";
import { settingsStore } from "./settingsStore";
import { journalStore } from "./journalStore";
import { calculator } from "../lib/calculator";

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  senderId?: string; // 'me' or 'other'
  sender?: "user" | "system"; // from API
  profitFactor?: number;
  clientId?: string;
}

export interface ChatState {
  messages: ChatMessage[];
  lastSentTimestamp: number;
  loading: boolean;
  clientId: string;
}

// Global Chat doesn't use LocalStorage anymore, it syncs with Server
const POLL_INTERVAL = 3000;

const getClientId = (): string => {
  if (!browser) return "server";
  let id = localStorage.getItem("chat_client_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chat_client_id", id);
  }
  return id;
};

const initialState: ChatState = {
  messages: [],
  loading: false,
  clientId: getClientId(),
  lastSentTimestamp: 0,
};

function createChatStore() {
  const { subscribe, set, update } = writable<ChatState>(initialState);

  let pollIntervalId: any;

  const mergeMessages = (
    current: ChatMessage[],
    incoming: ChatMessage[],
  ): ChatMessage[] => {
    const settings = get(settingsStore);
    const minPF = settings.minChatProfitFactor || 0;

    const existingIds = new Set(current.map((m) => m.id));
    const uniqueIncoming = incoming.filter((m) => !existingIds.has(m.id));

    let merged = [...current, ...uniqueIncoming];
    merged.sort((a, b) => a.timestamp - b.timestamp);

    // Frontend Limit (display last 500 max)
    if (merged.length > 500) {
      merged = merged.slice(-500);
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
      const now = Date.now();

      // Rate Limit Check (2 seconds)
      if (now - state.lastSentTimestamp < 2000) {
        throw new Error("Please wait 2 seconds between messages.");
      }

      // Calculate own PF
      const stats = calculator.calculateJournalStats(get(journalStore));
      const myPF = stats.profitFactor.isFinite()
        ? stats.profitFactor.toNumber()
        : 0;

      // Send to API
      try {
        const res = await fetch("/api/chat-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            profitFactor: myPF,
            clientId: get(chatStore).clientId,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to send");
        }

        const data = await res.json();

        update((s) => {
          // Optimistic update or wait for poll? 
          // Let's add it immediately for better UX
          const merged = mergeMessages(s.messages, [data.message]);
          const newState = { ...s, messages: merged, lastSentTimestamp: now };
          return newState;
        });
      } catch (e) {
        console.error(e);
        throw e;
      }
    },

    clearHistory: () => {
      // Only clears local view, server history remains
      set({ ...initialState });
    },
  };
}

export const chatStore = createChatStore();
