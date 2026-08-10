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
  Symbol Picker Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import SymbolPickerView from "./SymbolPickerView.svelte";

export class SymbolPickerWindow extends WindowBase {
    // Matches DialogWindow.svelte.ts's resolve type: its one real caller,
    // stores/modal.svelte.ts's showModal(), constructs a Promise<boolean |
    // string> (see BUG-0009 / docs/TODO.md item 10 for the mismatch this
    // used to have with a null resolve value).
    resolve: ((value: boolean | string) => void) | null = null;

    constructor(resolve?: (value: boolean | string) => void) {
        super({
            title: "Symbol Selection",
            windowType: "symbolpicker"
        });
        if (resolve) this.resolve = resolve;
    }

    get component() {
        return SymbolPickerView;
    }

    closeWith(value: string) {
        if (this.resolve) {
            this.resolve(value);
            this.resolve = null;
        }
    }

    destroy() {
        super.destroy();
        if (this.resolve) {
            // Matches DialogWindow's cancel behavior: false, not null.
            this.resolve(false);
            this.resolve = null;
        }
    }
}
