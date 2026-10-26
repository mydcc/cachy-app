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

function press(key: string): void {
    window.dispatchEvent(
        new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
        }),
    );
    flushSync();
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
        bravo.zIndex = 20;
        charlie.zIndex = 30;
        alpha.isFocused = false;
        bravo.isFocused = false;
        charlie.isFocused = true;

        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;
        const rows = options(target);

        expect(rows.map((row) => row.textContent?.trim())).toEqual([
            "Charlie",
            "Bravo",
            "Alpha",
        ]);
        expect(listbox.getAttribute("aria-activedescendant")).toBe(
            "window-switcher-option-1",
        );
        expect(rows[1].getAttribute("aria-selected")).toBe("true");
    });

    it("cycles with wrap and commits on Enter", async () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        const charlie = openWindow("switcher-c", "Charlie");
        alpha.zIndex = 10;
        bravo.zIndex = 20;
        charlie.zIndex = 30;
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
        expect(document.activeElement).toBe(frame);
    });

    it("restores a minimized window on commit", () => {
        const alpha = openWindow("switcher-a", "Alpha");
        const bravo = openWindow("switcher-b", "Bravo");
        alpha.zIndex = 10;
        bravo.zIndex = 20;
        alpha.isMinimized = true;
        alpha.isFocused = false;
        bravo.isFocused = true;

        const target = render();
        expect(options(target)[1].textContent).toContain("Minimized");

        press("Enter");

        expect(windowSwitcherState.isOpen).toBe(false);
        expect(alpha.isMinimized).toBe(false);
        expect(alpha.isFocused).toBe(true);
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

    it("traps Tab on the listbox", () => {
        openWindow("switcher-a", "Alpha");
        const target = render();
        const listbox = target.querySelector<HTMLElement>('[role="listbox"]')!;
        const outside = document.createElement("button");
        target.appendChild(outside);
        outside.focus();

        press("Tab");

        expect(document.activeElement).toBe(listbox);
    });

    it("excludes modal windows", () => {
        openWindow("switcher-a", "Alpha");
        openWindow("switcher-modal", "Modal", "modal");

        const target = render();
        const rows = options(target);

        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain("Alpha");
    });

    it("closes when a blocking window appears", () => {
        openWindow("switcher-a", "Alpha");
        render();

        openWindow("switcher-modal", "Modal", "modal");
        flushSync();

        expect(windowSwitcherState.isOpen).toBe(false);
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
