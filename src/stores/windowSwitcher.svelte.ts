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
 * Visibility of the keyboard window switcher overlay. The hotkey action and
 * the mounted component share this one rune; the overlay itself snapshots
 * the window list when it mounts, so opening/closing is enough state.
 */
class WindowSwitcherState {
    isOpen = $state(false);

    open(): void {
        this.isOpen = true;
    }

    close(): void {
        this.isOpen = false;
    }

    toggle(): void {
        this.isOpen = !this.isOpen;
    }
}

export const windowSwitcherState = new WindowSwitcherState();
