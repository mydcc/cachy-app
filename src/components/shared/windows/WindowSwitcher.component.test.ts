// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, flushSync, tick } from "svelte";
import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import WindowSwitcher from "./WindowSwitcher.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import { windowSwitcherState } from "../../../stores/windowSwitcher.svelte";
import EmptyStub from "../../../tests/helpers/EmptyStub.svelte";

class TestWindow extends WindowBase {
    constructor(
        id: string,
        title: string,
        windowType: "chart" | "modal" | "dialog" = "chart",
    ) {
        super({ id, title, windowType });
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: ReturnType<typeof mount> | null = null;

function openWindow(
    id: string,
    title: string,
    windowType: "chart" | "modal" | "dialog" = "chart",
): TestWindow {
    const win = new TestWindow(id, title, windowType);
    windowManager.open(win);
    return win;
}

function render(): HTMLElement {
    host = document.createElement("div");
    document.body.appendChild(host);
    windowSwitcherState.open();
    component = mount(WindowSwitcher, { target: host });
    flushSync();
    return host;
}

function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
    });
    window.dispatchEvent(event);
    flushSync();
    return event;
}

function pressOn(target: EventTarget, key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    flushSync();
    return event;
}

function optionTitles(target: HTMLElement): (string | undefined)[] {
    return Array.from(
        target.querySelectorAll<HTMLElement>(".switcher-option-title"),
    ).map((element) => element.textContent?.trim());
}

function options(target: HTMLElement): HTMLElement[] {
    return Array.from(target.querySelectorAll<HTMLElement>('[role="option"]'));
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    windowSwitcherState.close();
    for (const win of [...windowManager.windows]) {
        windowManager.close(win.id);
    }
    host?.remove();
    host = null;
    localStorage.clear();
});

describe("FEAT-0737: the keyboard window switcher", () => {
    it("lists the most recent window first and starts on the next one", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        const charlie = openWindow("switcher-c", "Charlie");
        alpha.zIndex = 10;
        alpha.lastFocusOrder = 10;
        bravo.zIndex = 20;
        bravo.lastFocusOrder = 20;
        charlie.zIndex = 30;
        charlie.lastFocusOrder = 30;
        alpha.isFocused = false;
        bravo.isFocused = false;
        charlie.isFocused = true;

        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;
        const rows = options(target);

        expect(optionTitles(target)).toEqual(["Charlie", "Bravo", "Alpha"]);
        expect(listbox.getAttribute("aria-activedescendant")).toBe(
            "window-switcher-option-1",
        );
        expect(rows[0].getAttribute("aria-selected")).toBe("false");
        expect(rows[1].getAttribute("aria-selected")).toBe("true");
        expect(rows[0].textContent).toContain("Current");
        expect(document.activeElement).toBe(listbox);
    });

    it("selects the only window when the list has one entry", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        alpha.isFocused = true;

        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;
        const rows = options(target);

        expect(rows).toHaveLength(1);
        expect(listbox.getAttribute("aria-activedescendant")).toBe(
            "window-switcher-option-0",
        );
        expect(rows[0].getAttribute("aria-selected")).toBe("true");

        press("Enter");

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(alpha.isFocused).toBe(true);
    });

    it("wraps from the oldest focused window to the newest", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        const charlie = openWindow("switcher-c", "Charlie");
        alpha.zIndex = 10;
        alpha.lastFocusOrder = 10;
        bravo.zIndex = 20;
        bravo.lastFocusOrder = 20;
        charlie.zIndex = 30;
        charlie.lastFocusOrder = 30;
        alpha.isFocused = true;
        bravo.isFocused = false;
        charlie.isFocused = false;

        const target = render();

        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-0");
    });

    it("cycles with wrap and commits on Enter", async () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        const charlie = openWindow("switcher-c", "Charlie");
        alpha.zIndex = 10;
        alpha.lastFocusOrder = 10;
        bravo.zIndex = 20;
        bravo.lastFocusOrder = 20;
        charlie.zIndex = 30;
        charlie.lastFocusOrder = 30;
        alpha.isFocused = false;
        bravo.isFocused = false;
        charlie.isFocused = true;

        const target = render();
        const frame = document.createElement("div");
        frame.className = "window-frame";
        frame.dataset.windowId = "switcher-a";
        frame.tabIndex = -1;
        target.appendChild(frame);

        press("ArrowDown");
        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-2");
        expect(alpha.zIndex).toBe(10);
        expect(charlie.zIndex).toBe(30);
        expect(alpha.isFocused).toBe(false);

        press("ArrowDown");
        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-0");

        press("ArrowUp");
        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-2");

        press("Enter");
        await tick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(alpha.isFocused).toBe(true);
        expect(alpha.zIndex).toBeGreaterThan(charlie.zIndex);
        expect(document.activeElement).toBe(frame);
    });

    it("commits the selected window on Space and on a row click", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        const charlie = openWindow("switcher-c", "Charlie");
        alpha.zIndex = 10;
        alpha.lastFocusOrder = 10;
        bravo.zIndex = 20;
        bravo.lastFocusOrder = 20;
        charlie.zIndex = 30;
        charlie.lastFocusOrder = 30;
        alpha.isFocused = false;
        bravo.isFocused = false;
        charlie.isFocused = true;

        const target = render();
        press(" ");
        expect(windowSwitcherState.isOpen).toBe(false);
        expect(bravo.isFocused).toBe(true);

        windowSwitcherState.open();
        flushSync();
        options(target)[2].click();
        flushSync();

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(alpha.isFocused).toBe(true);
        expect(alpha.zIndex).toBeGreaterThan(charlie.zIndex);
    });

    it("moves to Home and End", () => {
        openWindow("switcher-a", "Alpha");
        openWindow("switcher-b", "Bravo");
        openWindow("switcher-c", "Charlie");
        const target = render();

        press("End");
        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-2");

        press("Home");
        expect(
            target
                .querySelector('[role="listbox"]')
                ?.getAttribute("aria-activedescendant"),
        ).toBe("window-switcher-option-0");
    });

    it("restores a minimized window on commit and focuses the floating frame", async () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        alpha.zIndex = 10;
        alpha.lastFocusOrder = 10;
        bravo.zIndex = 20;
        bravo.lastFocusOrder = 20;
        alpha.isMinimized = true;
        alpha.isFocused = false;
        bravo.isFocused = true;

        const target = render();
        const dock = document.createElement("div");
        dock.className = "minimized-dock";
        const dockFrame = document.createElement("div");
        dockFrame.className = "window-frame";
        dockFrame.dataset.windowId = "switcher-a";
        dockFrame.tabIndex = -1;
        dock.appendChild(dockFrame);
        target.appendChild(dock);

        const floatingFrame = document.createElement("div");
        floatingFrame.className = "window-frame";
        floatingFrame.dataset.windowId = "switcher-a";
        floatingFrame.tabIndex = -1;
        target.appendChild(floatingFrame);

        expect(options(target)[1].textContent).toContain("Minimized");

        press("Enter");
        await tick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(alpha.isMinimized).toBe(false);
        expect(alpha.isFocused).toBe(true);
        expect(document.activeElement).toBe(floatingFrame);
    });

    it("closes on Escape and on the backdrop", () => {
        openWindow("switcher-a", "Alpha");
        const target = render();

        press("Escape");
        expect(windowSwitcherState.isOpen).toBe(false);

        windowSwitcherState.open();
        flushSync();
        target.querySelector<HTMLButtonElement>(".switcher-backdrop")!.click();
        flushSync();
        expect(windowSwitcherState.isOpen).toBe(false);
    });

    it("returns focus to the opener on Escape", async () => {
        const outside = document.createElement("button");
        document.body.appendChild(outside);
        outside.focus();

        openWindow("switcher-a", "Alpha");
        render();

        press("Escape");
        await tick();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.activeElement).toBe(outside);
        outside.remove();
    });

    it("does not run the window manager's Escape close behind the overlay", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        alpha.closeOnBlur = true;
        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;

        pressOn(listbox, "Escape");

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(
            windowManager.windows.some((win) => win.id === "switcher-a"),
        ).toBe(true);
    });

    it("traps Tab on the listbox and suppresses the global hotkey path", () => {
        openWindow("switcher-a", "Alpha");
        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;
        const outside = document.createElement("button");
        target.appendChild(outside);
        outside.focus();

        const bubble = vi.fn();
        window.addEventListener("keydown", bubble);
        const tab = pressOn(listbox, "Tab");
        window.removeEventListener("keydown", bubble);

        expect(document.activeElement).toBe(listbox);
        expect(tab.defaultPrevented).toBe(true);
        expect(bubble).not.toHaveBeenCalled();
    });

    it("excludes modal windows", () => {
        openWindow("switcher-a", "Alpha");
        openWindow("switcher-modal", "Modal", "modal");

        const target = render();
        const rows = options(target);

        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain("Alpha");
    });

    it("does not treat a click inside the switcher as a background click", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        alpha.closeOnBlur = true;
        const target = render();
        const backdrop = target.querySelector(".switcher-backdrop")!;
        const root = target.querySelector(".switcher-root")!;

        target
            .querySelector(".switcher-panel")!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        flushSync();
        expect(
            windowManager.windows.some((win) => win.id === "switcher-a"),
        ).toBe(true);
        expect(windowSwitcherState.isOpen).toBe(true);

        backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        flushSync();
        expect(
            windowManager.windows.some((win) => win.id === "switcher-a"),
        ).toBe(true);

        root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        flushSync();
        expect(
            windowManager.windows.some((win) => win.id === "switcher-a"),
        ).toBe(true);

        // Positive control: the same click outside the overlay still closes
        // the window, so the guard is not a no-op.
        document.body.dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true }),
        );
        flushSync();
        expect(
            windowManager.windows.some((win) => win.id === "switcher-a"),
        ).toBe(false);
    });

    it("closes when a blocking window appears", () => {
        openWindow("switcher-a", "Alpha");
        render();

        openWindow("switcher-modal", "Modal", "modal");
        flushSync();

        expect(windowSwitcherState.isOpen).toBe(false);
    });

    it("does not add a window opened while the overlay is open", () => {
        openWindow("switcher-a", "Alpha");
        const target = render();
        expect(options(target)).toHaveLength(1);

        openWindow("switcher-b", "Bravo");
        flushSync();

        expect(options(target)).toHaveLength(1);
    });

    it("does not commit a window that closed while the overlay was open", () => {
        openWindow("switcher-a", "Alpha");
        openWindow("switcher-b", "Bravo");
        render();

        windowManager.close("switcher-a");
        flushSync();

        expect(() => press("Enter")).not.toThrow();
        expect(windowSwitcherState.isOpen).toBe(false);
    });

    it("removes its keyboard listener when unmounted", () => {
        openWindow("switcher-a", "Alpha");
        render();

        unmount(component!);
        component = null;
        windowSwitcherState.open();

        press("Escape");

        expect(windowSwitcherState.isOpen).toBe(true);
    });

    it("names the dialog and exposes the keyboard hint", () => {
        openWindow("switcher-a", "Alpha");
        const target = render();
        const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!;

        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.getAttribute("aria-labelledby")).toBe(
            "window-switcher-title",
        );
        expect(target.textContent).toContain("Switch window");
        expect(target.textContent).toContain("Enter switch");
    });
});
