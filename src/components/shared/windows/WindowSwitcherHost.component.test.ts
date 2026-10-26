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
import { mount, unmount, flushSync } from "svelte";
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

import WindowSwitcherHost from "./WindowSwitcherHost.svelte";
import { WindowBase } from "../../../lib/windows/WindowBase.svelte";
import { windowManager } from "../../../lib/windows/WindowManager.svelte";
import { windowSwitcherState } from "../../../stores/windowSwitcher.svelte";
import EmptyStub from "../../../tests/helpers/EmptyStub.svelte";

class TestWindow extends WindowBase {
    constructor(id: string, title: string) {
        super({ id, title, windowType: "chart" });
    }

    get component() {
        return EmptyStub;
    }
}

let host: HTMLElement | null = null;
let component: ReturnType<typeof mount> | null = null;

function render(): HTMLElement {
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(WindowSwitcherHost, { target: host });
    flushSync();
    return host;
}

function openWindow(id: string, title: string): TestWindow {
    const win = new TestWindow(id, title);
    windowManager.open(win);
    return win;
}

beforeEach(() => {
    localStorage.clear();
    windowSwitcherState.close();
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

describe("FEAT-0737: the window-switcher host", () => {
    it("renders nothing while the overlay is closed", () => {
        const target = render();

        expect(target.querySelector('[role="dialog"]')).toBeNull();
    });

    it("mounts and unmounts the overlay with the store", () => {
        openWindow("host-a", "Alpha");
        const target = render();

        windowSwitcherState.open();
        flushSync();
        expect(target.querySelector('[role="dialog"]')).not.toBeNull();

        windowSwitcherState.close();
        flushSync();
        expect(target.querySelector('[role="dialog"]')).toBeNull();
    });

    it("snapshots on open and refreshes on the next open", () => {
        openWindow("host-a", "Alpha");
        const target = render();

        windowSwitcherState.open();
        flushSync();
        expect(target.querySelectorAll('[role="option"]')).toHaveLength(1);

        openWindow("host-b", "Bravo");
        flushSync();
        expect(target.querySelectorAll('[role="option"]')).toHaveLength(1);

        windowSwitcherState.close();
        flushSync();
        windowSwitcherState.open();
        flushSync();
        expect(target.querySelectorAll('[role="option"]')).toHaveLength(2);
    });
});
