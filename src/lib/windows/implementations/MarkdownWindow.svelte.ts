/*
  Copyright (C) 2026 MYDCT
  Markdown Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import MarkdownView from "./MarkdownView.svelte";

export class MarkdownWindow extends WindowBase {
    content: string;

    constructor(content: string, title: string, options: any = {}) {
        super({
            title,
            windowType: options.windowType ?? 'modal',
            ...options
        });
        this.content = content;
    }

    get component() {
        return MarkdownView;
    }
}
