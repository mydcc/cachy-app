/*
  Copyright (C) 2026 MYDCT
  Chat Window Implementation - All Flags Prepared
*/

import { WindowBase } from "../WindowBase.svelte";
import ChatTestView from "./ChatTestView.svelte";

export class ChatWindow extends WindowBase {
    constructor(title = "Global Chat") {
        super({
            title,
            windowType: "chatbox"
        });
    }

    get component() {
        return ChatTestView;
    }
}
