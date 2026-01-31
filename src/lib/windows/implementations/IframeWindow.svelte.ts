/*
  Copyright (C) 2026 MYDCT
  Iframe Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class IframeWindow extends WindowBase {
    url: string;

    constructor(url: string, title: string, options: any = {}) {
        super({
            title,
            windowType: 'iframe',
            ...options
        });
        this.url = url;

        if (options.closeOnBlur !== undefined) {
            this.closeOnBlur = options.closeOnBlur;
        }
    }

    get component() {
        return IframeView;
    }

    get componentProps() {
        return { url: this.url };
    }
}
