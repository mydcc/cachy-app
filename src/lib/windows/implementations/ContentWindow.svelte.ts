/*
  Copyright (C) 2026 MYDCT
  Generic Window for Svelte Components
*/

import { WindowBase } from "../WindowBase.svelte";

export class ContentWindow extends WindowBase {
    private _component: any;
    private _componentProps: any;

    constructor(component: any, title: string, options: any = {}) {
        super({ title, windowType: 'window', ...options });
        this._component = component;
        this._componentProps = options.props || {};
    }

    get component() {
        return this._component;
    }

    get componentProps() {
        return this._componentProps;
    }
}
