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
    // Left as `any`: this class calls resolve with a string (closeWith,
    // e.g. from SymbolPickerView.svelte's selectSymbol) or null (destroy,
    // on close-without-selection) — but its one real caller,
    // stores/modal.svelte.ts's showModal(), constructs a Promise<boolean |
    // string>, whose resolve type has no null case. See docs/TODO.md item
    // 10 for that mismatch; narrowing the type here would just relocate
    // the error to that unrelated call site rather than fix it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolve: ((value: any) => void) | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(resolve?: (value: any) => void) {
        super({
            title: "Symbol Selection",
            windowType: "symbolpicker"
        });
        if (resolve) this.resolve = resolve;
    }

    get component() {
        return SymbolPickerView;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    closeWith(value: any) {
        if (this.resolve) {
            this.resolve(value);
            this.resolve = null;
        }
    }

    destroy() {
        super.destroy();
        if (this.resolve) {
            this.resolve(null); // Resolve with null/false if closed without selection
            this.resolve = null;
        }
    }
}
