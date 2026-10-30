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
 * One announcement in, zero or more channels out. The local channels either come
 * from the request (a rule's own choice, BUG-0750) or from the policy, and the
 * policy alone decides the external ones (ADR-0018). This file also decides
 * whether it is the same announcement twice, and what to do when a channel is
 * unavailable.
 *
 * Nothing here reaches the network. The browser channel is the OS's own
 * notification, rendered locally by the user's browser, and the sound channel is
 * an oscillator — no Class A data leaves the device, which is FEAT-0025's fifth
 * acceptance criterion and the reason the external channel it mentions is not
 * built here.
 */

import { DUPLICATE_WINDOW_MS, notificationKey } from "../lib/notificationPolicy";
import { notificationPolicyStore } from "../stores/notifications.svelte";
import { toastService } from "./toastService.svelte";
import { soundChannel } from "./soundChannel.svelte";
import { TONE_FOR_CATEGORY } from "../lib/notificationTones";
import { dispatchExternal } from "./externalDelivery";
import { externalChannelsStore } from "../stores/externalChannels.svelte";
import { externalDeliveryLog } from "../stores/externalDeliveryLog.svelte";
import { EXTERNAL_NOTIFICATION_CHANNELS } from "../lib/notificationPolicy";
import type { ExternalChannelId } from "../lib/notifications/externalChannels";
import { logger } from "./logger";
import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { registerOrderTransitionObserver } from "./omsService";
import { formatDynamicDecimal } from "../utils/utils";
import type { OMSOrder } from "./omsTypes";
import type { NotificationCategory } from "../lib/notificationPolicy";
import type { LocalNotificationChannel } from "../lib/notificationPolicy";
import { isLocalNotificationChannel } from "../lib/notificationPolicy";

/** What the caller knows about the event, already translated. */
export interface NotificationRequest {
    category: NotificationCategory;
    /** Identity of the underlying event, for duplicate suppression. */
    eventId: string;
    /** One line, shown as the toast body and the notification title. */
    message: string;
    /** Colours the toast. Rejections read as errors, fills as successes. */
    tone?: "success" | "error" | "info";
    /**
     * The local channels this particular announcement asks for — BUG-0750.
     *
     * Non-empty: authoritative for `in-app`, `browser` and `sound`. A rule that
     * says "in-app only" then stays off the OS notification and the tone even
     * when the category policy switches both on. It may also switch one on that
     * the category leaves off: the specific choice on the alert outranks the
     * general one, and the failure this subsystem exists to prevent is an alarm
     * that looks armed and is heard by nobody.
     *
     * Absent or empty: the category policy decides, which is what every rule
     * authored before this field existed means.
     *
     * The external half is `externalChannels` below and is bounded by the
     * policy. A local tick outranks the category default (BUG-0750) but not a
     * category the trader silenced entirely —
     * `isSilent` is checked before either field is read.
     */
    localChannels?: readonly LocalNotificationChannel[];
    /**
     * The external channels this particular announcement asks for — FEAT-0748.
     *
     * Non-empty: narrows the policy's external set to these, and only where the
     * policy already wants them *and* the channel is active. Absent or empty:
     * the policy decides, as it did before this field existed.
     *
     * A rule can therefore never open a channel the trader silenced: the policy
     * is the ceiling, not a default the rule may overrule.
     */
    externalChannels?: readonly ExternalChannelId[];
    /**
     * Treat both lists as exhaustive rather than as a narrowing — FEAT-0748.
     *
     * Only the test send passes this. A rule's test must reach *exactly* the
     * set the rule would use; without this flag an empty list would fall back to
     * the policy and the test would prove a channel the rule never uses.
     */
    exactChannels?: boolean;
    /**
     * Marks the announcement as a test in the delivery log. The body's "Test —"
     * prefix comes from the caller (`dashboard.alerts.testAnnouncement`).
     */
    test?: boolean;
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

    /** Last reported skip per channel, so the log records transitions only. */
    private lastSkip = new Map<ExternalChannelId, { reason: "paused" | "notConfigured"; atMs: number }>();

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
     * Announce an event on the channels that apply to it: the local ones the
     * request selected, or the policy's local choice when it selected none, plus
     * the external ones the policy asks for.
     *
     * `request.localChannels`, when present and non-empty, takes over the three
     * local channels: the trader picked them on this rule, and a specific choice
     * on the alert outranks the category default (BUG-0750). The external ones
     * narrow the policy's set the same way (FEAT-0748), never widen it.
     *
     * Returns the channels actually delivered on, so a test can assert the
     * absence of delivery rather than the presence of a message.
     */
    public notify(request: NotificationRequest): string[] {
        const {
            category,
            eventId,
            message,
            tone = "info",
            localChannels,
            externalChannels,
            exactChannels = false,
            test = false,
        } = request;

        if (notificationPolicyStore.isSilent(category)) return [];

        /*
         * Sanitised here rather than trusted from the caller: this is a service
         * boundary, and a value delivery does not recognise must fall back to
         * the policy instead of becoming a selection that matches nothing —
         * which would mute the alarm rather than announce it.
         */
        const selected = localChannels?.filter(isLocalNotificationChannel) ?? [];

        /*
         * The external half — FEAT-0748. Sanitised the same way: a name this
         * build does not know must not turn into a selection that matches
         * nothing, because that would mute an alarm the trader asked for.
         */
        const selectedExternal = (externalChannels ?? []).filter(
            (channel): channel is ExternalChannelId =>
                (EXTERNAL_NOTIFICATION_CHANNELS as readonly string[]).includes(channel),
        );

        /*
         * One place for the local precedence, so the toast, the OS notification
         * and the tone cannot disagree about who decides. `undefined` and `[]`
         * both mean "the policy decides".
         *
         * The external half is resolved separately in `externalTargets`; the
         * display path shares its *resolver* (`effectiveChannels`) but resolves
         * before delivery, because it also needs to say why a channel is out.
         */
        const wantsLocal = (channel: LocalNotificationChannel): boolean =>
            selected.length > 0 || exactChannels
                ? selected.includes(channel)
                : notificationPolicyStore.wants(category, channel);

        const key = notificationKey(category, eventId);
        if (this.isDuplicate(key)) return [];
        this.remember(key);

        const delivered: string[] = [];

        if (wantsLocal("in-app")) {
            this.showToast(message, tone);
            delivered.push("in-app");
        }

        if (wantsLocal("browser") && this.showBrowser(message)) {
            delivered.push("browser");
        }

        /*
         * The sound channel — FEAT-0392. Last because it is the one channel that
         * can be refused by the platform rather than by the user, and the two
         * above must already have run by then. `play` returns whether a tone
         * actually started, so a muted or autoplay-blocked channel is absent
         * from the list rather than claimed.
         */
        if (
            wantsLocal("sound") &&
            soundChannel.play(TONE_FOR_CATEGORY[category])
        ) {
            delivered.push("sound");
        }

        /*
         * Availability floor — BUG-0750. A rule that named a channel has no
         * other way to be heard, and `showBrowser` and `play` refuse for reasons
         * the trader did not choose: permission never granted, a muted tab, an
         * autoplay lock. A `once` rule is spent after this call either way, so
         * announcing nothing would be the silent alarm the per-rule choice
         * exists to avoid. In-app stands in — but only where the category policy
         * still wants it, so this cannot overrule a deliberate "no toasts for
         * alerts".
         */
        if (
            selected.length > 0 &&
            delivered.length === 0 &&
            notificationPolicyStore.wants(category, "in-app")
        ) {
            this.showToast(message, tone);
            delivered.push("in-app");
        }

        /*
         * The external channels — FEAT-0397. Absent from `delivered` on purpose:
         * each one is a `fetch`, and a synchronous return cannot honestly say
         * whether Discord accepted the message. Claiming delivery here would
         * make the very assertion this return value exists for a lie, so the
         * outcome goes to `externalDeliveryLog` and the settings UI reads it
         * there.
         */
        const external = this.externalTargets(category, selectedExternal, test, exactChannels);
        if (external.length > 0) {
            dispatchExternal(external, message, this.subjectFor(category), test);
        }

        return delivered;
    }

    /** The in-app channel. One shape, whether it was chosen or stood in. */
    private showToast(message: string, tone: "success" | "error" | "info"): void {
        if (tone === "success") toastService.success(message);
        else if (tone === "error") toastService.error(message);
        else toastService.info(message);
    }

    /**
     * The external channels this announcement should reach.
     *
     * Two authorities: the policy decides whether a channel may carry this
     * category at all, and the rule may narrow the result further. A rule
     * naming a channel the policy does not want is not a request the service
     * can honour — the policy is the ceiling (ADR-0018).
     *
     * A wanted channel that is not active is skipped *with an entry in the
     * delivery log* (BUG-0753): silence was the defect, not the skip itself.
     */
    private externalTargets(
        category: NotificationCategory,
        requested: readonly ExternalChannelId[],
        test: boolean,
        exact: boolean,
    ): ExternalChannelId[] {
        const targets: ExternalChannelId[] = [];
        for (const channel of EXTERNAL_NOTIFICATION_CHANNELS) {
            if (!notificationPolicyStore.wants(category, channel)) continue;
            const id = channel as ExternalChannelId;
            // In exact mode an empty list means "nothing external", not "the
            // policy decides": the test send resolves the set beforehand.
            if (exact && !requested.includes(id)) continue;
            if (!exact && requested.length > 0 && !requested.includes(id)) continue;

            if (externalChannelsStore.isActive(id)) {
                targets.push(id);
                continue;
            }

            this.recordSkip(id, test);
        }
        return targets;
    }

    /**
     * One log entry per state change, not per announcement — BUG-0753.
     *
     * A paused channel that stays paused is one fact, and repeating it on every
     * firing of an `every_time` rule would fill the 50-entry ring and push out
     * the real failures the log exists to preserve. A reason change, or the
     * same reason after the duplicate window, is news again.
     */
    private recordSkip(channel: ExternalChannelId, test: boolean): void {
        const reason =
            externalChannelsStore.state(channel) === "paused" ? "paused" : "notConfigured";
        const now = Date.now();
        const previous = this.lastSkip.get(channel);
        if (
            previous &&
            previous.reason === reason &&
            now - previous.atMs < DUPLICATE_WINDOW_MS
        ) {
            return;
        }

        this.lastSkip.set(channel, { reason, atMs: now });
        externalDeliveryLog.record({ channel, ok: false, atMs: now, test, reason });
    }

    /** The e-mail subject. The body is the same line every other channel gets. */
    private subjectFor(category: NotificationCategory): string {
        const t = get(_) as (k: string) => string;
        const label = t(`settings.notifications.categories.${category}`);
        return t("settings.externalChannels.subject").replace("{category}", label);
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
        this.lastSkip.clear();
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
