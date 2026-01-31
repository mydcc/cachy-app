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

import { WindowBase } from "../WindowBase.svelte";
import DialogView from "./DialogView.svelte";

export class DialogWindow extends WindowBase {
    message = $state("");
    type: 'alert' | 'confirm' | 'prompt' = $state('alert');
    defaultValue = $state("");
    resolve: ((value: any) => void) | null = null;

    constructor(
        title: string,
        message: string,
        type: 'alert' | 'confirm' | 'prompt' = 'alert',
        defaultValue: string = "",
        resolve: (value: any) => void,
        options: any = {}
    ) {
        super({ title, windowType: 'dialog', ...options });
        this.message = message;
        this.type = type;
        this.defaultValue = defaultValue;
        this.resolve = resolve;
    }

    get component() {
        return DialogView;
    }

    closeWith(value: any) {
        if (this.resolve) {
            this.resolve(value);
            this.resolve = null; // Prevent double resolve
        }
    }

    // Handle destruction to ensure promises don't hang if closed externally
    destroy() {
        super.destroy(); // Call WindowBase destroy (removes resize listener)
        if (this.resolve) {
            this.resolve(false); // Resolve with false/cancel if destroyed without explicit closeWith
            this.resolve = null;
        }
    }
}
