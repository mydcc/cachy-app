/*
  Copyright (C) 2026 MYDCT
  Symbol Picker Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import SymbolPickerView from "./SymbolPickerView.svelte";

export class SymbolPickerWindow extends WindowBase {
    constructor() {
        super({
            title: "Symbol Selection",
            windowType: "symbolpicker"
        });
    }

    get component() {
        return SymbolPickerView;
    }
}
