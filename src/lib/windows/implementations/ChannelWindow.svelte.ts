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

/**
 * ChannelWindow is a specialized window for rendering external content
 * (typically Unity-based 3D views or social feeds) via an iframe.
 * 
 * Features:
 * - Dynamic aspect ratio synchronization via cross-document messaging.
 * - Persistent configuration based on title or custom ID.
 */
export class ChannelWindow extends WindowBase {
    /** The target URL for the iframe content. */
    url: string;

    constructor(url: string, title = "Galaxy Chat", id?: string, options: any = {}) { // i18n-ignore
        super({
            title,
            windowType: 'iframe',
            ...options
        });

        // Stabilize ID for context-specific channels.
        if (id) this.id = id;
        this.url = url;

        // Default to common widescreen ratio.
        this.aspectRatio = 16 / 9;

        // Listen for communication from the embedded application.
        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleUnityMessage);
        }
    }

    /**
     * Handles messages from the embedded iframe content (e.g., Unity).
     * Specifically looks for 'unity-info' messages to update the window's
     * aspect ratio to match the required content dimensions.
     */
    private handleUnityMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'unity-info') {
            const { width, height } = event.data;
            if (width && height) {
                this.aspectRatio = width / height;
                // Force a resize calculation to apply the new ratio immediately.
                this.updateSize(this.width, this.width / this.aspectRatio);
            }
        }
    };

    /** The UI component used to display the iframe. */
    get component() {
        return IframeView;
    }

    /** Mapping of logic parameters to component props. */
    get componentProps() {
        return { url: this.url };
    }
}
