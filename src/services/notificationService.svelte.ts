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
 * Notification delivery — FEAT-0025.
 *
 * One announcement in, zero or more channels out. The policy decides where;
 * this decides whether it is the same announcement twice, and what to do when
 * a channel is unavailable.
 *
 * Nothing here reaches the network. The browser channel is the OS's own
 * notification, rendered locally by the user's browser — no Class A data leaves
 * the device, which is this item's fifth acceptance criterion and the reason
 * the external channel it mentions is not built here.
 */

import { DUPLICATE_WINDOW_MS, notificationKey } from "../lib/notificationPolicy";
import { notificationPolicyStore } from "../stores/notifications.svelte";
import { toastService } from "./toastService.svelte";
import { logger } from "./logger";
import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { registerOrderTransitionObserver } from "./omsService";
import { formatDynamicDecimal } from "../utils/utils";
import type { OMSOrder } from "./omsTypes";
import type { NotificationCategory } from "../lib/notificationPolicy";

/** What the caller knows about the event, already translated. */
export interface NotificationRequest {
    category: NotificationCategory;
    /** Identity of the underlying event, for duplicate suppression. */
    eventId: string;
    /** One line, shown as the toast body and the notification title. */
    message: string;
    /** Colours the toast. Rejections read as errors, fills as successes. */
    tone?: "success" | "error" | "info";
}

/**
 * Browser permission as this service sees it.
 *
 * `unsupported` is its own state rather than folded into `denied`: a browser
 * without the API cannot be asked, so the settings UI should say so instead of
 * offering a button that does nothing.
 */
export type BrowserPermission = "unsupported" | "default" | "granted" | "denied";

class NotificationService {
    /** `notificationKey` → when it was last announced. */
    private recent = new Map<string, number>();

    /**
     * Bounds `recent` so a long session cannot grow it without limit — the same
     * failure BUG-0008 fixed for the toast array, and worth not reintroducing
     * one file over.
     */
    private readonly MAX_RECENT = 200;

    public permission(): BrowserPermission {
        if (typeof Notification === "undefined") return "unsupported";
        const p = Notification.permission;
        return p === "granted" || p === "denied" ? p : "default";
    }

    /**
     * Asks the browser for permission, returning what it decided.
     *
     * Called from the settings UI when the user switches a browser channel on —
     * never on startup. An unprompted permission request is the thing that
     * trains people to refuse, and a refusal is permanent for the origin.
     */
    public async requestPermission(): Promise<BrowserPermission> {
        if (typeof Notification === "undefined") return "unsupported";
        try {
            const result = await Notification.requestPermission();
            return result === "granted" || result === "denied" ? result : "default";
        } catch {
            // Older Safari rejects rather than resolving; treat as undecided.
            return "default";
        }
    }

    /**
     * Announce an event, on whichever channels the policy wants.
     *
     * Returns the channels actually delivered on, so a test can assert the
     * absence of delivery rather than the presence of a message.
     */
    public notify(request: NotificationRequest): string[] {
        const { category, eventId, message, tone = "info" } = request;

        if (notificationPolicyStore.isSilent(category)) return [];

        const key = notificationKey(category, eventId);
        if (this.isDuplicate(key)) return [];
        this.remember(key);

        const delivered: string[] = [];

        if (notificationPolicyStore.wants(category, "in-app")) {
            if (tone === "success") toastService.success(message);
            else if (tone === "error") toastService.error(message);
            else toastService.info(message);
            delivered.push("in-app");
        }

        if (notificationPolicyStore.wants(category, "browser") && this.showBrowser(message)) {
            delivered.push("browser");
        }

        return delivered;
    }

    /**
     * The browser channel, degrading to nothing.
     *
     * Permission can be revoked at any time and the constructor throws on some
     * platforms (a page without a service worker on Android). Neither deserves
     * an error path of its own: the in-app channel has already run, and a
     * notification that cannot be shown is not a failure the trader can act on.
     */
    private showBrowser(message: string): boolean {
        if (this.permission() !== "granted") return false;
        try {
            new Notification(message);
            return true;
        } catch (e) {
            logger.warn("market", "[Notify] Browser notification refused by the platform", e);
            return false;
        }
    }

    private isDuplicate(key: string): boolean {
        const last = this.recent.get(key);
        return last !== undefined && Date.now() - last < DUPLICATE_WINDOW_MS;
    }

    private remember(key: string): void {
        this.recent.set(key, Date.now());
        if (this.recent.size <= this.MAX_RECENT) return;

        // Map preserves insertion order, so the first key is the oldest.
        const oldest = this.recent.keys().next().value;
        if (oldest !== undefined) this.recent.delete(oldest);
    }

    /** Test seam: forgets what has been announced. */
    public reset(): void {
        this.recent.clear();
    }
}

export const notificationService = new NotificationService();

/**
 * The order statuses worth announcing, and how each reads — FEAT-0025.
 *
 * Only terminal states. An order moving to `open` or `partially_filled` is
 * progress rather than news, and announcing every step is how a notification
 * channel becomes noise the trader mutes — taking the fill with it.
 */
const ANNOUNCED_STATUSES: Record<
    string,
    { category: NotificationCategory; key: string; tone: "success" | "error" | "info" }
> = {
    filled: {
        category: "order-filled",
        key: "settings.notifications.events.orderFilled",
        tone: "success",
    },
    rejected: {
        category: "order-rejected",
        key: "settings.notifications.events.orderRejected",
        tone: "error",
    },
    cancelled: {
        category: "order-cancelled",
        key: "settings.notifications.events.orderCancelled",
        tone: "info",
    },
};

/**
 * Wires order transitions to notifications. Called once at startup.
 *
 * Until this runs nothing is announced and the OMS behaves exactly as before —
 * the observer is optional by design.
 */
export function installOrderNotifications(): void {
    registerOrderTransitionObserver((order: OMSOrder) => {
        const announced = ANNOUNCED_STATUSES[order.status];
        if (!announced) return;

        /*
         * An optimistic order is Cachy's own placeholder, not the venue's
         * word. Announcing one would tell the trader a fill happened because
         * the UI guessed it would.
         */
        if (order._isOptimistic) return;

        const t = get(_) as (k: string, o?: { values?: Record<string, string> }) => string;
        notificationService.notify({
            category: announced.category,
            eventId: order.id,
            tone: announced.tone,
            message: t(announced.key, {
                values: {
                    symbol: order.symbol,
                    side: (order.side ?? "").toUpperCase(),
                    qty: order.amount ? formatDynamicDecimal(order.amount) : "",
                },
            }),
        });
    });
}

/** Test seam — removes the observer this module installed. */
export function uninstallOrderNotifications(): void {
    registerOrderTransitionObserver(null);
}
