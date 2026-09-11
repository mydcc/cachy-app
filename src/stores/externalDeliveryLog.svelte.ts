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
 * External delivery log — FEAT-0397.
 *
 * What happened to the announcements that left the device, newest first. It
 * exists because `notify()` is synchronous and a `fetch` is not: the channel
 * list it returns cannot say whether Discord accepted the message, so the
 * outcome has to land somewhere the settings UI can read it.
 *
 * In memory only, and deliberately not persisted. A failed delivery matters
 * while the trader is looking at it; writing the reasons to disk would mean
 * keeping a record of which symbols were alerted on, next to the credentials,
 * for no benefit the trader asked for.
 */

import type {
    ExternalChannelId,
    FailureReason,
} from "../lib/notifications/externalChannels";

export interface DeliveryOutcome {
    channel: ExternalChannelId;
    ok: boolean;
    atMs: number;
    /** Whether this was a "Test" press rather than a real announcement. */
    test: boolean;
    /** i18n key suffix under `settings.externalChannels.failures`. */
    reason?: FailureReason;
    /** The provider's own words, for a trader pasting it into a support ticket. */
    detail?: string;
}

/**
 * Enough to see a pattern, few enough not to be a leak.
 *
 * The same bound `notificationService` puts on its duplicate map, for the same
 * reason: a session that runs for a week must not grow an array forever.
 */
const MAX_ENTRIES = 50;

class ExternalDeliveryLog {
    private _entries = $state<DeliveryOutcome[]>([]);

    public get entries(): DeliveryOutcome[] {
        return this._entries;
    }

    /** The most recent outcome per channel, for the settings UI's status line. */
    public latest(channel: ExternalChannelId): DeliveryOutcome | undefined {
        return this._entries.find((e) => e.channel === channel);
    }

    public get failureCount(): number {
        return this._entries.filter((e) => !e.ok).length;
    }

    /** Newest first — new array, never a push into the rendered one. */
    public record(outcome: DeliveryOutcome): void {
        this._entries = [outcome, ...this._entries].slice(0, MAX_ENTRIES);
    }

    public clear(): void {
        this._entries = [];
    }
}

export const externalDeliveryLog = new ExternalDeliveryLog();
