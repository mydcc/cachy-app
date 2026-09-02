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
 * Notification categories and channels — FEAT-0025.
 *
 * What can be announced, and where. `stores/notifications.svelte.ts` holds the
 * user's choices and `services/notificationService.svelte.ts` delivers.
 *
 * Connection loss is deliberately absent from this catalogue. It is the one
 * case the item calls the priority, and it is already handled where it has to
 * be: `OfflineBanner.svelte` shows it in the UI itself, on
 * `marketState.connectionStatus`, regardless of any setting here. A category
 * for it would imply it can be switched off, and stale data presented as live
 * is a money bug rather than a preference.
 *
 * This module is pure: no I/O, no store reads, no Svelte runes.
 */

/** An event worth telling the trader about. */
export type NotificationCategory =
    /** An order reached the exchange and filled. */
    | "order-filled"
    /** The exchange rejected an order outright. */
    | "order-rejected"
    /** An order was cancelled — by the user, the venue, or a close. */
    | "order-cancelled";

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
    "order-filled",
    "order-rejected",
    "order-cancelled",
] as const;

/**
 * Where an announcement can go.
 *
 * `in-app` is the toast that already exists. `browser` is the OS notification,
 * which needs permission and degrades to nothing when refused — see
 * `notificationService`.
 *
 * No third channel. The item mentions "optionally an external channel the user
 * configures"; that is deliberately not built here, because an external
 * endpoint is the one path by which Class A data could leave the device, and it
 * deserves its own item and its own review rather than riding along with the
 * plumbing.
 */
export type NotificationChannel = "in-app" | "browser";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
    "in-app",
    "browser",
] as const;

export type NotificationPolicy = Record<
    NotificationCategory,
    Record<NotificationChannel, boolean>
>;

/**
 * In-app on, browser off.
 *
 * The asymmetry is the point. A toast costs a glance; an OS notification
 * interrupts, and asking for notification permission unprompted on first run is
 * the behaviour that trains people to refuse it. The browser channel is
 * something the user turns on when they want to be told while the tab is in the
 * background — which is exactly the situation the item describes, and exactly
 * when they will grant permission willingly.
 */
export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
    "order-filled": { "in-app": true, browser: false },
    "order-rejected": { "in-app": true, browser: false },
    "order-cancelled": { "in-app": false, browser: false },
};

/** Narrows an arbitrary string to a catalogue member. */
export function isNotificationCategory(value: string): value is NotificationCategory {
    return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Fills in missing or malformed entries from the defaults.
 *
 * Same reasoning as the confirmation policy's `normalizePolicy`: a stored
 * object predates any category added later, and falling back to the default
 * rather than to `false` means a newly shipped announcement arrives switched on
 * where its default says so. The user opted out of the categories that existed
 * when they chose.
 */
export function normalizeNotificationPolicy(stored: unknown): NotificationPolicy {
    const source = (stored ?? {}) as Record<string, unknown>;
    const result = {} as NotificationPolicy;

    for (const category of NOTIFICATION_CATEGORIES) {
        result[category] = { ...DEFAULT_NOTIFICATION_POLICY[category] };
        const entry = source[category] as Record<string, unknown> | undefined;

        if (entry && typeof entry === "object") {
            for (const channel of NOTIFICATION_CHANNELS) {
                const value = entry[channel];
                if (typeof value === "boolean") result[category][channel] = value;
            }
        }
    }

    return result;
}

/**
 * How long two announcements of the same thing count as one — FEAT-0025's
 * duplicate-suppression criterion.
 *
 * A venue can report the same terminal order state more than once: a REST poll
 * and a WebSocket push describing the same fill arrive as two updates carrying
 * identical content. The window is generous because the two mistakes do not
 * cost the same — a suppressed duplicate is invisible, while a duplicate shown
 * is what makes a trader stop trusting the count.
 */
export const DUPLICATE_WINDOW_MS = 60_000;

/**
 * The identity of one logical event, for suppression.
 *
 * Keyed on the order and the state it reached rather than on the message: the
 * same order filling and later being cancelled is two events, while the same
 * fill described twice is one — even if a later copy carries a rounder quantity
 * or a translated venue message.
 */
export function notificationKey(category: NotificationCategory, orderId: string): string {
    return `${category}:${orderId}`;
}
