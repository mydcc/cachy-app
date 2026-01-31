/*
  Copyright (C) 2026 MYDCT
  Modal Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";

export class ModalWindow extends WindowBase {
    private _component: any;
    backdrop = $state(true);

    constructor(component: any, title: string, options: any = {}) {
        super({ title, windowType: 'modal', ...options });
        this._component = component;
        this.backdrop = options.backdrop ?? true;
    }

    get component() {
        return this._component;
    }
}
