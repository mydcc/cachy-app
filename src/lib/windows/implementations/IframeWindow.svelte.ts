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
  Iframe Window Implementation - All Flags Prepared
*/

import { WindowBase, type WindowSerializedState } from "../WindowBase.svelte";
import type { WindowOptions } from "../types";
import IframeView from "./IframeView.svelte";

export class IframeWindow extends WindowBase {
    url: string;

    constructor(url: string, title: string, options: WindowOptions = {}) {
        super({
            title,
            windowType: 'iframe',
            ...options
        });
        this.url = url;

        if (options.closeOnBlur !== undefined) {
            this.closeOnBlur = options.closeOnBlur;
        }
    }

    get component() {
        return IframeView;
    }

    get componentProps() {
        return {
            url: this.url,
            sandbox: "allow-scripts allow-same-origin allow-forms allow-popups",
            allow: "fullscreen"
        };
    }

    public serialize(): WindowSerializedState & { url: string } {
        return {
            ...super.serialize(),
            url: this.url
        };
    }
}
