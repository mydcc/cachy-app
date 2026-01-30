/*
  Copyright (C) 2026 MYDCT
  Modal Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";

export class ModalWindow extends WindowBase {
    private _component: any;
    backdrop = $state(true);

    constructor(component: any, title: string, options: any = {}) {
        super({ title, ...options });
        this._component = component;
        this.windowType = 'modal';
        this.backdrop = options.backdrop ?? true;

        // Modals are usually centered by default
        if (options.x === undefined && options.y === undefined && typeof window !== 'undefined') {
            this.x = (window.innerWidth - this.width) / 2;
            this.y = (window.innerHeight - this.height) / 2;
        }

        this.showCachyIcon = options.showCachyIcon ?? true;
        this.isResizable = options.isResizable ?? false; // Modals often fixed size
        this.isDraggable = options.isDraggable ?? true;
    }

    get component() {
        return this._component;
    }
}
