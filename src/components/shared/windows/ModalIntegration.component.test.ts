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
 * BUG-0671 — the seam between "a component mounted a ModalFrame" and "a frame
 * rendered in WindowContainer" was covered from both ends against a fake of
 * the other: `ModalFrame.component.test.ts` mocks the manager, the
 * account-switch test stubs `ModalFrame`, and the window tests render empty
 * content. So a dialog that never appeared, vanished during registration, or
 * died under the first press turned no test red — and BUG-0667 shipped two
 * defects through that gap.
 *
 * This mounts the real pair: a real `settings` window (its type is
 * `closeOnBlur`, which is what made registration sweep it), its content
 * mounting the real `ConfirmActionModal`, and the real `WindowContainer`
 * rendering both. Deliberately not mocked: `windowManager`, `ModalFrame`,
 * `WindowContainer`. Only the dictionary is stood in, because these assertions
 * are about rendering and stacking, not copy.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

import en from "../../../locales/locales/en.json";

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

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => message(key)),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowContainer from "./WindowContainer.svelte";
import ModalHostContent from "../../../tests/helpers/ModalHostContent.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import { Z_LAYERS } from "../../../lib/windows/zLayers";

/**
 * The real settings pane type: `closeOnBlur: true` and responsive below its
 * 768 px breakpoint. That combination is what produced both BUG-0667 halves —
 * the sweep closed the pane that mounted the dialog, and on a narrow viewport
 * the pane maximized itself above the compact dialog.
 */
class SettingsPaneWindow extends WindowBase {
    constructor() {
        super({ title: "Settings", windowType: "settings" });
    }

    get component() {
        return ModalHostContent;
    }
}

let host: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;

function render(): void {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(WindowContainer, { target: host });
    flushSync();
}

function buttonsIn(element: ParentNode): HTMLButtonElement[] {
    return Array.from(element.querySelectorAll<HTMLButtonElement>("button"));
}

function openSettingsPane(): SettingsPaneWindow {
    const pane = new SettingsPaneWindow();
    windowManager.open(pane);
    flushSync();
    return pane;
}

/** Clicks the pane's own button, which mounts the real confirm dialog. */
function openConfirm(): void {
    const button = buttonsIn(host).find(
        (candidate) => candidate.textContent?.trim() === "Open confirm",
    );
    if (!button) throw new Error("the settings pane rendered no open button");
    button.click();
    flushSync();
}

function frameOf(id: string): HTMLElement {
    const frame = host.querySelector<HTMLElement>(`[data-window-id="${id}"]`);
    if (!frame) throw new Error(`no frame rendered for window ${id}`);
    return frame;
}

function modalWindow() {
    const modal = windowManager.windows.find(
        (candidate) => candidate.windowType === "modal",
    );
    if (!modal) throw new Error("the confirm dialog registered no window");
    return modal;
}

function closeAllWindows(): void {
    for (const win of [...windowManager.windows]) {
        windowManager.close(win.id);
    }
    flushSync();
}

beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    window.innerWidth = 1024;
});

afterEach(() => {
    closeAllWindows();
    if (component) unmount(component);
    component = null;
    host?.remove();
    window.innerWidth = 1024;
});

describe("BUG-0671 — a real modal through the real window manager", () => {
    it("renders the dialog's content into the container above the pane that opened it", () => {
        render();
        const pane = openSettingsPane();
        openConfirm();

        const dialog = modalWindow();
        const dialogFrame = frameOf(dialog.id);

        // Rendered content, not a manager call: the facts the caller passed
        // are in the DOM, inside the container, with the dialog's own actions.
        expect(dialogFrame.textContent).toContain("Account");
        expect(dialogFrame.textContent).toContain("Second");
        expect(dialogFrame.textContent).toContain(
            message("settings.confirmations.dialog.confirm"),
        );

        // The pane that mounted it survived the registration sweep.
        expect(frameOf(pane.id)).not.toBeNull();
        expect(windowManager.windows.map((win) => win.id)).toContain(pane.id);
    });

    it("keeps the dialog mounted when the first press lands inside it", () => {
        render();
        const pane = openSettingsPane();
        openConfirm();

        const dialog = modalWindow();
        const confirmButton = buttonsIn(frameOf(dialog.id)).find(
            (candidate) =>
                candidate.textContent?.trim() ===
                message("settings.confirmations.dialog.confirm"),
        );
        if (!confirmButton) {
            throw new Error("the dialog rendered no confirm button");
        }

        // The manager's background handler listens for mousedown. A press
        // inside the dialog is not empty space; if it is read as such, the
        // sweep closes the dialog (and its host) before the click lands.
        confirmButton.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
        );
        flushSync();

        expect(frameOf(dialog.id)).not.toBeNull();
        expect(frameOf(pane.id)).not.toBeNull();

        // The press still reaches its own handler: confirming closes the
        // dialog instead of being swallowed.
        confirmButton.click();
        flushSync();

        expect(windowManager.windows.map((win) => win.id)).not.toContain(
            dialog.id,
        );
    });

    it("draws the dialog above the maximized pane that opened it", () => {
        // Below the settings type's 768 px breakpoint, so the pane maximizes
        // itself exactly as it did in the reported case. happy-dom defaults to
        // 1024 px, where the pane would stay floating.
        window.innerWidth = 700;

        render();
        const pane = openSettingsPane();
        expect(pane.isMaximized).toBe(true);

        openConfirm();
        const dialog = modalWindow();
        // A compact dialog opts out of the responsive fullscreen path.
        expect(dialog.isMaximized).toBe(false);

        const paneZ = Number(frameOf(pane.id).style.zIndex);
        const dialogZ = Number(frameOf(dialog.id).style.zIndex);

        expect(paneZ).toBeGreaterThanOrEqual(Z_LAYERS.windowMax);
        expect(dialogZ).toBeGreaterThanOrEqual(Z_LAYERS.modal);
        expect(dialogZ).toBeGreaterThan(paneZ);
    });
});
