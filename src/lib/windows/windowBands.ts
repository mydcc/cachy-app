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

import type { WindowType } from "./types";

/**
 * Window types that own the reserved top band (`Z_LAYERS.modal`) and must
 * stay above keep-above windows: blocking modals, promise dialogs
 * (alert/confirm/prompt) and the promise-based symbol picker. Keeping any of
 * them behind a keep-above window would leave a pending promise unanswerable.
 *
 * One predicate so the manager's band assignment, the frame's z-index bind and
 * the header-toggle exclusion cannot drift apart (FEAT-0742).
 */
export function isReservedBandWindow(windowType: WindowType): boolean {
    return (
        windowType === "modal" ||
        windowType === "dialog" ||
        windowType === "symbolpicker"
    );
}
