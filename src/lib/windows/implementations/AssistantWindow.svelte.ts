/*
  Copyright (C) 2026 MYDCT
  Assistant Window Implementation
*/

import { WindowBase } from "../WindowBase.svelte";
import AssistantView from "./AssistantView.svelte";
import { settingsState } from "../../../stores/settings.svelte";
import { aiState } from "../../../stores/ai.svelte";
import { notesState } from "../../../stores/notes.svelte";
import { chatState } from "../../../stores/chat.svelte";
import { _ } from "../../../locales/i18n";
import { get } from "svelte/store";

export class AssistantWindow extends WindowBase {
    constructor(title = "Assistant") {
        super({
            title,
            windowType: "assistant"
        });

        // Assistant specific overrides
        this.headerAction = 'toggle-mode';
        this.headerButtons = ['export', 'delete'];
        this.pinSide = 'left';
        this.doubleClickBehavior = 'pin';
        this.allowFontSize = true;
        this.allowZoom = true;
    }

    override get title() {
        const mode = settingsState.sidePanelMode;
        const labels: Record<string, string> = {
            ai: "AI Assistant",
            notes: "Quick Notes",
            chat: "Global Chat"
        };
        return labels[mode] || "Assistant";
    }

    override set title(value: string) {
        // Den Titel des Assistant-Fensters lassen wir nur über den Modus steuern.
        // Falls die Basisklasse versucht den Titel zu setzen, ignorieren wir dies hier.
    }

    get component() {
        return AssistantView;
    }

    // --- INTERACTIVE HOOKS ---

    onHeaderTitleClick() {
        this.cycleMode();
    }

    onHeaderExport() {
        this.exportChat();
    }

    onHeaderDelete() {
        this.clearHistory();
    }

    cycleMode() {
        const modes: ("ai" | "notes" | "chat")[] = ["ai", "notes", "chat"];
        const currentIdx = modes.indexOf(settingsState.sidePanelMode);
        const nextIdx = (currentIdx + 1) % modes.length;
        settingsState.sidePanelMode = modes[nextIdx];
    }

    exportChat() {
        let content = "";
        const mode = settingsState.sidePanelMode;
        if (mode === "ai") {
            content = aiState.messages
                .map(m => `${m.role === "user" ? "YOU" : "AI"} (${new Date(m.timestamp).toLocaleString()}):\n${m.content}\n`)
                .join("\n---\n\n");
        } else if (mode === "notes") {
            content = notesState.messages
                .map(m => `${new Date(m.timestamp).toLocaleString()}:\n${m.text}\n`)
                .join("\n---\n\n");
        } else {
            content = chatState.messages
                .map(m => `${m.senderId === "me" ? "YOU" : "USER"} (${m.profitFactor ? "PF: " + m.profitFactor.toFixed(2) : "N/A"}) (${new Date(m.timestamp).toLocaleString()}):\n${m.text}\n`)
                .join("\n---\n\n");
        }

        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cachy-assistant-export-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }

    clearHistory() {
        const mode = settingsState.sidePanelMode;
        // Use svelte-i18n $_ directly if possible, or fallback
        const msg = "Clear history?";

        if (settingsState.aiConfirmClear) {
            if (confirm(msg)) {
                this._doClear(mode);
            }
        } else {
            this._doClear(mode);
        }
    }

    private _doClear(mode: string) {
        if (mode === "ai") aiState.clearHistory();
        else if (mode === "notes") notesState.clearNotes();
        else chatState.clearHistory();
    }
}
