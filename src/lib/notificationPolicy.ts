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
    | "order-cancelled"
    /** An armed alert rule's conditions held and it announced itself — FEAT-0440. */
    | "alert-fired";

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
    "order-filled",
    "order-rejected",
    "order-cancelled",
    "alert-fired",
] as const;

/**
 * Where an announcement can go.
 *
 * `in-app` is the toast that already exists. `browser` is the OS notification,
 * which needs permission and degrades to nothing when refused. `sound` is the
 * audible channel — FEAT-0392 — which needs no permission but does need a prior
 * user gesture before a browser will let it make noise. All three degrade to
 * nothing rather than throwing; see `notificationService`.
 *
 * `email`, `discord` and `telegram` are the external channels — FEAT-0397. They
 * are the one path by which Class A content leaves the device, which is why they
 * are here in the same matrix rather than beside it: the policy of which event
 * announces itself where is one thing, and a second mechanism next to it is how
 * that stops being true. What they add is a precondition — a channel the trader
 * has not configured cannot be switched on — and a delivery result that arrives
 * after `notify()` has returned, because a `fetch` cannot be awaited on the hot
 * path. See `services/externalDelivery.ts` and ADR-0018.
 */
export type NotificationChannel =
    | "in-app"
    | "browser"
    | "sound"
    | "email"
    | "discord"
    | "telegram";

export const NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
    "in-app",
    "browser",
    "sound",
    "email",
    "discord",
    "telegram",
] as const;

/**
 * The channels that reach off this device.
 *
 * Kept as its own list so that code which must treat local and external
 * delivery differently — the sync return of `notify()`, the settings UI's
 * "configure this first" gate — asks a question instead of hard-coding three
 * names it will forget to update.
 */
export const EXTERNAL_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = [
    "email",
    "discord",
    "telegram",
] as const;

export function isExternalChannel(channel: NotificationChannel): boolean {
    return (EXTERNAL_NOTIFICATION_CHANNELS as readonly string[]).includes(channel);
}

export type NotificationPolicy = Record<
    NotificationCategory,
    Record<NotificationChannel, boolean>
>;

/**
 * In-app on, everything else off.
 *
 * The asymmetry is the point. A toast costs a glance; an OS notification
 * interrupts, and asking for notification permission unprompted on first run is
 * the behaviour that trains people to refuse it. The browser channel is
 * something the user turns on when they want to be told while the tab is in the
 * background — which is exactly the situation the item describes, and exactly
 * when they will grant permission willingly.
 *
 * Sound is off by default for the same reason and one more: a page that makes
 * noise on its own on first visit is the behaviour that gets a tab muted at the
 * OS level, and a muted tab takes the alarm with it.
 *
 * The external channels are off because they cannot be anything else: none of
 * them has credentials until the trader enters some.
 */
const LOCAL_OFF: Record<NotificationChannel, boolean> = {
    "in-app": false,
    browser: false,
    sound: false,
    email: false,
    discord: false,
    telegram: false,
};

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
    "order-filled": { ...LOCAL_OFF, "in-app": true },
    "order-rejected": { ...LOCAL_OFF, "in-app": true },
    "order-cancelled": { ...LOCAL_OFF },
    /*
     * In-app on, browser off — the same shape every other category has.
     *
     * On in-app because an alarm the trader armed by hand is the one
     * announcement they asked for explicitly, and defaulting it off would
     * produce the failure this subsystem exists to prevent: a rule that looks
     * armed and is heard by nobody.
     *
     * Off on browser because `leaves every browser channel off until asked`
     * pins that invariant across all categories, and it is right: the channel
     * needs OS permission, and shipping it on makes the *settings* screen read
     * as though a channel is live when it silently is not. The same holds for
     * sound, which needs a user gesture, and for the external channels, which
     * need credentials.
     */
    "alert-fired": { ...LOCAL_OFF, "in-app": true },
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

/**
 * The identity of one alert announcement, for suppression — FEAT-0440.
 *
 * Keyed on the rule *and the candle it fired on*, not on the rule alone. The
 * duplicate window is 60s, which is exactly one 1m candle: a rule set to
 * `every_time` on a 1m trigger would have every second announcement swallowed
 * by infrastructure the trader never configured, which is the "silently muted
 * alarm" failure in a new costume. Two deliveries of the *same* candle are
 * still one event and still suppressed, which is what the window is for.
 */
export function alertNotificationKey(ruleId: string, anchorMs: number): string {
    return `${ruleId}@${anchorMs}`;
}
