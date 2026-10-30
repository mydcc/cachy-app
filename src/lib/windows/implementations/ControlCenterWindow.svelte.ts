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
 * FEAT-0749 — backing WindowBase for the alerts-and-bots control center.
 *
 * A plain WindowBase, not a docked panel: the desk is opened when the trader
 * wants to *operate*, and it should be placeable where the chart leaves room
 * rather than pinned to one edge. The registry owns size, centring and the
 * non-modal flags (no backdrop, no close-on-blur), so this class stays as
 * small as the window it opens.
 */

import { WindowBase } from "../WindowBase.svelte";
import ControlCenterView from "../../../components/alerts/controlcenter/ControlCenterView.svelte";

export interface ControlCenterWindowOptions {
    title: string;
}

export class ControlCenterWindow extends WindowBase {
    constructor(options: ControlCenterWindowOptions) {
        super({ title: options.title, windowType: "controlcenter" });
    }

    get component() {
        return ControlCenterView;
    }

    get componentProps() {
        return {};
    }
}
