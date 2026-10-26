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

import {
    STATIC_ENTRY_CONTEXT,
    getSurfaceEntries,
    type Entry,
} from "./entry-points";

/**
 * The journal's five chart-preset tabs, in registry order. The strip lives in
 * `JournalTabStrip`; `JournalDeepDive` renders a different ten-preset list
 * through the same dumb tab bar and is not part of this surface.
 */
export function getJournalTabEntries(): Entry[] {
    return getSurfaceEntries("journal-tabs", STATIC_ENTRY_CONTEXT).map(
        ({ entry }) => entry,
    );
}

/** The host-local tab id of a journal tab entry. */
export function getJournalTabId(entry: Entry): string {
    if (entry.opener.kind !== "tab") {
        throw new Error(`Journal tab ${entry.id} has no tab opener`);
    }
    return entry.opener.tabId;
}
