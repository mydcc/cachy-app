/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * The entry list for the keyboard window switcher. Kept out of the Svelte
 * component so the ordering and the modal/dialog exclusion are unit-testable
 * without mounting a window.
 */
export interface SwitchableWindow {
    windowType: string;
    zIndex: number;
}

/**
 * Modal and dialog windows are blocking tasks that own focus while open;
 * switching to a window behind one would look like a no-op. They are not
 * part of the ordinary overlap the switcher exists for.
 */
export function isSwitchableWindow(
    win: Pick<SwitchableWindow, "windowType">,
): boolean {
    return win.windowType !== "modal" && win.windowType !== "dialog";
}

/** Open windows in most-recently-focused-first order. */
export function getWindowSwitcherEntries<T extends SwitchableWindow>(
    windows: readonly T[],
): T[] {
    return windows
        .filter(isSwitchableWindow)
        .slice()
        .sort((a, b) => b.zIndex - a.zIndex);
}
