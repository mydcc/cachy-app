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
  Channel Window Implementation (Space/Market Channels)
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class ChannelWindow extends WindowBase {
    url: string;

    constructor(url: string, title = "Galaxy Chat", id?: string) {
        super({
            title,
            windowType: 'iframe'
        });
        if (id) this.id = id;
        this.url = url;
        this.aspectRatio = 16 / 9;

        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleUnityMessage);
        }
    }

    private handleUnityMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'unity-info') {
            const { width, height } = event.data;
            if (width && height) {
                this.aspectRatio = width / height;
                this.updateSize(this.width, this.width / this.aspectRatio);
            }
        }
    };

    get component() {
        return IframeView;
    }

    get componentProps() {
        return { url: this.url };
    }
}
