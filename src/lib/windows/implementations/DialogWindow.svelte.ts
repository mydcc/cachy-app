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
import type { WindowOptions } from "../types";

/**
 * Promise dialogs (alert/confirm/prompt via modalState.show) follow the
 * same content-sized principle as ModalFrameWindow's compact dialogs
 * (BUG-0411): 450 wide per the 'dialog' registry default, height measured
 * once at mount by WindowFrame, never mobile-fullscreen, clamped to the
 * viewport. No per-dialog sizing — every caller gets this behavior.
 */
export class DialogWindow extends WindowBase {
    message = $state("");
    type: 'alert' | 'confirm' | 'prompt' = $state('alert');
    defaultValue = $state("");
    resolve: ((value: boolean | string) => void) | null = null;

    constructor(
        title: string,
        message: string,
        type: 'alert' | 'confirm' | 'prompt' = 'alert',
        defaultValue: string = "",
        resolve: (value: boolean | string) => void,
        extraClasses: string = "",
        options: WindowOptions = {}
    ) {
        super({ title, windowType: 'dialog', ...options });
        this.message = message;
        this.type = type;
        this.defaultValue = defaultValue;
        this.resolve = resolve;
        this.extraClasses = extraClasses;

        // A promise dialog is sized by its content, not by the viewport:
        // never take the responsive fullscreen path the `dialog` registry
        // type applies below 768px. The registry 450x250 stays the
        // fallback until WindowFrame's one-shot fit lands before paint.
        this.isResponsive = false;
        this.fitContentOnce = true;
        if (typeof window !== "undefined") {
            if (this.isMaximized) {
                // The base constructor already applied the responsive
                // maximize before this subclass could opt out; restore()
                // hands back the size snapshotted beforehand.
                this.restore();
            }
            this.fitDialogToViewport();
            this.x = (window.innerWidth - this.width) / 2;
            this.y = (window.innerHeight - this.height) / 2;
            this.updatePosition(this.x, this.y);
        }
    }

    get component() {
        return DialogView;
    }

    /**
     * Clamps a dialog to the viewport with a small margin. Shrink-only:
     * never grows back beyond the registry size, just refuses to stick
     * out of the screen (rotation to a smaller viewport, split-screen).
     */
    private fitDialogToViewport() {
        if (typeof window === "undefined" || this.isMaximized) return;
        this.updateSize(
            Math.min(this.width, window.innerWidth - 16),
            Math.min(this.height, window.innerHeight - 16),
        );
    }

    /** Re-clamps the dialog's size on viewport change, then applies the
     * shared position clamp. */
    handleViewportResize() {
        this.fitDialogToViewport();
        super.handleViewportResize();
    }

    closeWith(value: boolean | string) {
        if (this.resolve) {
            this.resolve(value);
            this.resolve = null; // Prevent double resolve
        }
    }

    // Handle destruction to ensure promises don't hang if closed externally
    destroy() {
        super.destroy();
        if (this.resolve) {
            this.resolve(false); // Resolve with false/cancel if destroyed without explicit closeWith
            this.resolve = null;
        }
    }
}
