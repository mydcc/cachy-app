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
  Backing WindowBase for the ModalFrame adapter (FEAT-0044). Renders whatever
  Snippet ModalFrame.svelte's `children` prop was given, through WindowFrame
  instead of ModalFrame's old standalone overlay. Current callers:
  MarketDashboardModal and TpSlEditModal (Academy moved to its own
  AcademyWindow in FEAT-0045, no longer routing through ModalFrame).
*/

import type { Snippet } from "svelte";
import { WindowBase } from "../WindowBase.svelte";
import ModalFrameContent from "../../../components/shared/windows/ModalFrameContent.svelte";

export interface ModalFrameWindowOptions {
    title: string;
    onclose?: () => void;
    /** "top" is a best-effort approximation: WindowFrame positions windows
     * by absolute x/y, not flexbox alignment, so this nudges the initial y
     * toward the top of the viewport rather than centering it. Nothing in
     * the app currently passes "top". */
    alignment?: "center" | "top";
    extraClasses?: string;
    bodyClass?: string;
    children?: Snippet;
    headerExtra?: Snippet;
}

export class ModalFrameWindow extends WindowBase {
    private _children?: Snippet;
    private _bodyClass: string;
    private _onCloseCallback?: () => void;

    constructor(options: ModalFrameWindowOptions) {
        super({ title: options.title, windowType: "modal" });

        this._children = options.children;
        this._bodyClass = options.bodyClass ?? "";
        this._onCloseCallback = options.onclose;
        this.extraClasses = options.extraClasses ?? "";

        if (options.headerExtra) {
            this.headerSnippet = options.headerExtra;
            this.showHeaderIndicators = true;
        }

        if (options.alignment === "top" && typeof window !== "undefined") {
            this.y = window.innerHeight * 0.1;
        }
    }

    get component() {
        return ModalFrameContent;
    }

    get componentProps() {
        return { children: this._children, bodyClass: this._bodyClass };
    }

    /** Fires the caller's onclose regardless of how the window closed --
     * its own close button, Escape, or a click on the backdrop. */
    destroy() {
        super.destroy();
        this._onCloseCallback?.();
    }
}
