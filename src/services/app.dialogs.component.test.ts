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
 * the dictionary is stood in, and its translator is swappable, so the German
 * case proves the copy comes from the dictionaries rather than from a literal
 * that happens to match English.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../locales/locales/en.json";
import de from "../locales/locales/de.json";
import { message, messageFrom } from "../tests/helpers/i18nMessages";

/** Swapped per test; the module samples it on every translation. */
const dictionary = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock("../locales/i18n", async () => {
    const { i18nModule } = await import("../tests/helpers/i18nMessages");
    return i18nModule(() => dictionary.current);
});

import WindowContainer from "../components/shared/windows/WindowContainer.svelte";
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { app } from "./app";

let host: HTMLDivElement | null = null;
let container: ReturnType<typeof mount> | null = null;
let pending: Promise<unknown> | null = null;

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
    const frame =
        host?.querySelector<HTMLElement>(`[data-window-id="${dialog.id}"]`) ??
        null;
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
    // WindowManager rehydrates from sessionStorage and persists on every open;
    // dialogs are excluded today, but the isolation should not rest on that.
    sessionStorage.clear();
    dictionary.current = en;
});

afterEach(async () => {
    if (container) unmount(container);
    container = null;
    flushSync();
    for (const win of [...windowManager.windows]) windowManager.close(win.id);
    flushSync();
    host?.remove();
    host = null;
    expect(
        windowManager.windows,
        "the window manager still holds windows after teardown",
    ).toHaveLength(0);
    if (pending) {
        // Closing an unanswered dialog must settle its promise (BUG-0422);
        // a test that never answers must not leak a hanging call site. The
        // services are `async`, so settlement is all the caller can observe.
        await expect(
            pending,
            "the unanswered dialog promise must settle on teardown",
        ).resolves.toBeUndefined();
        pending = null;
    }
});

describe("BUG-0761 — service dialogs show sentences, not translation keys", () => {
    it("titles and explains the journal reset in the active language", () => {
        render();
        pending = app.clearJournal();
        flushSync();

        expect(dialogTitle()).toBe(message("modals.clearJournal.title"));
        expect(dialogBody()).toBe(message("modals.clearJournal.message"));
    });

    it("prompts for the preset name in the active language", () => {
        render();
        pending = app.savePreset();
        flushSync();

        expect(dialogTitle()).toBe(message("modals.savePreset.title"));
        expect(dialogBody()).toBe(message("modals.savePreset.prompt"));
    });

    it("reads the copy from the dictionary, not from a matching literal", () => {
        dictionary.current = de;
        render();
        pending = app.clearJournal();
        flushSync();

        expect(dialogTitle()).toBe(
            messageFrom("modals.clearJournal.title", de),
        );
        expect(dialogBody()).toBe(
            messageFrom("modals.clearJournal.message", de),
        );
    });
});
