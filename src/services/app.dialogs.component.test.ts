// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * BUG-0761 — the service layer handed `modalState.show` translation keys
 * instead of copy, so the journal-reset confirmation and the save-preset
 * prompt rendered `modals.*` literally. Every component call site already
 * passes translated text; `app.clearJournal` and `app.savePreset` were the two
 * outliers.
 *
 * The store, the dialog and the window frame are real here — the assertion is
 * about what reaches the screen, not about which arguments were passed. Only
 * the dictionary is stood in, so the expected sentences are readable in the
 * test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../locales/locales/en.json";

function message(key: string): string {
    const value = key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        );
    if (typeof value !== "string") {
        throw new Error(`missing i18n key: ${key}`);
    }
    return value;
}

vi.mock("../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => message(key)),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowContainer from "../components/shared/windows/WindowContainer.svelte";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { app } from "./app";

let host: HTMLDivElement;
let container: ReturnType<typeof mount> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = mount(WindowContainer, { target: host });
    flushSync();
}

function dialogFrame(): HTMLElement {
    const dialog = windowManager.windows.find(
        (win) => win.windowType === "dialog",
    );
    if (!dialog) throw new Error("the dialog did not open");
    const frame = host.querySelector<HTMLElement>(
        `[data-window-id="${dialog.id}"]`,
    );
    if (!frame) throw new Error("the dialog rendered no frame");
    return frame;
}

function dialogTitle(): string {
    const title = dialogFrame().querySelector<HTMLElement>(".window-title");
    if (!title) throw new Error("the dialog rendered no title");
    return title.textContent?.trim() ?? "";
}

function dialogBody(): string {
    const body = dialogFrame().querySelector<HTMLElement>(
        ".dialog-content .message",
    );
    if (!body) throw new Error("the dialog rendered no message");
    return body.textContent?.trim() ?? "";
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    if (container) unmount(container);
    container = null;
    flushSync();
    for (const win of [...windowManager.windows]) windowManager.close(win.id);
    flushSync();
    host?.remove();
    expect(
        windowManager.windows,
        "the window manager still holds windows after teardown",
    ).toHaveLength(0);
});

describe("BUG-0761 — service dialogs show sentences, not translation keys", () => {
    it("titles and explains the journal reset in the active language", () => {
        render();
        void app.clearJournal();
        flushSync();

        expect(dialogTitle()).toBe(message("modals.clearJournal.title"));
        expect(dialogBody()).toBe(message("modals.clearJournal.message"));
    });

    it("prompts for the preset name in the active language", () => {
        render();
        void app.savePreset();
        flushSync();

        expect(dialogTitle()).toBe(message("modals.savePreset.title"));
        expect(dialogBody()).toBe(message("modals.savePreset.prompt"));
    });
});
