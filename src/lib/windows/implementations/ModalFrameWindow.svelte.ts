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
    /** Dim the rest of the UI behind this window. Default true (modal
     *  convention); callers whose window is a monitoring surface -- not a
     *  blocking task -- turn it off so background tiles stay readable. */
    showBackdrop?: boolean;
    /** Initial window size in px. Omitted -> WindowBase's 640x480 default,
     *  which sits BELOW most desktop content breakpoints: wide-layout
     *  callers (e.g. the Market Dashboard) pass explicit values so their
     *  table layout does not open in its narrow fallback form. */
    width?: number;
    height?: number;
    /**
     * Content-sized dialog (BUG-0411). Skips the `modal` type's automatic
     * mobile fullscreen (`isResponsive` edge-to-edge below 768px) so a
     * small dialog stays a small centered dialog on phones too, and clamps
     * the explicit size to the viewport so a compact window can never
     * strand itself wider/taller than the screen. Non-compact callers
     * (e.g. the Market Dashboard) keep the registry behavior unchanged.
     */
    compact?: boolean;
    children?: Snippet;
    headerExtra?: Snippet;
}

export class ModalFrameWindow extends WindowBase {
    private _children?: Snippet;
    private _bodyClass: string;
    private _onCloseCallback?: () => void;
    private _compact: boolean;

    constructor(options: ModalFrameWindowOptions) {
        super({
            title: options.title,
            windowType: "modal",
            ...(options.width !== undefined ? { width: options.width } : {}),
            ...(options.height !== undefined
                ? { height: options.height }
                : {}),
        });

        this._children = options.children;
        this._bodyClass = options.bodyClass ?? "";
        this._onCloseCallback = options.onclose;
        this._compact = options.compact ?? false;
        if (this._compact && typeof window !== "undefined") {
            // A compact dialog is sized by its content, not by the
            // viewport: never take the responsive fullscreen path the
            // `modal` registry type applies below 768px.
            this.isResponsive = false;
            // BUG-0411: the explicit height below is only the fallback
            // until WindowFrame measures the rendered content once at
            // mount (before first paint) and fits the window to it.
            this.fitContentOnce = true;
            if (this.isMaximized) {
                // The base constructor already applied the responsive
                // maximize before this subclass could opt out; restore()
                // hands back the explicit size snapshotted beforehand.
                this.restore();
            }
            this.fitCompactToViewport();
            this.x = (window.innerWidth - this.width) / 2;
            this.y = (window.innerHeight - this.height) / 2;
            this.updatePosition(this.x, this.y);
        }
        this.extraClasses = options.extraClasses ?? "";
        // Overrides the registry default for the "modal" type (showBackdrop:
        // true). Set before first paint -- WindowContainer derives the dimming
        // layer from this flag reactively.
        this.showBackdrop = options.showBackdrop ?? true;

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

    /**
     * Clamps a compact dialog to the viewport with a small margin.
     * Shrink-only: a compact window never grows back beyond the explicit
     * size its caller passed, it just refuses to stick out of the screen
     * (rotation to a smaller viewport, split-screen). No-op on desktop,
     * where the explicit size already fits.
     */
    private fitCompactToViewport() {
        if (typeof window === "undefined" || this.isMaximized) return;
        this.updateSize(
            Math.min(this.width, window.innerWidth - 16),
            Math.min(this.height, window.innerHeight - 16),
        );
    }

    /** Re-clamps a compact dialog's size on viewport change, then applies
     * the shared position clamp. Non-compact windows delegate unchanged. */
    handleViewportResize() {
        if (this._compact) {
            this.fitCompactToViewport();
        }
        super.handleViewportResize();
    }
}
