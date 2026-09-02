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
 * Notification policy store — FEAT-0025.
 *
 * Which categories announce themselves, and on which channels. Class A: a
 * preference about this device, stored in `localStorage` and sent nowhere
 * (ADR-0001).
 *
 * The catalogue and defaults live in `lib/notificationPolicy.ts`; delivery is
 * `services/notificationService.svelte.ts`.
 */

import { browser } from "$app/environment";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import {
    DEFAULT_NOTIFICATION_POLICY,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CHANNELS,
    normalizeNotificationPolicy,
    type NotificationCategory,
    type NotificationChannel,
    type NotificationPolicy,
} from "../lib/notificationPolicy";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

/*
 * Permissive for the same reason the confirmation policy's schema is: a
 * stricter shape naming every category would reject the whole blob when a
 * later version adds one, discarding every choice made to date.
 * `normalizeNotificationPolicy` decides what each key means.
 */
const StoredPolicySchema = z.object({
    policy: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

class NotificationPolicyStore {
    private _policy = $state<NotificationPolicy>(structuredClone(DEFAULT_NOTIFICATION_POLICY));
    private _persistFailed = $state(false);

    constructor() {
        if (browser) this.load();
    }

    /** The current policy. Treat as read-only; use `setChannel` to change it. */
    public get policy(): NotificationPolicy {
        return this._policy;
    }

    /**
     * True when the last write to localStorage failed — a full quota, or a
     * browser with storage disabled. Surfaced so the settings UI can say the
     * choice will not survive a reload rather than pretending it saved.
     */
    public get persistFailed(): boolean {
        return this._persistFailed;
    }

    /** Whether this category announces itself on this channel. */
    public wants(category: NotificationCategory, channel: NotificationChannel): boolean {
        return this._policy[category]?.[channel] === true;
    }

    /** Whether this category announces itself anywhere at all. */
    public isSilent(category: NotificationCategory): boolean {
        return !NOTIFICATION_CHANNELS.some((channel) => this.wants(category, channel));
    }

    /** Immutable update — new objects all the way down, never a mutation. */
    public setChannel(
        category: NotificationCategory,
        channel: NotificationChannel,
        enabled: boolean,
    ): void {
        this._policy = {
            ...this._policy,
            [category]: { ...this._policy[category], [channel]: enabled },
        };
        this.persist();
    }

    /** Restores the defaults. */
    public reset(): void {
        this._policy = structuredClone(DEFAULT_NOTIFICATION_POLICY);
        this.persist();
    }

    private persist(): void {
        if (!browser) return;
        try {
            const ok = StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_NOTIFICATION_POLICY_KEY,
                JSON.stringify({ policy: this._policy }),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_NOTIFICATION_POLICY_KEY);
            if (!stored) return;
            const parsed = StoredPolicySchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            this._policy = normalizeNotificationPolicy(parsed.data.policy);
        } catch {
            /*
             * A corrupt blob leaves the defaults in place. Unlike the
             * confirmation policy, failing "safe" here means failing quiet:
             * the worst case is a toast the user had switched off, not a
             * missing safeguard.
             */
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reload(): void {
        this._policy = structuredClone(DEFAULT_NOTIFICATION_POLICY);
        if (browser) this.load();
    }
}

export const notificationPolicyStore = new NotificationPolicyStore();

export { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS };
export type { NotificationCategory, NotificationChannel, NotificationPolicy };
