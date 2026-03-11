/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { settingsState } from "../stores/settings.svelte";
import type { NewsItem } from "./newsService";

interface DiscordMessage {
    id: string;
    content: string;
    channel_id: string;
    author: {
        username: string;
        discriminator: string;
        bot?: boolean;
    };
    timestamp: string;
    edited_timestamp: string | null;
}

// In-memory cache for Discord news to prevent redundant network requests
let cachedDiscordNews: NewsItem[] | null = null;
let lastFetchTime = 0;
let cachedToken: string | null = null;
let cachedChannels: string[] | null = null;
const CACHE_DURATION_MS = 60 * 1000; // 1 minute cache
let fetchPromise: Promise<NewsItem[]> | null = null;

export const discordService = {
    async fetchDiscordNews(): Promise<NewsItem[]> {
        const { discordBotToken, discordChannels } = settingsState;

        if (!discordBotToken || !discordChannels || discordChannels.length === 0) {
            return [];
        }

        const now = Date.now();
        // Invalidate cache if settings changed
        const settingsChanged = cachedToken !== discordBotToken ||
            JSON.stringify(cachedChannels) !== JSON.stringify(discordChannels);
        // Return cached news if within cache duration and settings haven't changed
        if (cachedDiscordNews && !settingsChanged && now - lastFetchTime < CACHE_DURATION_MS) {
            return cachedDiscordNews;
        }

        // Avoid multiple concurrent fetch requests (only if settings haven't changed)
        if (fetchPromise && !settingsChanged) {
            return fetchPromise;
        }

        const thisPromise = (async () => {
            try {
                const allNews: NewsItem[] = [];

                // Prioritize newest channels first?, or parallel fetch
                // Parallel fetch is better but we should limit concurrency if many channels
                const fetchPromises = discordChannels.map(async (channelId) => {
                    try {
                        if (!channelId.trim()) return [];

                        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=5`, {
                            headers: {
                                Authorization: `Bot ${discordBotToken}`,
                                "Content-Type": "application/json",
                            },
                        });

                        if (!res.ok) {
                            if (res.status === 401) {
                                console.warn(`[Discord] Unauthorized access to channel ${channelId}. Check Token.`);
                            } else if (res.status === 403) {
                                console.warn(`[Discord] Bot missing permissions for channel ${channelId}.`);
                            }
                            return [];
                        }

                        const messages: DiscordMessage[] = await res.json();

                        return messages.map((msg) => ({
                            title: msg.content.length > 200 ? msg.content.substring(0, 197) + "..." : msg.content,
                            url: `https://discord.com/channels/@me/${channelId}/${msg.id}`, // Link to message (works if user is in server)
                            source: `Discord | ${msg.author.username}`,
                            published_at: msg.timestamp,
                            currencies: [], // We could parse for symbols here if we wanted
                        }));

                    } catch (e) {
                        console.error(`[Discord] Failed to fetch channel ${channelId}:`, e);
                        return [];
                    }
                });

                const results = await Promise.all(fetchPromises);
                results.forEach(items => allNews.push(...items));

                cachedDiscordNews = allNews;
                lastFetchTime = Date.now();
                cachedToken = discordBotToken;
                cachedChannels = [...discordChannels];
                return allNews;
            } catch (e) {
                console.error("[Discord] Failed to fetch news:", e);
                return [];
            } finally {
                // Only clear if no newer fetch has replaced us (e.g. due to settings change)
                if (fetchPromise === thisPromise) {
                    fetchPromise = null;
                }
            }
        })();
        fetchPromise = thisPromise;

        return thisPromise;
    }
};
