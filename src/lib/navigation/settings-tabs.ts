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

/** The settings window's eight rail tabs, in registry order. */
export function getSettingsTabEntries(): Entry[] {
    return getSurfaceEntries("settings-rail", STATIC_ENTRY_CONTEXT).map(
        ({ entry }) => entry,
    );
}

/** The host-local tab id of a settings rail entry. */
export function getSettingsTabId(entry: Entry): string {
    if (entry.opener.kind !== "tab") {
        throw new Error(`Settings tab ${entry.id} has no tab opener`);
    }
    return entry.opener.tabId;
}
