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

/*
 * The sound channel is mocked here on purpose. This file is about the policy —
 * which channels a category reaches — and the real WebAudio path, including the
 * autoplay refusal, is `soundChannel.test.ts`'s subject. Mocking it here keeps
 * the two from testing each other's scaffolding.
 */
const soundMock = vi.hoisted(() => ({ play: vi.fn(() => true) }));
vi.mock("./soundChannel.svelte", () => ({ soundChannel: soundMock }));

/*
 * Likewise the external channels: this file's subject is which channels a
 * category reaches, not what Mailgun answers. The HTTP paths and their failure
 * reasons are `externalDelivery.test.ts`.
 */
const externalMock = vi.hoisted(() => ({ dispatchExternal: vi.fn() }));
vi.mock("./externalDelivery", () => externalMock);

import { notificationService } from "./notificationService.svelte";
import { notificationPolicyStore } from "../stores/notifications.svelte";
import { externalChannelsStore } from "../stores/externalChannels.svelte";
import { externalDeliveryLog } from "../stores/externalDeliveryLog.svelte";
import {
    DEFAULT_NOTIFICATION_POLICY,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CHANNELS,
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
    soundMock.play.mockReturnValue(true);
    notificationService.reset();
    notificationPolicyStore.reset();
    externalChannelsStore.reload();
    externalDeliveryLog.clear();
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


describe("the sound channel — FEAT-0392", () => {
    it("reports the sound channel in the delivered list", () => {
        // The criterion is assertable delivery: the channel appears because a
        // tone actually started, not because the policy wanted one.
        notificationPolicyStore.setChannel("alert-fired", "sound", true);

        const delivered = notificationService.notify({
            category: "alert-fired",
            eventId: "r-1@0",
            message: "BTCUSDT crossed 70000",
        });

        expect(delivered).toEqual(["in-app", "sound"]);
        expect(soundMock.play).toHaveBeenCalledWith("alarm");
    });

    it("gives an armed alarm its own tone, not the fill tone", () => {
        // A trader recognising an alarm by ear is the whole point of the
        // channel; sharing the fill's tone would defeat it.
        notificationPolicyStore.setChannel("alert-fired", "sound", true);
        notificationPolicyStore.setChannel("order-filled", "sound", true);

        notificationService.notify({ category: "alert-fired", eventId: "r-1@0", message: "a" });
        notificationService.notify({ category: "order-filled", eventId: "o-1", message: "b" });

        expect(soundMock.play).toHaveBeenNthCalledWith(1, "alarm");
        expect(soundMock.play).toHaveBeenNthCalledWith(2, "chime");
    });

    it("keeps the other channels delivering when the tone is refused", () => {
        // Autoplay, or a muted channel. The alarm is still announced; it is
        // only the audible half that is missing, and the list says so.
        soundMock.play.mockReturnValue(false);
        notificationPolicyStore.setChannel("alert-fired", "sound", true);
        stubNotification("granted");
        notificationPolicyStore.setChannel("alert-fired", "browser", true);

        const delivered = notificationService.notify({
            category: "alert-fired",
            eventId: "r-1@0",
            message: "a",
        });

        expect(delivered).toEqual(["in-app", "browser"]);
    });

    it("does not consult the channel at all when the policy says no", () => {
        notificationService.notify({ category: "alert-fired", eventId: "r-1@0", message: "a" });

        expect(soundMock.play).not.toHaveBeenCalled();
    });

    it("leaves every sound channel off until asked", () => {
        // A page that makes noise on first visit is the behaviour that gets the
        // tab muted at the OS level — taking the alarm with it.
        for (const category of NOTIFICATION_CATEGORIES) {
            expect(DEFAULT_NOTIFICATION_POLICY[category].sound).toBe(false);
        }
    });

    it("counts a category as silent only when all three channels are off", () => {
        notificationPolicyStore.setChannel("order-cancelled", "sound", true);

        const delivered = notificationService.notify({
            category: "order-cancelled",
            eventId: "o-9",
            message: "cancelled",
        });

        // In-app is off for cancellations by default, so sound alone carries it.
        expect(delivered).toEqual(["sound"]);
    });
});


describe("the external channels — FEAT-0397", () => {
    const WEBHOOK = "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_";

    function configureDiscord(): void {
        externalChannelsStore.setDiscord({ enabled: true, webhookUrl: WEBHOOK, format: "minimal" });
    }

    it("dispatches on a channel the policy wants and the trader configured", () => {
        configureDiscord();
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        notificationService.notify({
            category: "alert-fired",
            eventId: "r-1@0",
            message: "BTCUSDT crossed 70000",
        });

        expect(externalMock.dispatchExternal).toHaveBeenCalledWith(
            ["discord"],
            "BTCUSDT crossed 70000",
            expect.any(String),
            false,
        );
    });

    it("records a wanted channel that is paused instead of skipping it silently", () => {
        // BUG-0753: valid credentials, the card's switch off. The policy still
        // says "on", so the only honest place to explain the silence is the log.
        externalChannelsStore.setDiscord({ enabled: false, webhookUrl: WEBHOOK, format: "minimal" });
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        notificationService.notify({
            category: "alert-fired",
            eventId: "r-paused@0",
            message: "BTCUSDT crossed 70000",
        });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
        expect(externalDeliveryLog.entries).toHaveLength(1);
        expect(externalDeliveryLog.entries[0]).toMatchObject({
            channel: "discord",
            ok: false,
            reason: "paused",
            test: false,
        });
    });

    it("records a wanted channel with missing credentials as not configured", () => {
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        notificationService.notify({
            category: "alert-fired",
            eventId: "r-setup@0",
            message: "BTCUSDT crossed 70000",
        });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
        expect(externalDeliveryLog.entries[0]).toMatchObject({
            channel: "discord",
            reason: "notConfigured",
        });
    });

    it("narrows delivery to the external channels the rule selected", () => {
        configureDiscord();
        externalChannelsStore.setTelegram({
            enabled: true,
            botToken: "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw",
            chatId: "42",
        });
        notificationPolicyStore.setChannel("alert-fired", "discord", true);
        notificationPolicyStore.setChannel("alert-fired", "telegram", true);

        notificationService.notify({
            category: "alert-fired",
            eventId: "r-narrow@0",
            message: "BTCUSDT crossed 70000",
            externalChannels: ["telegram"],
        });

        expect(externalMock.dispatchExternal).toHaveBeenCalledWith(
            ["telegram"],
            "BTCUSDT crossed 70000",
            expect.any(String),
            false,
        );
    });

    it("cannot open a channel the policy does not want", () => {
        configureDiscord();
        // The policy wants no external channel for alerts by default.
        notificationService.notify({
            category: "alert-fired",
            eventId: "r-ceiling@0",
            message: "BTCUSDT crossed 70000",
            externalChannels: ["discord"],
        });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("delivers on exactly the given channels when the test send asks for it", () => {
        configureDiscord();
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        // `exactChannels` with an empty list means "nothing external", not "the
        // policy decides" — a test must prove the rule's set, not a fallback.
        notificationService.notify({
            category: "alert-fired",
            eventId: "test:r-1",
            message: "Test",
            externalChannels: [],
            exactChannels: true,
            test: true,
        });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("leaves external channels out of the delivered list", () => {
        // They cannot be in it honestly: each is a `fetch`, and this function has
        // already returned by the time Discord answers. The outcome lives in
        // `externalDeliveryLog` instead — see ADR-0018.
        configureDiscord();
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        const delivered = notificationService.notify({
            category: "alert-fired",
            eventId: "r-1@0",
            message: "a",
        });

        expect(delivered).toEqual(["in-app"]);
    });

    it("does not dispatch on a channel the policy did not ask for", () => {
        configureDiscord();

        notificationService.notify({ category: "alert-fired", eventId: "r-1@0", message: "a" });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("does not dispatch on a channel switched on but left unconfigured", () => {
        // One failure entry per alert would bury the entries describing a real
        // problem, so the gate is configuration *and* policy.
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        notificationService.notify({ category: "alert-fired", eventId: "r-1@0", message: "a" });

        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("announces with zero external channels configured, as before", () => {
        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toEqual(["in-app"]);
        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("respects a silenced category on every channel, external included", () => {
        // Silencing a category means "do not tell me about this". If the loudest
        // channel survived the mute, the setting would be a half-truth.
        configureDiscord();
        notificationPolicyStore.setChannel("order-filled", "in-app", false);
        notificationPolicyStore.setChannel("order-filled", "discord", true);
        notificationPolicyStore.setChannel("order-filled", "discord", false);

        const delivered = notificationService.notify({
            category: "order-filled",
            eventId: "o-1",
            message: "filled",
        });

        expect(delivered).toEqual([]);
        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("leaves every external channel off out of the box", () => {
        for (const category of NOTIFICATION_CATEGORIES) {
            expect(DEFAULT_NOTIFICATION_POLICY[category].email).toBe(false);
            expect(DEFAULT_NOTIFICATION_POLICY[category].discord).toBe(false);
            expect(DEFAULT_NOTIFICATION_POLICY[category].telegram).toBe(false);
        }
    });
});

/*
 * BUG-0750 — a rule's own channel choice.
 *
 * The builder's footer writes `trigger_methods` and `armRule` stores it, but
 * before this fix nothing read it: the category policy alone decided where an
 * alarm was heard. The decision is that the three *local* channels belong to
 * the rule — the specific choice on the alert outranks the category default —
 * while `email`, `discord` and `telegram` stay policy-only, because they are
 * the one path by which Class A content leaves the device (ADR-0018).
 */
describe("a rule's own channel selection — BUG-0750", () => {
    function alertWith(localChannels: readonly ("in-app" | "browser" | "sound")[]) {
        return notificationService.notify({
            category: "alert-fired",
            eventId: "r-1@0",
            message: "BTCUSDT crossed 70000",
            localChannels,
        });
    }

    it("delivers only what the rule selected, even where the policy wants more", () => {
        // The builder promises "in-app only" and the policy has sound and an OS
        // notification armed. The rule's choice is the narrower, more specific
        // one, so it wins.
        notificationPolicyStore.setChannel("alert-fired", "sound", true);
        notificationPolicyStore.setChannel("alert-fired", "browser", true);
        const ctor = stubNotification("granted");

        const delivered = alertWith(["in-app"]);

        expect(delivered).toEqual(["in-app"]);
        expect(soundMock.play).not.toHaveBeenCalled();
        expect(ctor).not.toHaveBeenCalled();
    });

    it("switches on a local channel the category leaves off", () => {
        // Sound is off for `alert-fired` out of the box; a rule that ticks it is
        // an explicit request for that one alarm, and honouring it is the point
        // of the control. Ignoring it here is what a silent alarm looks like.
        expect(DEFAULT_NOTIFICATION_POLICY["alert-fired"].sound).toBe(false);

        const delivered = alertWith(["sound"]);

        expect(delivered).toEqual(["sound"]);
        expect(soundMock.play).toHaveBeenCalledWith("alarm");
        expect(toastMock.info).not.toHaveBeenCalled();
    });

    it("leaves the category policy in charge when the rule selected nothing", () => {
        // A rule authored before the footer existed, or one where the trader
        // ticked nothing, keeps announcing exactly as it does today.
        expect(alertWith([])).toEqual(["in-app"]);
        expect(toastMock.info).toHaveBeenCalledTimes(1);
    });

    it("stays silent when the trader silenced the whole category", () => {
        // A rule cannot resurrect a category the trader switched off entirely.
        // The per-rule choice narrows the category; it does not overrule the
        // "don't announce this kind of event at all" switch.
        for (const channel of NOTIFICATION_CHANNELS) {
            notificationPolicyStore.setChannel("alert-fired", channel, false);
        }

        expect(alertWith(["sound"])).toEqual([]);
        expect(soundMock.play).not.toHaveBeenCalled();
    });

    it("leaves the external channels to the policy", () => {
        // The rule's list is about the three local channels. Egress stays where
        // the trader configured it, so a rule selecting only in-app neither
        // adds nor blocks Discord (ADR-0018).
        externalChannelsStore.setDiscord({
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
            format: "minimal",
        });
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        const delivered = alertWith(["in-app"]);

        expect(delivered).toEqual(["in-app"]);
        expect(externalMock.dispatchExternal).toHaveBeenCalledWith(
            ["discord"],
            "BTCUSDT crossed 70000",
            expect.any(String),
            false,
        );
    });

    it("cannot open an external channel the policy has turned off", () => {
        // The other direction of the same boundary: a per-alert switch must not
        // become a way around the trader's egress decision. Discord is
        // configured and the rule picks in-app — nothing may leave the device.
        externalChannelsStore.setDiscord({
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
            format: "minimal",
        });

        const delivered = alertWith(["in-app"]);

        expect(delivered).toEqual(["in-app"]);
        expect(externalMock.dispatchExternal).not.toHaveBeenCalled();
    });

    it("delivers a browser tick as an OS notification", () => {
        // The positive half of the mapping: without it, an implementation that
        // silently dropped `browser` would pass every other test.
        const ctor = stubNotification("granted");

        const delivered = alertWith(["browser", "sound"]);

        expect(delivered).toEqual(["browser", "sound"]);
        expect(ctor).toHaveBeenCalledTimes(1);
        expect(toastMock.info).not.toHaveBeenCalled();
    });

    it("falls back to the toast when the chosen channel cannot deliver", () => {
        // Permission was never granted, so the OS notification refuses. Without
        // the floor the alarm is heard by nobody and a `once` rule is spent.
        stubNotification("default");

        const delivered = alertWith(["browser"]);

        expect(delivered).toEqual(["in-app"]);
        expect(toastMock.info).toHaveBeenCalledTimes(1);
    });

    it("does not fall back to a toast the category has switched off", () => {
        // The floor is an availability guard, not a way to overrule a
        // deliberate "no toasts for alerts". Discord keeps the category
        // non-silent so `isSilent` does not short-circuit first.
        stubNotification("default");
        notificationPolicyStore.setChannel("alert-fired", "in-app", false);
        notificationPolicyStore.setChannel("alert-fired", "discord", true);

        expect(alertWith(["browser"])).toEqual([]);
        expect(toastMock.info).not.toHaveBeenCalled();
    });

    it("ignores a channel it does not know instead of trusting the list", () => {
        // A caller that names something outside the vocabulary must fall back to
        // the policy, not mute the alarm by selecting nothing deliverable.
        notificationPolicyStore.setChannel("alert-fired", "sound", true);

        expect(alertWith(["email" as never])).toEqual(["in-app", "sound"]);
    });
});
