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
 * BUG-0716 — the cancel path through the real dialog.
 *
 * `HeaderPresetActions.component.test.ts` mocks `modalState`, so it proves the
 * component honours a `false` answer but not that the dialog produces one.
 * This mounts the real store, the real `DialogWindow` and the real
 * `WindowContainer`: the header click opens the dialog, the dialog's own "No"
 * closes it, and the action the user declined must not have happened.
 *
 * `modalState` and `DialogView` are deliberately not mocked. Only the
 * dictionary is stood in, for the labels the assertions read.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../locales/locales/en.json";

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

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => message(key)),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowContainer from "../shared/windows/WindowContainer.svelte";
import HeaderPresetActions from "./HeaderPresetActions.svelte";
import { windowManager } from "../../lib/windows/WindowManager.svelte";
import { presetState } from "../../stores/preset.svelte";
import { tradeState } from "../../stores/trade.svelte";
import { CONSTANTS } from "../../lib/constants";

const STORAGE_KEY = CONSTANTS.LOCAL_STORAGE_PRESETS_KEY;

let host: HTMLDivElement;
let container: ReturnType<typeof mount> | null = null;
let actions: ReturnType<typeof mount> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    container = mount(WindowContainer, { target: host });
    actions = mount(HeaderPresetActions, { target: host });
    flushSync();
}

function control(id: string): HTMLButtonElement {
    const element = host.querySelector<HTMLButtonElement>(`#${id}`);
    if (!element) throw new Error(`no #${id} rendered`);
    return element;
}

function dialogId(): string {
    const dialog = windowManager.windows.find(
        (win) => win.windowType === "dialog",
    );
    if (!dialog) throw new Error("the confirm dialog did not open");
    return dialog.id;
}

/** Clicks the real dialog's "No", i.e. `handleConfirm(false)`. */
async function declineDialog(): Promise<void> {
    const frame = host.querySelector<HTMLElement>(
        `[data-window-id="${dialogId()}"]`,
    );
    if (!frame) throw new Error("the dialog rendered no frame");
    const no = Array.from(frame.querySelectorAll("button")).find(
        (button) =>
            button.textContent?.trim() ===
            message("dashboard.customModal.noButton"),
    );
    if (!no) throw new Error('the dialog rendered no "No" button');
    no.click();
    flushSync();
    // The handler resumes after its `await`; assert only once it has.
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
}

function storedPresetNames(): string[] {
    return Object.keys(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"));
}

beforeEach(() => {
    localStorage.clear();
    presetState.selectedPreset = "";
    tradeState.entryPrice = "";
});

afterEach(() => {
    // Tear the view down before closing windows, so a dialog teardown cannot
    // re-register a window for the next test (BUG-0671's leak).
    if (actions) unmount(actions);
    actions = null;
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

describe("BUG-0716 — declining the real dialog cancels the action", () => {
    it("keeps every trade-form field when the reset is declined", async () => {
        tradeState.entryPrice = "123";
        render();

        control("reset-btn").click();
        flushSync();
        expect(windowManager.windows.map((win) => win.windowType)).toContain(
            "dialog",
        );

        await declineDialog();

        expect(tradeState.entryPrice).toBe("123");
    });

    it("keeps the selected preset when the delete is declined", async () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ Mine: { entryPrice: "1" } }),
        );
        presetState.selectedPreset = "Mine";
        render();

        control("delete-preset-btn").click();
        flushSync();
        expect(windowManager.windows.map((win) => win.windowType)).toContain(
            "dialog",
        );

        await declineDialog();

        expect(storedPresetNames()).toContain("Mine");
    });
});
