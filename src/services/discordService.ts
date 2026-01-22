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

export const discordService = {
    async fetchDiscordNews(): Promise<NewsItem[]> {
        const { discordBotToken, discordChannels } = settingsState;

        if (!discordBotToken || !discordChannels || discordChannels.length === 0) {
            return [];
        }

        const allNews: NewsItem[] = [];

        // Prioritize newest channels first?, or parallel fetch
        // Parallel fetch is better but we should limit concurrency if many channels
        const fetchPromises = discordChannels.map(async (channelId) => {
            if (!channelId.trim()) return [];

            try {
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

        return allNews;
    }
};
