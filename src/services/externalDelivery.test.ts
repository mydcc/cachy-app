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
 * External delivery — FEAT-0397.
 *
 * Every test is about a failure that must not become an exception. This code runs
 * from the alert evaluation loop, and an error escaping it would stop every other
 * rule from being evaluated — which is worse than one undelivered message.
 *
 * The second thread running through these tests is what reaches the network: the
 * Telegram token goes to Telegram and nowhere else, and no credential reaches the
 * log.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
}));
vi.mock("./logger", () => ({ logger: loggerMock }));

import { deliverExternal, dispatchExternal, fetchTelegramChats } from "./externalDelivery";
import { externalChannelsStore } from "../stores/externalChannels.svelte";
import { externalDeliveryLog } from "../stores/externalDeliveryLog.svelte";

const WEBHOOK = "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_";
const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

function okResponse(status = 204): Response {
    return { ok: status < 400, status, text: async () => "" } as unknown as Response;
}

function errorResponse(status: number, body = "provider said no"): Response {
    return { ok: false, status, text: async () => body } as unknown as Response;
}

function jsonResponse(body: unknown): Response {
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function configureAll(): void {
    externalChannelsStore.setDiscord({ enabled: true, webhookUrl: WEBHOOK, format: "minimal" });
    externalChannelsStore.setTelegram({ enabled: true, botToken: TOKEN, chatId: "-100123" });
    externalChannelsStore.setEmail({
        enabled: true,
        domain: "mg.example.com",
        apiKey: "key-0123456789",
        from: "alerts@example.com",
        to: "me@example.com",
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    externalChannelsStore.reload();
    externalDeliveryLog.clear();
    fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("where each channel sends", () => {
    beforeEach(configureAll);

    it("posts the body to the trader's Discord webhook", async () => {
        const outcome = await deliverExternal("discord", "BTCUSDT crossed 70000", "subject");

        expect(outcome.ok).toBe(true);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(WEBHOOK);
        expect(JSON.parse(String((init as RequestInit).body))).toEqual({
            content: "BTCUSDT crossed 70000",
        });
    });

    it("sends the Telegram message to Telegram and to nothing else", async () => {
        // The token sits in the path, which is Telegram's own design. What this
        // asserts is the ADR-0018 decision: there is no proxy in the call, so the
        // credential reaches Telegram alone.
        await deliverExternal("telegram", "crossed", "subject");

        const [url] = fetchMock.mock.calls[0];
        expect(String(url).startsWith("https://api.telegram.org/bot")).toBe(true);
        expect(String(url)).toContain(encodeURIComponent(TOKEN));
    });

    it("sends e-mail to Mailgun's messages endpoint with basic auth", async () => {
        await deliverExternal("email", "crossed", "Cachy — Alarm");

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mailgun.net/v3/mg.example.com/messages");
        const headers = (init as RequestInit).headers as Record<string, string>;
        expect(headers.Authorization).toBe(`Basic ${btoa("api:key-0123456789")}`);
        expect(String((init as RequestInit).body)).toContain("subject=Cachy");
    });

    it("never sends on a channel that does not validate", async () => {
        externalChannelsStore.setDiscord({ webhookUrl: "" });

        const outcome = await deliverExternal("discord", "crossed", "subject");

        expect(outcome.ok).toBe(false);
        expect(outcome.reason).toBe("notConfigured");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("re-validates at send time, not at arming time", async () => {
        // The trader can edit a field between arming a rule and the rule firing,
        // and the UI's verdict is stale by then.
        externalChannelsStore.setTelegram({ botToken: "broken" });

        const outcome = await deliverExternal("telegram", "crossed", "subject");

        expect(outcome.reason).toBe("notConfigured");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("what a failure becomes", () => {
    beforeEach(configureAll);

    it("reads a 401 as rejected credentials", async () => {
        fetchMock.mockResolvedValue(errorResponse(401));

        const outcome = await deliverExternal("discord", "crossed", "subject");

        expect(outcome.ok).toBe(false);
        expect(outcome.reason).toBe("unauthorized");
        expect(outcome.detail).toContain("401");
    });

    it("reads a 429 as rate limiting, which is not the same problem", async () => {
        fetchMock.mockResolvedValue(errorResponse(429));

        expect((await deliverExternal("discord", "crossed", "s")).reason).toBe("rateLimited");
    });

    it("reads any other refusal as rejected, keeping the provider's words", async () => {
        fetchMock.mockResolvedValue(errorResponse(400, "Invalid Webhook Token"));

        const outcome = await deliverExternal("discord", "crossed", "s");

        expect(outcome.reason).toBe("rejected");
        expect(outcome.detail).toContain("Invalid Webhook Token");
    });

    it("turns an offline device into a reason rather than a throw", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        const outcome = await deliverExternal("telegram", "crossed", "s");

        expect(outcome.ok).toBe(false);
        expect(outcome.reason).toBe("network");
    });

    it("turns an abort into a timeout", async () => {
        fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

        expect((await deliverExternal("telegram", "crossed", "s")).reason).toBe("timeout");
    });

    it("never rejects, whatever fetch does", async () => {
        fetchMock.mockImplementation(() => {
            throw new Error("synchronous explosion");
        });

        await expect(deliverExternal("discord", "crossed", "s")).resolves.toMatchObject({
            ok: false,
        });
    });

    it("logs the reason and never the credential", async () => {
        // A log line naming a bot token is how a Class A secret ends up in a
        // screenshot attached to a bug report.
        fetchMock.mockResolvedValue(errorResponse(401));

        await deliverExternal("telegram", "crossed", "s");

        const logged = loggerMock.warn.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(logged).toContain("telegram");
        expect(logged).not.toContain(TOKEN);
    });
});

describe("the delivery log", () => {
    beforeEach(configureAll);

    it("records an outcome per attempt, newest first", async () => {
        await deliverExternal("discord", "one", "s");
        fetchMock.mockResolvedValue(errorResponse(500));
        await deliverExternal("discord", "two", "s");

        expect(externalDeliveryLog.entries).toHaveLength(2);
        expect(externalDeliveryLog.entries[0].ok).toBe(false);
        expect(externalDeliveryLog.latest("discord")?.ok).toBe(false);
        expect(externalDeliveryLog.failureCount).toBe(1);
    });

    it("marks a test so it can be told from a real alert", async () => {
        await deliverExternal("discord", "test", "s", true);

        expect(externalDeliveryLog.latest("discord")?.test).toBe(true);
    });

    it("stays bounded over a long session", async () => {
        for (let i = 0; i < 60; i++) await deliverExternal("discord", `m${i}`, "s");

        expect(externalDeliveryLog.entries).toHaveLength(50);
    });
});

describe("dispatch from the hot path", () => {
    beforeEach(configureAll);

    it("fires every channel given and returns without waiting", async () => {
        // Synchronous by contract: `notify()` runs on the market hot path and
        // cannot await three HTTP calls.
        const result = dispatchExternal(["discord", "telegram"], "crossed", "s");

        expect(result).toBeUndefined();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it("does nothing when given no channels", () => {
        dispatchExternal([], "crossed", "s");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});


describe("the Telegram chat lookup", () => {
    it("returns the distinct chats the bot has seen", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({
                ok: true,
                result: [
                    { message: { chat: { id: -100123, title: "Cachy Alerts" } } },
                    { message: { chat: { id: -100123, title: "Cachy Alerts" } } },
                    { channel_post: { chat: { id: 777, username: "pat" } } },
                ],
            }),
        );

        const chats = await fetchTelegramChats(TOKEN);

        expect(chats).toEqual([
            { id: "-100123", name: "Cachy Alerts" },
            { id: "777", name: "@pat" },
        ]);
    });

    it("tells an empty queue apart from a failed lookup", async () => {
        // They need different words in the UI: one means "send your bot a
        // message", the other means "your token is wrong".
        fetchMock.mockResolvedValue(jsonResponse({ ok: true, result: [] }));
        expect(await fetchTelegramChats(TOKEN)).toEqual([]);

        fetchMock.mockResolvedValue(errorResponse(401));
        expect(await fetchTelegramChats(TOKEN)).toBeNull();
    });

    it("survives an update shape it has never seen", async () => {
        fetchMock.mockResolvedValue(
            jsonResponse({ result: [{ poll_answer: { option_ids: [1] } }, null, 7] }),
        );

        expect(await fetchTelegramChats(TOKEN)).toEqual([]);
    });

    it("returns null rather than throwing when the body is not what it claims", async () => {
        fetchMock.mockResolvedValue(jsonResponse("nonsense"));
        expect(await fetchTelegramChats(TOKEN)).toBeNull();

        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        expect(await fetchTelegramChats(TOKEN)).toBeNull();
    });

    it("does not put the token in a log line when the lookup fails", async () => {
        fetchMock.mockRejectedValue(new Error(`boom`));

        await fetchTelegramChats(TOKEN);

        const logged = loggerMock.warn.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(logged).not.toContain(TOKEN);
    });

    it("refuses an empty token without reaching the network", async () => {
        expect(await fetchTelegramChats("   ")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
