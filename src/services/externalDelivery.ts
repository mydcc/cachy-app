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
 * Three HTTPS calls, each to a service the trader owns an account with. No
 * retries: the item says so, and it is right — an alert is about a moment, and a
 * message that arrives on the third attempt ninety seconds later describes a
 * price that has moved. What a failure gets instead is a reason in the log.
 *
 * Nothing here throws. A rejected `fetch`, a 401, an offline device: all of them
 * become a recorded outcome, because this runs from the alert evaluation loop and
 * an exception escaping it would stop every *other* rule from being evaluated —
 * the one failure mode worse than an undelivered message.
 */

import {
    formatExternalMessage,
    MAILGUN_API_ORIGIN,
    splitRecipients,
    TELEGRAM_API_ORIGIN,
    validateChannel,
    type ExternalChannelId,
    type ExternalChannelsConfig,
    type FailureReason,
    type TelegramChat,
} from "../lib/notifications/externalChannels";
import { externalChannelsStore } from "../stores/externalChannels.svelte";
import { externalDeliveryLog, type DeliveryOutcome } from "../stores/externalDeliveryLog.svelte";
import { logger } from "./logger";

/**
 * How long a send may take before it is abandoned.
 *
 * Bounded because an unbounded `fetch` on a captive-portal network never settles,
 * and a promise that never settles is a handle the log never gets an entry for —
 * which looks exactly like a message that was delivered.
 */
const SEND_TIMEOUT_MS = 10_000;

interface SendResult {
    ok: boolean;
    reason?: FailureReason;
    detail?: string;
}

/** `fetch` with a deadline, and every rejection turned into a reason. */
async function post(url: string, init: RequestInit): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (response.ok) return { ok: true };

        const reason: FailureReason =
            response.status === 401 || response.status === 403
                ? "unauthorized"
                : response.status === 429
                  ? "rateLimited"
                  : "rejected";

        // The provider's body is the only thing that explains a 400, and the
        // trader is the one who has to act on it. Bounded: a Discord error page
        // is not something to hold 50 copies of.
        let detail = `HTTP ${response.status}`;
        try {
            const text = await response.text();
            if (text) detail = `${detail} — ${text.slice(0, 200)}`;
        } catch {
            // A body that cannot be read leaves the status, which is enough.
        }
        return { ok: false, reason, detail };
    } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        return {
            ok: false,
            reason: aborted ? "timeout" : "network",
            detail: e instanceof Error ? e.message : undefined,
        };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Discord, through the webhook the trader pasted.
 *
 * The host was pinned at validation time — see `validateDiscord` — so by the
 * time a message gets here the URL cannot be pointing at an arbitrary server.
 */
async function sendDiscord(config: ExternalChannelsConfig, body: string): Promise<SendResult> {
    return post(config.discord.webhookUrl.trim(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: formatExternalMessage(body, config.discord.format, Date.now()),
        }),
    });
}

/**
 * Telegram, straight to the Bot API.
 *
 * The token sits in the path, which is Telegram's own design. It reaches
 * Telegram and nowhere else: there is no proxy in this call, which is what keeps
 * a Class A credential on the device's own terms (ADR-0018).
 */
async function sendTelegram(config: ExternalChannelsConfig, body: string): Promise<SendResult> {
    const token = encodeURIComponent(config.telegram.botToken.trim());
    return post(`${TELEGRAM_API_ORIGIN}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: config.telegram.chatId.trim(),
            text: body,
            disable_web_page_preview: true,
        }),
    });
}

/**
 * E-mail, through Mailgun's messages endpoint.
 *
 * Mailgun rather than SMTP because a page has no socket, and Mailgun rather than
 * Resend or SendGrid because it is the only one of the three that answers a
 * cross-origin request from a browser at all. The key is the trader's own and is
 * sent to Mailgun as HTTP basic auth, which is the scheme Mailgun defines.
 */
async function sendEmail(
    config: ExternalChannelsConfig,
    body: string,
    subject: string,
): Promise<SendResult> {
    const { domain, apiKey, from, to } = config.email;
    const form = new URLSearchParams();
    form.set("from", from.trim());
    form.set("to", splitRecipients(to).join(","));
    form.set("subject", subject);
    form.set("text", body);

    return post(`${MAILGUN_API_ORIGIN}/v3/${encodeURIComponent(domain.trim())}/messages`, {
        method: "POST",
        headers: {
            // `btoa` is safe here: an API key is ASCII by Mailgun's own format.
            Authorization: `Basic ${btoa(`api:${apiKey.trim()}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
    });
}

async function sendOn(
    channel: ExternalChannelId,
    body: string,
    subject: string,
): Promise<SendResult> {
    const config = externalChannelsStore.config;
    // Re-validated at send time rather than trusted from the UI: the trader can
    // edit a field between arming a rule and the rule firing.
    if (validateChannel(config, channel) !== null) {
        return { ok: false, reason: "notConfigured" };
    }

    if (channel === "discord") return sendDiscord(config, body);
    if (channel === "telegram") return sendTelegram(config, body);
    return sendEmail(config, body, subject);
}

/**
 * Sends on one channel and records what happened. Never rejects.
 *
 * Exported for the settings UI's "Test" button, which passes `test: true` — a
 * test must be distinguishable in the log from a real alert, or a trader
 * debugging a webhook cannot tell which entry is theirs.
 */
export async function deliverExternal(
    channel: ExternalChannelId,
    body: string,
    subject: string,
    test = false,
): Promise<DeliveryOutcome> {
    let result: SendResult;
    try {
        result = await sendOn(channel, body, subject);
    } catch (e) {
        // `sendOn` is written not to throw; this is the belt for the braces,
        // because the caller is an evaluation loop that must not stop.
        logger.warn("alerts", `[External] Sending on ${channel} threw`, e);
        result = { ok: false, reason: "network" };
    }

    const outcome: DeliveryOutcome = {
        channel,
        ok: result.ok,
        atMs: Date.now(),
        test,
        reason: result.reason,
        detail: result.detail,
    };
    externalDeliveryLog.record(outcome);

    if (!result.ok) {
        // The reason, never the credential: a log line naming a bot token is how
        // a Class A secret ends up in a screenshot.
        logger.warn(
            "alerts",
            `[External] ${channel} delivery failed (${result.reason ?? "unknown"})`,
        );
    }

    return outcome;
}

/**
 * Fires every channel the policy asked for, without waiting.
 *
 * Called from `notificationService.notify()`, which is synchronous and on the
 * market hot path. The promises are deliberately not awaited and deliberately
 * not returned: the loop must keep evaluating rules, and the outcome has a
 * destination of its own in `externalDeliveryLog`.
 */
export function dispatchExternal(
    channels: readonly ExternalChannelId[],
    body: string,
    subject: string,
): void {
    for (const channel of channels) {
        void deliverExternal(channel, body, subject);
    }
}


/**
 * Asks the bot which chats it has seen, so the trader can pick one.
 *
 * Finding a chat id by hand means reading Telegram's API docs, and a trader who
 * gets it wrong sends their alarms into a void. `getUpdates` is the only way a
 * bot can learn its own chats, with one catch worth knowing: Telegram keeps an
 * update for 24 hours and drops it once it has been read, so the honest contract
 * is "the chats that have messaged the bot recently", not "all chats". That is
 * why the result is cached rather than re-fetched — see `knownChats`.
 *
 * Returns the chats found, or `null` when the lookup itself failed. An empty
 * array is a different answer from a failure: it means "the token works, now
 * send your bot a message".
 */
export async function fetchTelegramChats(botToken: string): Promise<TelegramChat[] | null> {
    const token = encodeURIComponent(botToken.trim());
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
        const response = await fetch(`${TELEGRAM_API_ORIGIN}/bot${token}/getUpdates`, {
            signal: controller.signal,
        });
        if (!response.ok) return null;

        const body: unknown = await response.json();
        return extractChats(body);
    } catch (e) {
        // Never the token in the message: a log line carrying it is how a Class A
        // secret ends up in a screenshot.
        logger.warn("alerts", "[External] Telegram chat lookup failed", e instanceof Error ? e.message : e);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/** Pulls the distinct chats out of a `getUpdates` payload, defensively. */
function extractChats(body: unknown): TelegramChat[] | null {
    if (typeof body !== "object" || body === null) return null;
    const result = (body as { result?: unknown }).result;
    if (!Array.isArray(result)) return null;

    const chats = new Map<string, string>();
    for (const update of result) {
        // Telegram nests the chat under whichever update kind arrived, and a new
        // kind appearing must not break the lookup — so each shape is probed and
        // anything unrecognised is skipped rather than assumed.
        const candidates = [
            (update as { message?: { chat?: unknown } })?.message?.chat,
            (update as { channel_post?: { chat?: unknown } })?.channel_post?.chat,
            (update as { my_chat_member?: { chat?: unknown } })?.my_chat_member?.chat,
        ];

        for (const chat of candidates) {
            if (typeof chat !== "object" || chat === null) continue;
            const { id, title, username, first_name: firstName } = chat as {
                id?: unknown;
                title?: unknown;
                username?: unknown;
                first_name?: unknown;
            };
            if (typeof id !== "number" && typeof id !== "string") continue;

            const name =
                (typeof title === "string" && title) ||
                (typeof username === "string" && `@${username}`) ||
                (typeof firstName === "string" && firstName) ||
                String(id);
            chats.set(String(id), name);
        }
    }

    return [...chats].map(([id, name]) => ({ id, name }));
}
