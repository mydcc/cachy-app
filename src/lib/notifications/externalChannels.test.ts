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
 * External channel validation — FEAT-0397.
 *
 * The validators are the gate that decides whether a channel may be switched on
 * at all, so each test here is really about a channel that must *not* become
 * active: a webhook pointing somewhere else, a token of the wrong shape, a
 * recipient list with one bad address in it.
 */

import { describe, it, expect } from "vitest";
import {
    DEFAULT_EXTERNAL_CHANNELS,
    formatExternalMessage,
    isChannelActive,
    normalizeExternalChannels,
    splitRecipients,
    validateDiscord,
    validateEmail,
    validateTelegram,
    type ExternalChannelsConfig,
} from "./externalChannels";

const VALID_WEBHOOK = "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_";
const VALID_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

function config(patch: Partial<ExternalChannelsConfig> = {}): ExternalChannelsConfig {
    return { ...structuredClone(DEFAULT_EXTERNAL_CHANNELS), ...patch };
}

describe("the Discord webhook", () => {
    it("accepts a real webhook URL", () => {
        expect(validateDiscord({ webhookUrl: VALID_WEBHOOK, format: "minimal" })).toBeNull();
    });

    it("refuses a host that is not Discord's", () => {
        // The trader pastes this field, and a mis-paste is the one way alert
        // content reaches a server nobody intended. Pinning the host turns a
        // silent exfiltration into an error they can see.
        expect(
            validateDiscord({
                webhookUrl: "https://evil.example.com/api/webhooks/1/x",
                format: "minimal",
            }),
        ).toBe("webhookHost");
    });

    it("refuses plain http even on Discord's own host", () => {
        expect(
            validateDiscord({ webhookUrl: VALID_WEBHOOK.replace("https", "http"), format: "minimal" }),
        ).toBe("webhookHost");
    });

    it("refuses a Discord URL that is not a webhook path", () => {
        expect(
            validateDiscord({ webhookUrl: "https://discord.com/channels/1/2", format: "minimal" }),
        ).toBe("webhookShape");
    });

    it("refuses something that is not a URL at all", () => {
        expect(validateDiscord({ webhookUrl: "not a url", format: "minimal" })).toBe("webhookShape");
    });

    it("calls an empty field missing rather than malformed", () => {
        // The difference matters to the trader: one is "you have not finished",
        // the other is "what you typed is wrong".
        expect(validateDiscord({ webhookUrl: "   ", format: "minimal" })).toBe("missing");
    });
});

describe("the Telegram bot", () => {
    it("accepts a BotFather token with a numeric chat id", () => {
        expect(validateTelegram({ botToken: VALID_TOKEN, chatId: "-1001234567890" })).toBeNull();
    });

    it("accepts an @channelname", () => {
        expect(validateTelegram({ botToken: VALID_TOKEN, chatId: "@cachy_alerts" })).toBeNull();
    });

    it("refuses a token of the wrong shape", () => {
        expect(validateTelegram({ botToken: "nope", chatId: "123" })).toBe("botToken");
    });

    it("refuses a chat id that is neither a number nor an @name", () => {
        expect(validateTelegram({ botToken: VALID_TOKEN, chatId: "my chat" })).toBe("chatId");
    });
});

describe("the Mailgun e-mail channel", () => {
    const valid = {
        domain: "mg.example.com",
        apiKey: "key-0123456789",
        from: "alerts@example.com",
        to: "me@example.com",
    };

    it("accepts a complete configuration", () => {
        expect(validateEmail(valid)).toBeNull();
    });

    it("accepts several recipients across commas and newlines", () => {
        expect(validateEmail({ ...valid, to: "a@example.com,\nb@example.com" })).toBeNull();
        expect(splitRecipients("a@x.com, b@x.com\nc@x.com;")).toEqual([
            "a@x.com",
            "b@x.com",
            "c@x.com",
        ]);
    });

    it("refuses the whole list when one recipient is malformed", () => {
        // Mailgun rejects the entire send for one bad address, so accepting the
        // list here would turn a typo into a silently undelivered alarm.
        expect(validateEmail({ ...valid, to: "a@example.com, nonsense" })).toBe("email");
    });

    it("refuses a domain that is not one", () => {
        expect(validateEmail({ ...valid, domain: "not a domain" })).toBe("domain");
    });

    it("refuses a sender that is not an address", () => {
        expect(validateEmail({ ...valid, from: "alerts" })).toBe("email");
    });
});

describe("activation", () => {
    it("needs the switch and a valid configuration, not one of the two", () => {
        const configured = config({
            discord: { enabled: false, webhookUrl: VALID_WEBHOOK, format: "minimal" },
        });
        expect(isChannelActive(configured, "discord")).toBe(false);

        const on = config({
            discord: { enabled: true, webhookUrl: VALID_WEBHOOK, format: "minimal" },
        });
        expect(isChannelActive(on, "discord")).toBe(true);

        const onButEmpty = config({
            discord: { enabled: true, webhookUrl: "", format: "minimal" },
        });
        expect(isChannelActive(onButEmpty, "discord")).toBe(false);
    });

    it("ships every channel off", () => {
        for (const channel of ["email", "discord", "telegram"] as const) {
            expect(DEFAULT_EXTERNAL_CHANNELS[channel].enabled).toBe(false);
            expect(isChannelActive(DEFAULT_EXTERNAL_CHANNELS, channel)).toBe(false);
        }
    });
});

describe("the message body", () => {
    it("sends the line as-is when minimal", () => {
        expect(formatExternalMessage("BTCUSDT crossed 70000", "minimal", 0)).toBe(
            "BTCUSDT crossed 70000",
        );
    });

    it("adds a timestamp when detailed", () => {
        // An e-mail read twenty minutes later is a different thing from a toast:
        // without a time the trader cannot tell whether the level was touched
        // now or while they were asleep.
        const body = formatExternalMessage("crossed", "detailed", Date.UTC(2026, 8, 11, 20, 30));
        expect(body).toContain("crossed");
        expect(body).toContain("2026-09-11T20:30");
    });
});

describe("normalisation of a stored blob", () => {
    it("falls back to the defaults for anything missing", () => {
        expect(normalizeExternalChannels(null)).toEqual(DEFAULT_EXTERNAL_CHANNELS);
        expect(normalizeExternalChannels("nonsense")).toEqual(DEFAULT_EXTERNAL_CHANNELS);
    });

    it("keeps fields of the right type and drops the rest", () => {
        const result = normalizeExternalChannels({
            discord: { webhookUrl: VALID_WEBHOOK, enabled: "yes", format: 7 },
        });

        expect(result.discord.webhookUrl).toBe(VALID_WEBHOOK);
        // A string where a boolean belongs is discarded, not coerced: coercing
        // would switch a channel on because a stored value said "false".
        expect(result.discord.enabled).toBe(false);
        expect(result.discord.format).toBe("minimal");
    });

    it("keeps a cached chat list but drops malformed entries", () => {
        // `typeof [] === "object"`, so the generic field copy would have let any
        // object through. A malformed cache costs a dropdown; a malformed entry
        // rendered as a chat id costs an alert sent to the wrong place.
        const result = normalizeExternalChannels({
            telegram: {
                knownChats: [
                    { id: "-100123", name: "Alerts" },
                    { id: 777, name: "numeric id is not a string" },
                    null,
                    { id: "888" },
                ],
            },
        });

        expect(result.telegram.knownChats).toEqual([{ id: "-100123", name: "Alerts" }]);
    });

    it("treats a chat list that is not a list as no list", () => {
        expect(normalizeExternalChannels({ telegram: { knownChats: "nope" } }).telegram.knownChats)
            .toEqual([]);
    });

    it("pulls an unknown format back to minimal", () => {
        const result = normalizeExternalChannels({ discord: { format: "embed" } });
        expect(result.discord.format).toBe("minimal");
    });
});
