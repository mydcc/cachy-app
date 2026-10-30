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
 * Which channels a rule will actually use — FEAT-0748.
 *
 * Two authorities, one answer. The rule may narrow the local channels to the
 * ones the trader ticked and the external channels to the ones they picked.
 * The policy is the ceiling for external egress: a rule can never open a
 * channel the trader silenced or never configured. For the local channels the
 * specific choice on the rule outranks the category default (BUG-0750), but a
 * category switched off completely still wins — `notify()` refuses before it
 * reads the rule, so this resolver must refuse too or the footer promises a
 * channel that will stay silent.
 *
 * Pure on purpose: the footer, the Manage row, the test send and the firing
 * sink all need the same set, and four copies of the precedence is how they
 * drift. The caller supplies the policy and availability lookups.
 */

import {
    EXTERNAL_NOTIFICATION_CHANNELS,
    isLocalNotificationChannel,
    type LocalNotificationChannel,
} from "../notificationPolicy";
import type { ExternalChannelId } from "../notifications/externalChannels";
import type { TriggerMethod } from "../rules/types";

const LOCAL_BY_METHOD = new Map<TriggerMethod, LocalNotificationChannel>([
    ["in_app", "in-app"],
    ["browser", "browser"],
    ["sound", "sound"],
]);

const EXTERNAL_BY_METHOD = new Map<TriggerMethod, ExternalChannelId>([
    ["email", "email"],
    ["discord", "discord"],
    ["telegram", "telegram"],
]);

/**
 * What a rule asked for, separated by where it goes.
 *
 * `undefined` means "no opinion": every rule authored before FEAT-0393, and
 * every rule whose boxes are all unticked. `[]` never escapes this module —
 * an empty selection would otherwise read as "mute everything", which is the
 * opposite of what an unticked box means.
 */
export interface ChannelSelection {
    local: LocalNotificationChannel[] | undefined;
    external: ExternalChannelId[] | undefined;
}

/**
 * Reads `trigger_methods` defensively.
 *
 * A value this version does not recognise is skipped rather than trusted: the
 * field can arrive from a newer document, and inventing a channel from it
 * would be a delivery the trader never chose.
 */
export function channelSelection(
    methods: readonly unknown[] | undefined,
): ChannelSelection {
    const local: LocalNotificationChannel[] = [];
    const external: ExternalChannelId[] = [];

    for (const method of methods ?? []) {
        if (typeof method !== "string") continue;
        const localChannel = LOCAL_BY_METHOD.get(method as TriggerMethod);
        if (localChannel) {
            if (!local.includes(localChannel)) local.push(localChannel);
            continue;
        }
        const externalChannel = EXTERNAL_BY_METHOD.get(method as TriggerMethod);
        if (externalChannel && !external.includes(externalChannel)) {
            external.push(externalChannel);
        }
    }

    return {
        local: local.length > 0 ? local : undefined,
        external: external.length > 0 ? external : undefined,
    };
}

/** The channels that will carry an announcement, after both authorities. */
export interface EffectiveChannels {
    local: LocalNotificationChannel[];
    external: ExternalChannelId[];
}

export interface ChannelLookups {
    /** Whether the policy lets this category reach the channel. */
    wants: (channel: LocalNotificationChannel | ExternalChannelId) => boolean;
    /** Configured *and* switched on. */
    isActive: (channel: ExternalChannelId) => boolean;
    /**
     * Whether the whole category is off. Checked first, because that is what
     * `notify()` does; nothing below this line can override it.
     */
    categorySilent: boolean;
}

/**
 * Resolves a rule's selection against the policy and the device.
 *
 * Local: the rule's own ticks win; with none, the policy's locals apply.
 * External: the rule's picks win, but only where the policy also wants them
 * and the channel is active. With no external pick, the policy's active
 * external channels apply — the same answer a rule without the field got
 * before FEAT-0748.
 */
export function effectiveChannels(
    selection: ChannelSelection,
    lookups: ChannelLookups,
): EffectiveChannels {
    if (lookups.categorySilent) return { local: [], external: [] };

    const local = (
        selection.local ??
        (["in-app", "browser", "sound"] as const).filter((channel) =>
            lookups.wants(channel),
        )
    ).filter(isLocalNotificationChannel);

    // The list is typed as the whole channel union even though every member is
    // external; the cast is the same one `notificationService` makes.
    const external = (EXTERNAL_NOTIFICATION_CHANNELS as readonly ExternalChannelId[]).filter((channel) => {
        if (!lookups.wants(channel)) return false;
        if (selection.external && !selection.external.includes(channel)) return false;
        return lookups.isActive(channel);
    });

    return { local, external };
}

/** The trigger-method spelling of a delivery channel, for labels. */
export function methodForChannel(
    channel: LocalNotificationChannel | ExternalChannelId,
): TriggerMethod {
    if (channel === "in-app") return "in_app";
    return channel;
}

/** True when delivery would reach nothing at all. */
export function isSilentSet(channels: Pick<EffectiveChannels, "local" | "external">): boolean {
    return channels.local.length === 0 && channels.external.length === 0;
}
