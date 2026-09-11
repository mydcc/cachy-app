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
 * External notification channels — FEAT-0397.
 *
 * Shapes, validation and message formatting for the three channels a trader can
 * point Cachy at: e-mail through Mailgun's HTTPS API, a Discord webhook, and a
 * Telegram bot. Sending is `services/externalDelivery.ts`; this module is pure.
 *
 * Three decisions the item left open are settled here, and each one is a
 * constraint of the browser rather than a preference:
 *
 *  - **No SMTP.** SMTP is a raw TCP protocol and a page has no socket. Of the
 *    providers the item names, only Mailgun answers a cross-origin preflight
 *    with `Access-Control-Allow-Origin: *`; Resend sends no CORS headers at all
 *    and SendGrid allows only its own documentation origin. So the e-mail
 *    channel is Mailgun's API, the trader owns the key, and the request is an
 *    ordinary HTTPS POST from the device.
 *
 *  - **No proxy for Telegram.** The Bot API does answer a cross-origin
 *    preflight, so the page can call it directly. That matters beyond
 *    convenience: a proxy would see the bot token, which would turn a Class A
 *    credential into something that leaves the device — an ADR-0001 question.
 *    Calling Telegram directly means the token only ever reaches Telegram.
 *
 *  - **Credentials are not encrypted, and are not described as such.** An app
 *    that can decrypt a credential unattended in order to send an alert keeps
 *    the key beside the ciphertext, and any script with same-origin access reads
 *    both. The alternative — a passphrase the trader types — means alarms cannot
 *    fire while the app is locked, which defeats the point of an alarm. So they
 *    are stored as they are and the settings UI says so. See ADR-0018.
 */

/** A channel that sends Class A content off this device, by the trader's choice. */
export type ExternalChannelId = "email" | "discord" | "telegram";

export const EXTERNAL_CHANNEL_IDS: readonly ExternalChannelId[] = [
    "email",
    "discord",
    "telegram",
] as const;

/** How much of the announcement goes into the message body. */
export type ExternalMessageFormat = "minimal" | "detailed";

export interface EmailChannelConfig {
    /** The Mailgun sending domain, e.g. `mg.example.com`. */
    domain: string;
    /** The trader's own Mailgun API key. */
    apiKey: string;
    from: string;
    to: string;
}

export interface DiscordChannelConfig {
    webhookUrl: string;
    format: ExternalMessageFormat;
}

/** A chat the bot has seen, as offered to the trader after a lookup. */
export interface TelegramChat {
    id: string;
    /** The chat's title or the user's name, for a list a human can choose from. */
    name: string;
}

export interface TelegramChannelConfig {
    botToken: string;
    /** A numeric chat id, or an `@channelname`. */
    chatId: string;
    /**
     * Chats the bot has seen, cached from the last lookup.
     *
     * Cached because Telegram only reports a chat while a recent message from it
     * is still in the bot's update queue: ask twice and the second answer can be
     * empty. A trader who looked the list up yesterday should still see it today,
     * rather than an empty dropdown that looks like a broken token.
     */
    knownChats: TelegramChat[];
}

export interface ExternalChannelsConfig {
    email: EmailChannelConfig & { enabled: boolean };
    discord: DiscordChannelConfig & { enabled: boolean };
    telegram: TelegramChannelConfig & { enabled: boolean };
}

export const DEFAULT_EXTERNAL_CHANNELS: ExternalChannelsConfig = {
    email: { enabled: false, domain: "", apiKey: "", from: "", to: "" },
    discord: { enabled: false, webhookUrl: "", format: "minimal" },
    telegram: { enabled: false, botToken: "", chatId: "", knownChats: [] },
};

/**
 * The only hosts a webhook may point at.
 *
 * The trader pastes this URL, so in principle it is theirs to choose — but a
 * mis-paste is the one way alert content reaches a server nobody intended, and
 * a webhook URL that is not Discord's is a mistake every time rather than a
 * use case. Pinning the host turns a silent exfiltration into a validation
 * error the trader can see.
 */
const DISCORD_WEBHOOK_HOSTS: readonly string[] = [
    "discord.com",
    "discordapp.com",
    "ptb.discord.com",
    "canary.discord.com",
];

export const TELEGRAM_API_ORIGIN = "https://api.telegram.org";
export const MAILGUN_API_ORIGIN = "https://api.mailgun.net";

/**
 * Why a configuration was refused, as an i18n key suffix.
 *
 * A key rather than a sentence: the reason is shown to the trader in their own
 * language, and a validator that returns English prose is how a message ends up
 * untranslated in the one screen where precision matters.
 */
export type ConfigProblem =
    | "missing"
    | "webhookHost"
    | "webhookShape"
    | "botToken"
    | "chatId"
    | "email"
    | "domain";

/**
 * Why a delivery attempt failed, as an i18n key suffix.
 *
 * Lives here beside `ConfigProblem` rather than in the sender, so that the log
 * entry, the UI and the sender all name the same six reasons — and so the
 * translation key is a checked literal rather than an interpolated string.
 */
export type FailureReason =
    | "notConfigured"
    | "network"
    | "timeout"
    | "unauthorized"
    | "rejected"
    | "rateLimited";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
/** BotFather issues `<numeric id>:<35-char secret>`. */
const BOT_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_ID_RE = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,})$/;

/** `null` when the Discord config could be sent as it stands. */
export function validateDiscord(config: DiscordChannelConfig): ConfigProblem | null {
    const url = config.webhookUrl.trim();
    if (!url) return "missing";

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return "webhookShape";
    }

    if (parsed.protocol !== "https:") return "webhookHost";
    if (!DISCORD_WEBHOOK_HOSTS.includes(parsed.hostname)) return "webhookHost";
    if (!parsed.pathname.startsWith("/api/webhooks/")) return "webhookShape";
    return null;
}

export function validateTelegram(config: TelegramChannelConfig): ConfigProblem | null {
    const token = config.botToken.trim();
    const chatId = config.chatId.trim();
    if (!token || !chatId) return "missing";
    if (!BOT_TOKEN_RE.test(token)) return "botToken";
    if (!CHAT_ID_RE.test(chatId)) return "chatId";
    return null;
}

export function validateEmail(config: EmailChannelConfig): ConfigProblem | null {
    const domain = config.domain.trim();
    if (!domain || !config.apiKey.trim() || !config.from.trim() || !config.to.trim()) {
        return "missing";
    }
    if (!DOMAIN_RE.test(domain)) return "domain";
    if (!EMAIL_RE.test(config.from.trim())) return "email";
    // One recipient per line or comma; every one of them has to be an address,
    // because a single malformed entry makes Mailgun reject the whole send.
    const recipients = splitRecipients(config.to);
    if (recipients.length === 0 || !recipients.every((r) => EMAIL_RE.test(r))) return "email";
    return null;
}

/** Splits the recipient field on commas, semicolons and newlines. */
export function splitRecipients(value: string): string[] {
    return value
        .split(/[,;\n]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

/** Whether this channel could be sent on right now — configured *and* switched on. */
export function isChannelActive(
    config: ExternalChannelsConfig,
    channel: ExternalChannelId,
): boolean {
    if (!config[channel].enabled) return false;
    return validateChannel(config, channel) === null;
}

export function validateChannel(
    config: ExternalChannelsConfig,
    channel: ExternalChannelId,
): ConfigProblem | null {
    if (channel === "discord") return validateDiscord(config.discord);
    if (channel === "telegram") return validateTelegram(config.telegram);
    return validateEmail(config.email);
}

/**
 * The message body.
 *
 * `detailed` adds the time, because an e-mail read twenty minutes later is a
 * different thing from a toast: without a timestamp the trader cannot tell
 * whether the level was touched now or while they were asleep.
 */
export function formatExternalMessage(
    message: string,
    format: ExternalMessageFormat,
    atMs: number,
): string {
    if (format === "minimal") return message;
    return `${message}\n\n${new Date(atMs).toISOString()} — Cachy`;
}

/** Fills missing fields from the defaults, like the notification policy does. */
export function normalizeExternalChannels(stored: unknown): ExternalChannelsConfig {
    const source = (stored ?? {}) as Record<string, unknown>;
    const result = structuredClone(DEFAULT_EXTERNAL_CHANNELS);

    for (const channel of EXTERNAL_CHANNEL_IDS) {
        const entry = source[channel];
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        const target = result[channel] as unknown as Record<string, unknown>;

        for (const [key, fallback] of Object.entries(target)) {
            const value = record[key];
            if (typeof value === typeof fallback) target[key] = value;
        }
    }

    // A format from a future version must not silently become the empty string.
    if (result.discord.format !== "detailed") result.discord.format = "minimal";

    /*
     * `knownChats` is an array, and `typeof []` is `"object"` — the loop above
     * would have copied any object through, including one that is not a list of
     * chats. Narrow it here, element by element: a malformed cache costs a
     * dropdown, while a malformed entry rendered as a chat id costs an alert
     * sent to the wrong place.
     */
    const storedTelegram = (source.telegram ?? {}) as Record<string, unknown>;
    result.telegram.knownChats = Array.isArray(storedTelegram.knownChats)
        ? storedTelegram.knownChats
              .filter(
                  (c): c is TelegramChat =>
                      typeof c === "object" &&
                      c !== null &&
                      typeof (c as TelegramChat).id === "string" &&
                      typeof (c as TelegramChat).name === "string",
              )
              .map((c) => ({ id: c.id, name: c.name }))
        : [];

    return result;
}
