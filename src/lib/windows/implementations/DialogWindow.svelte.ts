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
 * `extraClasses` presets that need an actual size override, not just a CSS
 * class (BUG-0010). WindowFrame.svelte binds width/height as inline styles
 * (`style:width`/`style:height`), which always beat a class-based rule
 * regardless of specificity — and this.width/this.height also drive
 * WindowBase's own centering math, so a CSS-only override would leave the
 * dialog visually resized but positioned as if it were still the small
 * 'dialog' registry default. Mirrors how WindowRegistry's 'academy' entry
 * already approximates this same "80vw capped 1320px, 3:2" preset with
 * fixed pixels instead of relying on the (inert, for this reason) CSS class.
 */
const EXTRA_CLASS_SIZE_OVERRIDES: Record<string, { width: number; height: number }> = {
    "modal-size-instructions": { width: 1200, height: 800 },
};

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
        const sizeOverride = Object.entries(EXTRA_CLASS_SIZE_OVERRIDES)
            .find(([className]) => extraClasses.includes(className))?.[1];

        // 'dialog' is not in allowMultipleInstances, so every plain alert/
        // confirm/prompt shares one stable id ("dialog") -- and WindowBase
        // persists width/height to localStorage under that id by default
        // (no registry entry sets persistent: false for 'dialog'). Without
        // a distinct id here, the FIRST time this preset opens and resizes
        // to 1200x800, that size gets saved under the shared key and every
        // later plain alert/confirm/prompt restores it too, silently
        // breaking "unaffected" (verified live: reproduced exactly this
        // when the id wasn't separated, before landing on this fix).
        const sizeOverrideId = sizeOverride ? `dialog-${extraClasses}` : undefined;

        super({ title, windowType: 'dialog', id: sizeOverrideId, ...options });
        this.message = message;
        this.type = type;
        this.defaultValue = defaultValue;
        this.resolve = resolve;
        this.extraClasses = extraClasses;

        if (sizeOverride && !options.width && !options.height) {
            this.width = sizeOverride.width;
            this.height = sizeOverride.height;
        }
    }

    get component() {
        return DialogView;
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
