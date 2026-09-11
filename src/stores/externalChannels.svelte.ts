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
 *
 *
 * External channel configuration — FEAT-0397.
 *
 * Class A: credentials for the trader's own Mailgun account, Discord webhook and
 * Telegram bot. They live in `localStorage` and are sent to exactly one place
 * each — the service they belong to — and to nothing of Cachy's (ADR-0001,
 * ADR-0018).
 *
 * They are **not** encrypted, and nothing here claims they are. Encrypting them
 * under a key the app also stores is obfuscation: any script with same-origin
 * access reads both halves. The honest alternative — a passphrase the trader
 * types — would mean alarms cannot fire while the app is locked, which is the
 * one thing an alarm may not do. The settings UI states the trade-off instead of
 * hiding it behind the word "encrypted".
 */

import { browser } from "$app/environment";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import {
    DEFAULT_EXTERNAL_CHANNELS,
    isChannelActive,
    normalizeExternalChannels,
    validateChannel,
    type ConfigProblem,
    type DiscordChannelConfig,
    type EmailChannelConfig,
    type ExternalChannelId,
    type ExternalChannelsConfig,
    type TelegramChannelConfig,
    type TelegramChat,
} from "../lib/notifications/externalChannels";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

/*
 * Permissive, for the same reason the notification policy's schema is: a blob
 * written by an older version must not be discarded wholesale because a field
 * was added since. `normalizeExternalChannels` decides what each key means.
 */
const StoredSchema = z.object({
    email: z.record(z.string(), z.unknown()).optional(),
    discord: z.record(z.string(), z.unknown()).optional(),
    telegram: z.record(z.string(), z.unknown()).optional(),
});

class ExternalChannelsStore {
    private _config = $state<ExternalChannelsConfig>(
        structuredClone(DEFAULT_EXTERNAL_CHANNELS),
    );
    private _persistFailed = $state(false);

    constructor() {
        if (browser) this.load();
    }

    /** Treat as read-only; use the `set*` methods. */
    public get config(): ExternalChannelsConfig {
        return this._config;
    }

    public get persistFailed(): boolean {
        return this._persistFailed;
    }

    /** Configured well enough to send, and switched on. */
    public isActive(channel: ExternalChannelId): boolean {
        return isChannelActive(this._config, channel);
    }

    /** What is wrong with this channel's fields, or `null` when nothing is. */
    public problem(channel: ExternalChannelId): ConfigProblem | null {
        return validateChannel(this._config, channel);
    }

    /** Any channel that could carry an announcement right now. */
    public activeChannels(): ExternalChannelId[] {
        return (["email", "discord", "telegram"] as const).filter((c) => this.isActive(c));
    }

    public setEmail(patch: Partial<EmailChannelConfig & { enabled: boolean }>): void {
        this._config = { ...this._config, email: { ...this._config.email, ...patch } };
        this.persist();
    }

    public setDiscord(patch: Partial<DiscordChannelConfig & { enabled: boolean }>): void {
        this._config = { ...this._config, discord: { ...this._config.discord, ...patch } };
        this.persist();
    }

    public setTelegram(patch: Partial<TelegramChannelConfig & { enabled: boolean }>): void {
        this._config = { ...this._config, telegram: { ...this._config.telegram, ...patch } };
        this.persist();
    }

    /**
     * Replaces the cached chat list.
     *
     * Only on a successful lookup: a failed one must not wipe a list the trader
     * is currently choosing from, because Telegram drops an update once it has
     * been read and the second lookup legitimately returns nothing.
     */
    public setTelegramChats(chats: TelegramChat[]): void {
        this._config = {
            ...this._config,
            telegram: { ...this._config.telegram, knownChats: chats },
        };
        this.persist();
    }

    /**
     * Clears one channel's credentials.
     *
     * Separate from `reset()` because this is the action a trader takes when a
     * token leaks: they need to remove *that* token without losing the two
     * channels they still rely on.
     */
    public clear(channel: ExternalChannelId): void {
        this._config = {
            ...this._config,
            [channel]: structuredClone(DEFAULT_EXTERNAL_CHANNELS[channel]),
        };
        this.persist();
    }

    public reset(): void {
        this._config = structuredClone(DEFAULT_EXTERNAL_CHANNELS);
        this.persist();
    }

    private persist(): void {
        if (!browser) return;
        try {
            const ok = StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_EXTERNAL_CHANNELS_KEY,
                JSON.stringify(this._config),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_EXTERNAL_CHANNELS_KEY);
            if (!stored) return;
            const parsed = StoredSchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            this._config = normalizeExternalChannels(parsed.data);
        } catch {
            /*
             * Defaults stand, which means every external channel is off. Failing
             * quiet here is failing safe: the cost is a configuration the trader
             * has to re-enter, and the alternative — guessing at a half-read
             * credential — would send an alert to the wrong place.
             */
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reload(): void {
        this._config = structuredClone(DEFAULT_EXTERNAL_CHANNELS);
        if (browser) this.load();
    }
}

export const externalChannelsStore = new ExternalChannelsStore();
