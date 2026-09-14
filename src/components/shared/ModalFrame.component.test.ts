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

/*
 * FEAT-0346 — ModalFrame renders no markup of its own (FEAT-0044); it opens a
 * backing ModalFrameWindow on the shared WindowManager and must close exactly
 * what it opened. This is the lifecycle floor every modal in the app stands on,
 * and a leaked or unclosed window is invisible in component-level tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const { openSpy, closeSpy, instances } = vi.hoisted(() => ({
    openSpy: vi.fn(),
    closeSpy: vi.fn(),
    instances: [] as Array<{ id: string; title: string; enableBurningBorders: boolean }>,
}));

vi.mock("../../lib/windows/WindowManager.svelte", () => ({
    windowManager: { open: openSpy, close: closeSpy },
}));

vi.mock("../../lib/windows/implementations/ModalFrameWindow.svelte", () => ({
    ModalFrameWindow: class {
        id = "modal-frame-1";
        title: string;
        enableBurningBorders = false;
        constructor(options: { title: string }) {
            this.title = options.title;
            instances.push(this);
        }
    },
}));

const settingsMock = vi.hoisted(() => ({ burnModals: false }));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

import ModalFrame from "./ModalFrame.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    instances.length = 0;
    settingsMock.burnModals = false;
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0346 — ModalFrame opens and closes its backing window", () => {
    it("registers a window while open", () => {
        component = mount(ModalFrame, {
            target: host,
            props: { isOpen: true, title: "Adjust margin" },
        }) as never;
        flushSync();

        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(instances).toHaveLength(1);
        expect(instances[0].title).toBe("Adjust margin");
    });

    it("closes the window it opened when unmounted", () => {
        component = mount(ModalFrame, {
            target: host,
            props: { isOpen: true, title: "Adjust margin" },
        }) as never;
        flushSync();

        unmount(component as never);
        component = null;
        flushSync();

        expect(closeSpy).toHaveBeenCalledTimes(1);
        expect(closeSpy).toHaveBeenCalledWith("modal-frame-1");
    });

    it("opens nothing while closed", () => {
        component = mount(ModalFrame, {
            target: host,
            props: { isOpen: false, title: "Hidden" },
        }) as never;
        flushSync();

        expect(openSpy).not.toHaveBeenCalled();
        expect(instances).toHaveLength(0);
    });

    it("mirrors the global burn-borders setting onto the window", () => {
        settingsMock.burnModals = true;
        component = mount(ModalFrame, {
            target: host,
            props: { isOpen: true, title: "Adjust margin" },
        }) as never;
        flushSync();

        expect(instances[0].enableBurningBorders).toBe(true);
    });
});
