/*
  Copyright (C) 2026 MYDCT
  News Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import NewsSentimentPanel from "../../../components/shared/NewsSentimentPanel.svelte";

export class NewsFrameWindow extends WindowBase {
    constructor(title = "Market News") {
        super({
            title,
            windowType: "news"
        });
    }

    get component() {
        return NewsSentimentPanel;
    }
}
