/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { settingsState } from "../stores/settings.svelte";

export const xService = {
    /**
     * Generates a list of RSS URLs based on the current X monitors configuration.
     * Uses the configured Nitter instance to create bridge URLs.
     */
    getXFeedUrls(): string[] {
        const { xMonitors, nitterInstance } = settingsState;

        // Ensure nitter instance doesn't have a trailing slash for consistent formatting
        const baseUrl = nitterInstance.replace(/\/$/, "");

        return xMonitors.map((monitor) => {
            const value = monitor.value.trim();
            if (!value) return "";

            if (monitor.type === "user") {
                // Remove @ if present
                const username = value.replace(/^@/, "");
                return `${baseUrl}/${username}/rss`;
            } else if (monitor.type === "hashtag") {
                // Remove # if present
                const tag = value.replace(/^#/, "");
                // Nitter search RSS format: /search/rss?q=%23hashtag
                return `${baseUrl}/search/rss?q=%23${tag}`;
            }
            return "";
        }).filter(url => url.length > 0);
    }
};
