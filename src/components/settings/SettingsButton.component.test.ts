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
 * FEAT-0346 — SettingsButton is the gear that opens Settings. It must be named
 * for screen readers and do exactly one thing on click.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("svelte-i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => lookup(key) ?? key) };
});

const uiMock = vi.hoisted(() => ({ toggleSettingsModal: vi.fn() }));
vi.mock("../../stores/ui.svelte", () => ({ uiState: uiMock }));

import SettingsButton from "./SettingsButton.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("FEAT-0346 — SettingsButton opens Settings", () => {
    it("asks the UI store to show the settings modal", () => {
        component = mount(SettingsButton, { target: host }) as never;
        flushSync();

        host.querySelector("button")?.click();

        expect(uiMock.toggleSettingsModal).toHaveBeenCalledWith(true);
    });

    it("is named by its translated title", () => {
        component = mount(SettingsButton, { target: host }) as never;
        flushSync();

        const button = host.querySelector("button");
        expect(button?.getAttribute("aria-label")).toBe(lookup("settings.title"));
        expect(button?.getAttribute("title")).toBe(lookup("settings.title"));
    });
});
