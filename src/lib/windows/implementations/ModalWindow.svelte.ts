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

/*
  Copyright (C) 2026 MYDCT
  Modal Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";

export class ModalWindow extends WindowBase {
    private _component: any;
    backdrop = $state(true);

    constructor(component: any, title: string, options: any = {}) {
        super({ title, windowType: 'modal', ...options });
        this._component = component;
        this.backdrop = options.backdrop ?? true;
    }

    get component() {
        return this._component;
    }
}
