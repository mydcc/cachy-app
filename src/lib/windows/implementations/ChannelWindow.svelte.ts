/*
  Copyright (C) 2026 MYDCT
  Channel Window Implementation (Space/Market Channels)
*/

import { WindowBase } from "../WindowBase.svelte";
import IframeView from "./IframeView.svelte";

export class ChannelWindow extends WindowBase {
    url: string;

    constructor(url: string, title = "Galaxy Chat", id?: string) {
        super({
            title,
            windowType: 'iframe'
        });
        if (id) this.id = id;
        this.url = url;
        this.aspectRatio = 16 / 9;

        if (typeof window !== 'undefined') {
            window.addEventListener('message', this.handleUnityMessage);
        }
    }

    private handleUnityMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'unity-info') {
            const { width, height } = event.data;
            if (width && height) {
                this.aspectRatio = width / height;
                this.updateSize(this.width, this.width / this.aspectRatio);
            }
        }
    };

    get component() {
        return IframeView;
    }

    get componentProps() {
        return { url: this.url };
    }
}
