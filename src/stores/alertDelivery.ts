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

/**
 * Trying a rule's channels without waiting for the market — FEAT-0748.
 *
 * A test goes through the same delivery service a fired rule does, so it proves
 * the path rather than a preview. It is labelled as a test in the body and the
 * external delivery log, and it touches no rule state: no `fired_count`, no
 * anchor, no `enabled` flip. That is the difference between a test and a dry
 * run of the real alarm, and a test that spends a `once` rule would be the
 * worst possible trade.
 */

import { get } from "svelte/store";
import { _ } from "../locales/i18n";
import { channelSelection, effectiveChannels, type EffectiveChannels } from "../lib/alerts/effectiveChannels";
import type { ExternalChannelId } from "../lib/notifications/externalChannels";
import type { RuleDocument } from "../lib/rules/types";
import { firingMessage } from "./alerts.svelte";
import { externalChannelsStore } from "./externalChannels.svelte";
import { notificationPolicyStore } from "./notifications.svelte";
import { notificationService } from "../services/notificationService.svelte";

/** The channels this rule would use, after the policy and the device. */
export function ruleEffectiveChannels(rule: RuleDocument): EffectiveChannels {
    return effectiveChannels(channelSelection(rule.trigger_methods), {
        wants: (channel) => notificationPolicyStore.wants("alert-fired", channel),
        isActive: (channel) => externalChannelsStore.isActive(channel),
        categorySilent: notificationPolicyStore.isSilent("alert-fired"),
    });
}

/** What one test press actually did. */
export interface TestAnnouncementOutcome {
    /** Local channels the service delivered on, synchronously. */
    delivered: string[];
    /** External channels that were dispatched; their result arrives later. */
    external: ExternalChannelId[];
    /** The service's duplicate window swallowed the press. */
    duplicate: boolean;
}

/**
 * Sends one labelled test announcement to exactly that set.
 *
 * The event id is stable per rule so the service's duplicate window applies:
 * pressing the button twice in a minute sends once. That is the rate limit the
 * item proposes — a second throttle would be a second thing to get wrong.
 *
 * The outcome is explicit because a button that always says "sent" lies twice:
 * once when the duplicate window suppressed it, and once when the only
 * channels are asynchronous and have not answered yet.
 */
export function sendTestAnnouncement(rule: RuleDocument): TestAnnouncementOutcome {
    const t = get(_) as (key: string, options?: Record<string, unknown>) => string;
    const channels = ruleEffectiveChannels(rule);
    const body = t("dashboard.alerts.testAnnouncement", {
        values: { message: firingMessage(rule) },
    });

    const outcome = notificationService.notifyDetailed({
        category: "alert-fired",
        eventId: `test:${rule.id}`,
        message: body,
        tone: "info",
        localChannels: channels.local,
        externalChannels: channels.external,
        exactChannels: true,
        test: true,
    });

    return {
        delivered: outcome.delivered,
        external: channels.external,
        duplicate: outcome.duplicate,
    };
}
