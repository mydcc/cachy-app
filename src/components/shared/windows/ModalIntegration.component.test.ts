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
 * user-visible defects through that gap.
 *
 * This mounts the real pair: a real `settings` window (its type is
 * `closeOnBlur`, which is what made registration sweep it), its content
 * mounting the real `ConfirmActionModal`, and the real `WindowContainer`
 * rendering both. Deliberately not mocked: `windowManager`, `ModalFrame`,
 * `WindowContainer`. Only the dictionary is stood in, because these assertions
 * are about rendering and stacking, not copy.
 *
 * `data-window-id` on the frame and the inline `z-index` are the DOM contract
 * this file reads. Renaming either is a deliberate break, not an accident: in
 * happy-dom they are the only observable identity and stacking hooks.
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

/** `$(key, { values })`: the headings carry a placeholder. */
function t(key: string, values?: Record<string, unknown>): string {
    const template = message(key);
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in values ? String(values[name]) : whole,
    );
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable(
            (key: string, options?: { values?: Record<string, unknown> }) =>
                t(key, options?.values),
        ),
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
 * 768 px breakpoint. That combination is what produced BUG-0667 — the sweep
 * closed the pane that mounted the dialog, and on a narrow viewport the pane
 * maximized itself above the compact dialog.
 *
 * The explicit id is deliberate: the settings type is a singleton, so a stale
 * window from a failed test would otherwise be matched silently and the new
 * one never registered. With a private id, `frameOf` throws by name instead.
 */
class SettingsPaneWindow extends WindowBase {
    constructor() {
        super({
            id: "bug-0671-settings",
            title: "Settings",
            windowType: "settings",
        });
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
    const modals = windowManager.windows.filter(
        (candidate) => candidate.windowType === "modal",
    );
    if (modals.length !== 1) {
        throw new Error(`expected one modal window, found ${modals.length}`);
    }
    return modals[0];
}

/**
 * A real press fires `pointerdown` first and `mousedown` after it, and they
 * reach two different handlers: the frame's own `bringToFront` (where the
 * BUG-0667 sweep decision lives) and the manager's background listener. A
 * `mousedown` alone never runs the first one, which is why this dispatches the
 * sequence instead of one event.
 */
function pressInside(element: Element): void {
    element.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    (element as HTMLElement).focus();
    flushSync();
}

function windowIds(): string[] {
    return windowManager.windows.map((win) => win.id);
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
    // Tear the view down first: closing windows while the container still
    // renders them lets `ModalFrame`'s teardown re-register the host pane, so
    // the next test would silently reuse this one's window.
    if (component) unmount(component);
    component = null;
    flushSync();
    closeAllWindows();
    host?.remove();
    window.innerWidth = 1024;
    expect(
        windowManager.windows,
        "the window manager still holds windows after teardown",
    ).toHaveLength(0);
});

describe("BUG-0671 — a real modal through the real window manager", () => {
    it("renders the dialog's content into the container above the pane that opened it", () => {
        render();
        const pane = openSettingsPane();
        openConfirm();

        // AC2, registration half — checked before the dialog lookup so a sweep
        // regression is reported as "the pane was swept", not as a missing
        // dialog.
        expect(windowIds()).toContain(pane.id);
        expect(host.querySelector(`[data-window-id="${pane.id}"]`)).not.toBeNull();

        const dialog = modalWindow();
        const dialogFrame = frameOf(dialog.id);

        // AC4 — rendered content, not a manager call: the facts the caller
        // passed are in the DOM, and the dialog's own action is a real button.
        expect(dialogFrame.textContent).toContain("Account");
        expect(dialogFrame.textContent).toContain("Second");
        expect(
            buttonsIn(dialogFrame).map((button) => button.textContent?.trim()),
        ).toContain(t("settings.confirmations.dialog.confirm"));

        // The backdrop belongs to the dialog, above the pane it dims.
        const backdrop = host.querySelector<HTMLElement>(".window-backdrop");
        expect(backdrop).not.toBeNull();
    });

    it("keeps the dialog mounted when the first press lands inside it", () => {
        render();
        const pane = openSettingsPane();
        openConfirm();

        const dialog = modalWindow();
        const confirmButton = buttonsIn(frameOf(dialog.id)).find(
            (candidate) =>
                candidate.textContent?.trim() ===
                t("settings.confirmations.dialog.confirm"),
        );
        if (!confirmButton) {
            throw new Error("the dialog rendered no confirm button");
        }

        pressInside(confirmButton);

        // AC2, pointer-down half. Both guards are needed to survive this: the
        // frame root carries `.window-frame` **and** `.glass-panel`, so either
        // check alone protects the same press.
        expect(host.querySelector(`[data-window-id="${pane.id}"]`)).not.toBeNull();
        expect(
            host.querySelector(`[data-window-id="${dialog.id}"]`),
        ).not.toBeNull();
        expect(windowIds()).toContain(dialog.id);

        // The press reaches its own handler: confirming closes the dialog.
        confirmButton.click();
        flushSync();

        expect(host.querySelector(`[data-window-id="${dialog.id}"]`)).toBeNull();
        expect(host.querySelector(`[data-window-id="${pane.id}"]`)).not.toBeNull();

        // Positive control: the same `mousedown` on empty space *does* close
        // the pane. Without it, this test would also pass if the event never
        // reached the listener at all — a guard cannot be proven by silence.
        document.body.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
        );
        flushSync();

        expect(windowIds()).not.toContain(pane.id);
    });

    it("draws the dialog above the maximized pane that opened it", () => {
        // Well below the settings type's 768 px breakpoint, so the pane
        // maximizes itself exactly as it did in the reported case. happy-dom
        // defaults to 1024 px, where the pane would stay floating. The margin
        // keeps a legitimate breakpoint tweak from turning this red.
        window.innerWidth = 500;

        render();
        const pane = openSettingsPane();
        expect(pane.isMaximized).toBe(true);

        openConfirm();
        const dialog = modalWindow();
        // A compact dialog opts out of the responsive fullscreen path.
        expect(dialog.isMaximized).toBe(false);

        const paneZ = Number(frameOf(pane.id).style.zIndex);
        const dialogZ = Number(frameOf(dialog.id).style.zIndex);

        // AC3 — the pane is in the ordinary maximized band, the dialog in the
        // reserved modal band. Both bounds matter: `>= windowMax` alone would
        // also pass if the pane were silently moved into the modal band.
        expect(paneZ).toBeGreaterThanOrEqual(Z_LAYERS.windowMax);
        expect(paneZ).toBeLessThan(Z_LAYERS.modal);
        expect(dialogZ).toBeGreaterThanOrEqual(Z_LAYERS.modal);
        expect(dialogZ).toBeLessThan(Z_LAYERS.switcher);
        expect(dialogZ).toBeGreaterThan(paneZ);
    });
});
