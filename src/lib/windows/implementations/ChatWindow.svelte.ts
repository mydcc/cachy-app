import { WindowBase } from "../WindowBase.svelte";
import ChatTestView from "./ChatTestView.svelte";

export class ChatWindow extends WindowBase {
    constructor(title = "Global Chat") {
        super({ title, width: 350, height: 450, x: 150, y: 150 });
    }

    get component() {
        return ChatTestView;
    }
}
