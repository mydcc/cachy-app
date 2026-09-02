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
 */

/*
 * Notification delivery — FEAT-0025.
 *
 * Each test asserts the channels actually delivered on rather than the text
 * shown, because the criteria are about *whether* something is announced: once
 * per event, only where the policy says, and never on a channel the browser has
 * refused.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const toastMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    add: vi.fn(),
}));
vi.mock("./toastService.svelte", () => ({ toastService: toastMock }));

import { notificationService } from "./notificationService.svelte";
import { notificationPolicyStore } from "../stores/notifications.svelte";
import {
    DEFAULT_NOTIFICATION_POLICY,
    NOTIFICATION_CATEGORIES,
    normalizeNotificationPolicy,
} from "../lib/notificationPolicy";

/**
 * Stands in for the browser's Notification API at a chosen permission.
 *
 * `function`, not an arrow: the service calls `new Notification(...)`, and an
 * arrow function is not a constructor — the `TypeError` would be swallowed by
 * the very catch block this file is trying to test around.
 */
function stubNotification(permission: string, ctor: () => void = function () {}) {
    const fn = vi.fn(ctor) as unknown as typeof Notification;
    (fn as unknown as { permission: string }).permission = permission;
    (globalThis as { Notification?: unknown }).Notification = fn;
    return fn;
}

beforeEach(() => {
    vi.clearAllMocks();
    notificationService.reset();
    notificationPolicyStore.reset();
    delete (globalThis as { Notification?: unknown }).Notification;
});

afterEach(() => {
    delete (globalThis as { Notification?: unknown }).Notification;
});

describe("delivery follows the policy", () => {
    it("announces in-app where the policy asks for it", () => {
        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "BTCUSDT filled",
            tone: "success",
        });

        expect(delivered).toEqual(["in-app"]);
        expect(toastMock.success).toHaveBeenCalledWith("BTCUSDT filled");
    });

    it("says nothing at all for a category with no channel on", () => {
        // `order-cancelled` ships silent — a cancel is usually the user's own
        // doing, and announcing it is how a channel earns a mute.
        const delivered = notificationService.notify({
            category: "order-cancelled",
            eventId: "o-2",
            message: "cancelled",
        });

        expect(delivered).toEqual([]);
        expect(toastMock.info).not.toHaveBeenCalled();
    });

    it("routes the tone to the matching toast", () => {
        notificationService.notify({
            category: "order-rejected",
            eventId: "o-3",
            message: "rejected",
            tone: "error",
        });

        expect(toastMock.error).toHaveBeenCalledWith("rejected");
        expect(toastMock.success).not.toHaveBeenCalled();
    });
});

describe("one logical event is announced once", () => {
    it("suppresses the same event repeated inside the window", () => {
        // A REST poll and a WebSocket push describing the same fill arrive as
        // two updates with identical content.
        const first = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "BTCUSDT filled",
        });
        const second = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "BTCUSDT filled",
        });

        expect(first).toEqual(["in-app"]);
        expect(second).toEqual([]);
        expect(toastMock.info).toHaveBeenCalledTimes(1);
    });

    it("treats a different order as a different event", () => {
        notificationService.notify({ category: "order-filled", eventId: "o-1", message: "a" });
        const other = notificationService.notify({
            category: "order-filled",
            eventId: "o-2",
            message: "b",
        });

        expect(other).toEqual(["in-app"]);
    });

    it("treats the same order reaching a different state as a different event", () => {
        // Filling and later being cancelled is two things that happened, not
        // one thing described twice.
        notificationService.notify({ category: "order-filled", eventId: "o-1", message: "a" });
        notificationPolicyStore.setChannel("order-cancelled", "in-app", true);

        const cancelled = notificationService.notify({
            category: "order-cancelled",
            eventId: "o-1",
            message: "b",
        });

        expect(cancelled).toEqual(["in-app"]);
    });

    it("suppresses a duplicate even when the wording changed", () => {
        // Keyed on the event, not the message: a later copy carrying a rounder
        // quantity is still the same fill.
        notificationService.notify({ category: "order-filled", eventId: "o-1", message: "0.5001" });
        const second = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "0.50",
        });

        expect(second).toEqual([]);
    });
});

describe("the browser channel degrades rather than failing", () => {
    beforeEach(() => {
        notificationPolicyStore.setChannel("order-filled", "browser", true);
    });

    it("delivers when permission was granted", () => {
        const ctor = stubNotification("granted");
        expect(notificationService.permission()).toBe("granted");

        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toContain("browser");
        expect(ctor).toHaveBeenCalledWith("filled");
    });

    it("still delivers in-app when permission was denied", () => {
        // The criterion: denied permission degrades gracefully. The trader
        // keeps the toast; only the OS notification is missing.
        stubNotification("denied");

        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toEqual(["in-app"]);
        expect(toastMock.info).toHaveBeenCalledTimes(1);
    });

    it("survives a browser with no Notification API at all", () => {
        // Nothing stubbed: `Notification` is undefined.
        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toEqual(["in-app"]);
    });

    it("survives a platform that throws from the constructor", () => {
        // Android without a service worker rejects this outright.
        stubNotification("granted", function () {
            throw new Error("Illegal constructor");
        });

        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toEqual(["in-app"]);
    });

    it("reports an absent API as unsupported rather than denied", () => {
        // The settings UI needs to tell those apart: one can be asked, the
        // other cannot.
        expect(notificationService.permission()).toBe("unsupported");
    });
});

describe("policy defaults and normalisation", () => {
    it("announces fills and rejections but not cancels, out of the box", () => {
        expect(DEFAULT_NOTIFICATION_POLICY["order-filled"]["in-app"]).toBe(true);
        expect(DEFAULT_NOTIFICATION_POLICY["order-rejected"]["in-app"]).toBe(true);
        expect(DEFAULT_NOTIFICATION_POLICY["order-cancelled"]["in-app"]).toBe(false);
    });

    it("leaves every browser channel off until asked", () => {
        // Requesting notification permission unprompted is how a site trains
        // people to refuse it.
        for (const category of NOTIFICATION_CATEGORIES) {
            expect(DEFAULT_NOTIFICATION_POLICY[category].browser).toBe(false);
        }
    });

    it("fills a missing category from the defaults, not from false", () => {
        const policy = normalizeNotificationPolicy({ "order-cancelled": { "in-app": true } });

        expect(policy["order-cancelled"]["in-app"]).toBe(true);
        expect(policy["order-filled"]["in-app"]).toBe(true);
    });

    it("ignores a malformed entry", () => {
        const policy = normalizeNotificationPolicy({ "order-filled": "yes" });

        expect(policy["order-filled"]).toEqual(DEFAULT_NOTIFICATION_POLICY["order-filled"]);
    });

    it("survives a corrupt blob", () => {
        expect(normalizeNotificationPolicy(null)).toEqual(DEFAULT_NOTIFICATION_POLICY);
        expect(normalizeNotificationPolicy("nonsense")).toEqual(DEFAULT_NOTIFICATION_POLICY);
    });
});
