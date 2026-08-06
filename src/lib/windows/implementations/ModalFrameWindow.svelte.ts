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
  instead of ModalFrame's old standalone overlay.
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

        // AcademyModal's "modal-size-instructions" sizing preset (80vw,
        // capped at 1320px, aspect-ratio 3:2). WindowFrame binds
        // width/height as inline styles, which always win over a
        // class-based CSS rule regardless of specificity, so the class's
        // own width/aspect-ratio (themes.css) no longer has any effect --
        // this computes the equivalent once, here, from the same class name.
        //
        // super() already centered x/y using the registry's default 800x600
        // before this constructor body ran, so changing width/height here
        // requires re-centering too, or the window ends up off-center for
        // its actual size.
        if (
            this.extraClasses.includes("modal-size-instructions") &&
            typeof window !== "undefined"
        ) {
            const width = Math.min(window.innerWidth * 0.8, 1320);
            this.width = width;
            this.height = width / 1.5; // aspect-ratio 3 / 2
            this.x = (window.innerWidth - this.width) / 2;
            this.y = (window.innerHeight - this.height) / 2;
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
