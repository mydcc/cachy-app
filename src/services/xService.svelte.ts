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
     * Now sends raw monitor commands to the backend.
     * No URLs anymore. Backend handles everything.
     */
    getXMonitorCommands(): { type: string, value: string }[] {
        const { xMonitors } = settingsState;

        return xMonitors.map((monitor) => {
            const value = monitor.value.trim();
            if (!value) return null;
            return {
                type: monitor.type, // 'user' or 'hashtag'
                value: value.replace(/^[@#]/, "")
            };
        }).filter(cmd => cmd !== null) as { type: string, value: string }[];
    }
};
