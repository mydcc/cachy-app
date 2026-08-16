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
    description?: string;
    source?: string;
    published_at?: string;

    constructor(
        url: string,
        title: string,
        options: WindowOptions & {
            showOpenInNewTab?: boolean;
            description?: string;
            source?: string;
            published_at?: string;
        } = {}
    ) {
        super({
            title,
            windowType: 'iframe',
            ...options
        });
        this.url = url;
        this.description = options.description;
        this.source = options.source;
        this.published_at = options.published_at;

        if (options.closeOnBlur !== undefined) {
            this.closeOnBlur = options.closeOnBlur;
        }

        if (options.showOpenInNewTab) {
            if (!this.headerButtons.includes("openInNewTab")) {
                this.headerButtons = [...this.headerButtons, "openInNewTab"];
            }
        }
    }

    override onHeaderOpenInNewTab() {
        if (this.url) {
            window.open(this.url, "_blank", "noopener,noreferrer");
        }
    }

    get component() {
        return IframeView;
    }

    get componentProps() {
        return {
            window: this,
            url: this.url,
            description: this.description,
            source: this.source,
            published_at: this.published_at,
            sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads allow-modals",
            allow: "fullscreen; clipboard-write; encrypted-media; picture-in-picture; web-share"
        };
    }

    public serialize(): WindowSerializedState & { url: string } {
        return {
            ...super.serialize(),
            url: this.url
        };
    }
}
