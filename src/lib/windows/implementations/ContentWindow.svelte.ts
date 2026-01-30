/*
  Copyright (C) 2026 MYDCT
  Generic Window for Svelte Components
*/

import { WindowBase } from "../WindowBase.svelte";

export class ContentWindow extends WindowBase {
    private _component: any;

    constructor(component: any, title: string, options: any = {}) {
        super({ title, ...options });
        this._component = component;

        // Default settings for content windows
        this.showCachyIcon = options.showCachyIcon ?? true;
        this.allowZoom = options.allowZoom ?? true;
        this.allowFontSize = options.allowFontSize ?? true;
    }

    get component() {
        return this._component;
    }
}
