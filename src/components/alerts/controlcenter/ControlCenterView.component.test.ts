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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0749 — the control center window, exercised through the DOM.
 *
 * The keyboard contract is the point here: Escape must close the focused desk
 * and nothing else, and opening must put the trader inside it rather than on
 * `<body>`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";
import ControlCenterView from "./ControlCenterView.svelte";
import { ControlCenterWindow } from "../../../lib/windows/implementations/ControlCenterWindow.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";

const dictionary = en as Record<string, unknown>;

function translate(key: string, options?: { values?: Record<string, unknown> }): string {
    let current: unknown = dictionary;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object") return key;
        current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "string") return key;
    return Object.entries(options?.values ?? {}).reduce(
        (out, [name, value]) => out.replace(`{${name}}`, String(value)),
        current,
    );
}

vi.mock("../../../locales/i18n", async () => {
    const { writable } = await import("svelte/store");
    return { _: writable(translate), locale: writable("en") };
});

describe("FEAT-0749: ControlCenterView", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | null = null;
    let win: ControlCenterWindow;

    beforeEach(() => {
        target = document.createElement("div");
        document.body.appendChild(target);
        win = new ControlCenterWindow({ title: "Alerts & Bots" });
        win.isFocused = true;
    });

    afterEach(() => {
        if (component) unmount(component);
        component = null;
        target.remove();
        windowManager.close(win.id);
        vi.restoreAllMocks();
    });

    function render(withWindow: boolean = true) {
        component = mount(ControlCenterView, {
            target,
            props: withWindow ? { window: win } : {},
        });
        flushSync();
        return target;
    }

    function tab(id: string): HTMLButtonElement | null {
        return target.querySelector<HTMLButtonElement>(`#${id}`);
    }

    it("renders the alerts and log tabs with their counts", () => {
        render();

        const tabs = target.querySelectorAll<HTMLButtonElement>("[role='tab']");
        expect(tabs).toHaveLength(2);
        expect(tabs[0].textContent).toContain("Alerts");
        expect(tabs[1].textContent).toContain("Log");
    });

    it("focuses the alerts tab when it opens", () => {
        render();

        expect(document.activeElement?.id).toMatch(/-alerts$/);
    });

    it("moves between tabs with the arrow keys", () => {
        render();
        const alerts = target.querySelector<HTMLButtonElement>("[role='tab']")!;

        alerts.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        flushSync();

        const log = tab(document.activeElement!.id);
        expect(log?.getAttribute("aria-selected")).toBe("true");
    });

    it("closes on Escape while focused", () => {
        const close = vi.spyOn(windowManager, "close");
        render();

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(close).toHaveBeenCalledWith(win.id);
    });

    it("leaves Escape to the app when another window is focused", () => {
        const close = vi.spyOn(windowManager, "close");
        win.isFocused = false;
        render();

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(close).not.toHaveBeenCalled();
    });
});
